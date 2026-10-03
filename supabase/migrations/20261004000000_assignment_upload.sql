-- Headroom feature 3: add an assignment by upload, review it, save it.
-- PROPOSED. Not applied. Review before running (SQL editor or `supabase db push`).
-- Not yet run against a database, so expect to fix small syntax slips on first apply.
--
-- What this changes, and why:
--  1. Tasks get a short description (new extraction field).
--  2. Assignments get a normalised title key, unique per course, so a duplicate upload
--     is caught by the database and not only by the app.
--  3. extraction_drafts holds one upload's AI result between "Read these files" and
--     "Save". The review screen reads it; the shared rows are only written on Save, so
--     there are no empty courses and no unreviewed shared rows.
--  4. Students can no longer insert into courses, assignments or tasks directly. All
--     shared writes go through save_draft(), so a student can add an assignment to a
--     course someone else created (the old policies only allowed the creator), the
--     course + assignments + tasks + enrolment are written in one transaction, and
--     the shared default is always the AI's output, never a client-supplied value.

-- ---------------------------------------------------------------------------
-- 1. Task descriptions
-- ---------------------------------------------------------------------------

alter table public.tasks         add column description text;
alter table public.student_tasks add column description text;

-- ---------------------------------------------------------------------------
-- 2. Duplicate detection: "Assignment 1: Analysis Report" = "assignment 1 analysis report"
--    The app uses the same rule (lowercase, letters and digits only) to offer the
--    existing assignment before saving. Fails to apply if the seed data already has two
--    assignments in one course whose titles normalise the same.
-- ---------------------------------------------------------------------------

alter table public.assignments
  add column title_key text generated always as
    (lower(regexp_replace(title, '[^[:alnum:]]', '', 'g'))) stored;

create unique index assignments_course_title_key on public.assignments (course_code, title_key);

-- ---------------------------------------------------------------------------
-- 3. Drafts: the AI result for one upload, private to the student who uploaded it.
--    payload is the array of extracted assignments exactly as the app received them:
--    [{title, due_date|null, weight_pct|null, tasks:[{name, description, hours_lo, hours_hi}]}]
--    course_name is set only when the course does not exist yet.
-- ---------------------------------------------------------------------------

create table public.extraction_drafts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  course_code text not null,
  course_name text,
  payload     jsonb not null check (jsonb_typeof(payload) = 'array'),
  created_at  timestamptz not null default now()
);
create index extraction_drafts_user_idx on public.extraction_drafts (user_id);

alter table public.extraction_drafts enable row level security;

-- Owner can read, create and discard their own drafts. Trade-off: because the student
-- can insert a draft, a determined user could hand-write one instead of using the AI.
-- The alternative is inserting drafts with the Supabase service-role key on the server
-- (a second secret in .env.local). Say if you want that instead.
create policy drafts_all on public.extraction_drafts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. Shared rows become write-through-function only
-- ---------------------------------------------------------------------------

drop policy courses_insert     on public.courses;
drop policy assignments_insert on public.assignments;
drop policy tasks_insert       on public.tasks;
-- Reads, enrolments_insert, the edit policies and the clash functions are unchanged.

-- Save a reviewed draft.
--   p_draft       the extraction_drafts row to save
--   p_assignments the student's reviewed values, one element per draft element, same order:
--                 [{title, due_date|null, weight_pct|null, tasks:[{name, description, hours_lo, hours_hi}]}]
-- For each draft element:
--   * if the course already has an assignment with the same title key, that one is used
--     ("existing"), and nothing shared is written;
--   * otherwise the shared assignment and tasks are created from the DRAFT (the AI output).
-- Then, if the reviewed values differ from the shared ones, they are stored as the
-- student's own copy (student_assignment_edits + student_tasks). A due date the student
-- typed for a missing one lands there too. Finally the student is enrolled and the draft
-- is deleted. The course is created here, from the draft, if it does not exist.
create function public.save_draft(p_draft uuid, p_assignments jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_draft    public.extraction_drafts;
  v_item     jsonb;
  v_rev      jsonb;
  v_idx      int;
  v_id       uuid;
  v_status   text;
  v_shared   public.assignments;
  v_shared_tasks jsonb;
  v_rev_tasks    jsonb;
  v_results  jsonb := '[]'::jsonb;
  v_title    text;
  v_due      date;
  v_weight   numeric;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;

  select * into v_draft from public.extraction_drafts where id = p_draft and user_id = v_user;
  if not found then raise exception 'draft not found' using errcode = 'P0002'; end if;

  if jsonb_typeof(p_assignments) <> 'array'
     or jsonb_array_length(p_assignments) <> jsonb_array_length(v_draft.payload) then
    raise exception 'reviewed assignments do not match the draft' using errcode = '22023';
  end if;

  -- Course: create from the draft if new (never an empty course: assignments follow below).
  if not exists (select 1 from public.courses where code = v_draft.course_code) then
    if coalesce(btrim(v_draft.course_name), '') = '' then
      raise exception 'course name required' using errcode = '22023';
    end if;
    insert into public.courses (code, name, created_by)
    values (v_draft.course_code, btrim(v_draft.course_name), v_user)
    on conflict (code) do nothing;   -- another student created it a moment ago
  end if;

  for v_idx in 0 .. jsonb_array_length(v_draft.payload) - 1 loop
    v_item := v_draft.payload -> v_idx;
    v_rev  := p_assignments  -> v_idx;

    select * into v_shared from public.assignments
    where course_code = v_draft.course_code
      and title_key = lower(regexp_replace(v_item ->> 'title', '[^[:alnum:]]', '', 'g'));

    if found then
      v_status := 'existing';
    else
      insert into public.assignments (course_code, title, due_date, weight_pct, position)
      values (v_draft.course_code, v_item ->> 'title',
              nullif(v_item ->> 'due_date', '')::date,
              nullif(v_item ->> 'weight_pct', '')::numeric,
              v_idx)
      returning * into v_shared;

      insert into public.tasks (assignment_id, name, description, hours_lo, hours_hi, position)
      select v_shared.id, t ->> 'name', t ->> 'description',
             (t ->> 'hours_lo')::numeric, (t ->> 'hours_hi')::numeric, ord - 1
      from jsonb_array_elements(v_item -> 'tasks') with ordinality as x(t, ord);
      v_status := 'created';
    end if;
    v_id := v_shared.id;

    -- The student's own copy: only what differs from the shared version.
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', name, 'description', description,
             'hours_lo', hours_lo, 'hours_hi', hours_hi) order by position), '[]'::jsonb)
      into v_shared_tasks from public.tasks where assignment_id = v_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'name', t ->> 'name', 'description', t ->> 'description',
             'hours_lo', (t ->> 'hours_lo')::numeric, 'hours_hi', (t ->> 'hours_hi')::numeric)
             order by ord), '[]'::jsonb)
      into v_rev_tasks from jsonb_array_elements(v_rev -> 'tasks') with ordinality as x(t, ord);

    v_title  := nullif(btrim(v_rev ->> 'title'), '');
    v_due    := nullif(v_rev ->> 'due_date', '')::date;
    v_weight := nullif(v_rev ->> 'weight_pct', '')::numeric;

    if v_title is distinct from v_shared.title
       or v_due is distinct from v_shared.due_date
       or v_weight is distinct from v_shared.weight_pct
       or v_rev_tasks is distinct from v_shared_tasks then

      insert into public.student_assignment_edits (user_id, assignment_id, title, due_date, weight_pct)
      values (v_user, v_id,
              case when v_title  is distinct from v_shared.title      then v_title  end,
              case when v_due    is distinct from v_shared.due_date   then v_due    end,
              case when v_weight is distinct from v_shared.weight_pct then v_weight end)
      on conflict (user_id, assignment_id) do update
        set title = excluded.title, due_date = excluded.due_date,
            weight_pct = excluded.weight_pct, updated_at = now();

      delete from public.student_tasks where user_id = v_user and assignment_id = v_id;
      if v_rev_tasks is distinct from v_shared_tasks then
        insert into public.student_tasks (user_id, assignment_id, name, description, hours_lo, hours_hi, position)
        select v_user, v_id, t ->> 'name', t ->> 'description',
               (t ->> 'hours_lo')::numeric, (t ->> 'hours_hi')::numeric, ord - 1
        from jsonb_array_elements(v_rev -> 'tasks') with ordinality as x(t, ord);
      end if;
    end if;

    v_results := v_results || jsonb_build_object('id', v_id, 'status', v_status);
  end loop;

  insert into public.enrolments (user_id, course_code)
  values (v_user, v_draft.course_code)
  on conflict do nothing;

  delete from public.extraction_drafts where id = p_draft;

  return jsonb_build_object('course_code', v_draft.course_code, 'assignments', v_results);
end;
$$;

revoke all on function public.save_draft(uuid, jsonb) from public;
grant execute on function public.save_draft(uuid, jsonb) to authenticated;
