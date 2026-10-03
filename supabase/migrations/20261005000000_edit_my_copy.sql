-- Headroom feature 3b: edit your own copy of an assignment at any time.
-- PROPOSED. Not applied. Review before running (SQL editor or `supabase db push`).
-- Run after 20261004000000_assignment_upload.sql. Not yet run against a database.
--
-- Students can already read the shared rows and read/write their OWN rows in
-- student_assignment_edits and student_tasks (the edits_all and student_tasks_all
-- policies), so no new permission is needed. What is missing is a single, all-or-nothing
-- way to save a copy: today that is "upsert the edit, delete the old tasks, insert the new
-- ones", which would be three separate calls from the app and can leave a half-saved copy.
--
-- This migration:
--  1. Moves the "store only what differs from the shared version" logic out of save_draft
--     into one helper, apply_my_copy, so the upload flow and the edit flow share it.
--  2. Replaces save_draft so it calls that helper (same behaviour as before).
--  3. Adds save_my_assignments(course, assignments) for editing after the fact.
--  4. Changes nothing about who can read or write what. Shared rows stay read-only.
--
-- Resetting an assignment to the shared suggestion needs no function: the app deletes the
-- student's own student_assignment_edits row (their student_tasks rows go with it) under
-- the existing policy.
--
-- Known limits of the "own copy" model, carried over from the first migration:
--  * An edit row's NULL title/due_date/weight_pct means "use the shared value". So a
--    student cannot clear a due date or weight the shared version has; clearing it just
--    shows the shared value again. The review screen should not offer that.
--  * A student_tasks list with zero rows means "use the shared tasks". A student cannot
--    save a copy with every task removed.

-- ---------------------------------------------------------------------------
-- 1. Helper: store p_rev as the student's copy of p_assignment, only where it differs.
--    p_rev = {title, due_date|null, weight_pct|null, tasks:[{name, description, hours_lo, hours_hi}]}
--    If nothing differs, any existing copy is removed, so the student is back on the
--    shared version.
--    Takes a user id, so it must never be callable from the client: execute is revoked
--    from everyone, and only the functions below (which pass auth.uid()) call it.
-- ---------------------------------------------------------------------------

create function public.apply_my_copy(p_user uuid, p_assignment uuid, p_rev jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_shared       public.assignments;
  v_shared_tasks jsonb;
  v_rev_tasks    jsonb;
  v_title        text;
  v_due          date;
  v_weight       numeric;
begin
  select * into v_shared from public.assignments where id = p_assignment;
  if not found then raise exception 'assignment not found' using errcode = 'P0002'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', name, 'description', description,
           'hours_lo', hours_lo, 'hours_hi', hours_hi) order by position), '[]'::jsonb)
    into v_shared_tasks from public.tasks where assignment_id = p_assignment;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', t ->> 'name', 'description', t ->> 'description',
           'hours_lo', (t ->> 'hours_lo')::numeric, 'hours_hi', (t ->> 'hours_hi')::numeric)
           order by ord), '[]'::jsonb)
    into v_rev_tasks from jsonb_array_elements(p_rev -> 'tasks') with ordinality as x(t, ord);

  v_title  := nullif(btrim(p_rev ->> 'title'), '');
  v_due    := nullif(p_rev ->> 'due_date', '')::date;
  v_weight := nullif(p_rev ->> 'weight_pct', '')::numeric;

  if v_title  is not distinct from v_shared.title
     and v_due    is not distinct from v_shared.due_date
     and v_weight is not distinct from v_shared.weight_pct
     and v_rev_tasks is not distinct from v_shared_tasks then
    delete from public.student_assignment_edits
    where user_id = p_user and assignment_id = p_assignment;   -- student_tasks cascade
    return;
  end if;

  insert into public.student_assignment_edits (user_id, assignment_id, title, due_date, weight_pct)
  values (p_user, p_assignment,
          case when v_title  is distinct from v_shared.title      then v_title  end,
          case when v_due    is distinct from v_shared.due_date   then v_due    end,
          case when v_weight is distinct from v_shared.weight_pct then v_weight end)
  on conflict (user_id, assignment_id) do update
    set title = excluded.title, due_date = excluded.due_date,
        weight_pct = excluded.weight_pct, updated_at = now();

  delete from public.student_tasks where user_id = p_user and assignment_id = p_assignment;
  if v_rev_tasks is distinct from v_shared_tasks then
    insert into public.student_tasks (user_id, assignment_id, name, description, hours_lo, hours_hi, position)
    select p_user, p_assignment, t ->> 'name', t ->> 'description',
           (t ->> 'hours_lo')::numeric, (t ->> 'hours_hi')::numeric, ord - 1
    from jsonb_array_elements(p_rev -> 'tasks') with ordinality as x(t, ord);
  end if;
end;
$$;

revoke all on function public.apply_my_copy(uuid, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. save_draft, unchanged in behaviour, now using the helper.
-- ---------------------------------------------------------------------------

create or replace function public.save_draft(p_draft uuid, p_assignments jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user    uuid := (select auth.uid());
  v_draft   public.extraction_drafts;
  v_item    jsonb;
  v_idx     int;
  v_shared  public.assignments;
  v_status  text;
  v_results jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;

  select * into v_draft from public.extraction_drafts where id = p_draft and user_id = v_user;
  if not found then raise exception 'draft not found' using errcode = 'P0002'; end if;

  if jsonb_typeof(p_assignments) <> 'array'
     or jsonb_array_length(p_assignments) <> jsonb_array_length(v_draft.payload) then
    raise exception 'reviewed assignments do not match the draft' using errcode = '22023';
  end if;

  if not exists (select 1 from public.courses where code = v_draft.course_code) then
    if coalesce(btrim(v_draft.course_name), '') = '' then
      raise exception 'course name required' using errcode = '22023';
    end if;
    insert into public.courses (code, name, created_by)
    values (v_draft.course_code, btrim(v_draft.course_name), v_user)
    on conflict (code) do nothing;
  end if;

  for v_idx in 0 .. jsonb_array_length(v_draft.payload) - 1 loop
    v_item := v_draft.payload -> v_idx;

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

    perform public.apply_my_copy(v_user, v_shared.id, p_assignments -> v_idx);

    v_results := v_results || jsonb_build_object('id', v_shared.id, 'status', v_status);
  end loop;

  insert into public.enrolments (user_id, course_code)
  values (v_user, v_draft.course_code)
  on conflict do nothing;

  delete from public.extraction_drafts where id = p_draft;

  return jsonb_build_object('course_code', v_draft.course_code, 'assignments', v_results);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Edit your copies of a course's assignments (after adding the course, or later).
--    p_assignments: [{id, title, due_date|null, weight_pct|null, tasks:[...]}]
--    Every id must belong to p_course, and the caller must have the course.
--    All assignments are saved together or not at all.
-- ---------------------------------------------------------------------------

create function public.save_my_assignments(p_course text, p_assignments jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_item jsonb;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if jsonb_typeof(p_assignments) <> 'array' then
    raise exception 'assignments must be a list' using errcode = '22023';
  end if;
  if not exists (select 1 from public.enrolments where user_id = v_user and course_code = p_course) then
    raise exception 'course not in your courses' using errcode = '42501';
  end if;

  for v_item in select * from jsonb_array_elements(p_assignments) loop
    if not exists (
      select 1 from public.assignments
      where id = (v_item ->> 'id')::uuid and course_code = p_course
    ) then
      raise exception 'assignment not in this course' using errcode = '22023';
    end if;
    perform public.apply_my_copy(v_user, (v_item ->> 'id')::uuid, v_item);
  end loop;
end;
$$;

revoke all on function public.save_my_assignments(text, jsonb) from public;
grant execute on function public.save_my_assignments(text, jsonb) to authenticated;
