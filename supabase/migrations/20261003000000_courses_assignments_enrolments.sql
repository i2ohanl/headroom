-- Headroom: courses, assignments, tasks, enrolments, per-student edits, clash checker RPCs.
-- PROPOSED. Not applied. Review before running (SQL editor or `supabase db push`).

-- ---------------------------------------------------------------------------
-- Shared data: one copy per course, visible to every signed-in student.
-- ---------------------------------------------------------------------------

create table public.courses (
  code        text primary key
              check (code = upper(regexp_replace(code, '\s', '', 'g')) and code <> ''),
  name        text not null,
  is_demo     boolean not null default false,          -- seeded cohort; UI shows "DEMO DATA"
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.assignments (
  id          uuid primary key default gen_random_uuid(),
  course_code text not null references public.courses (code) on delete cascade,
  title       text not null,
  due_date    date,                                    -- null = document did not state one
  weight_pct  numeric(5,2) check (weight_pct is null or weight_pct between 0 and 100),
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index assignments_course_idx on public.assignments (course_code);
create index assignments_due_idx on public.assignments (due_date);

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  name          text not null,
  hours_lo      numeric(5,1) not null check (hours_lo >= 0),
  hours_hi      numeric(5,1) not null,
  position      int not null default 0,
  check (hours_hi >= hours_lo)
);
create index tasks_assignment_idx on public.tasks (assignment_id);

-- ---------------------------------------------------------------------------
-- Enrolment: the set of courses a student has added. No separate flow.
-- added_at is the plan's start date for that course (feature 4).
-- ---------------------------------------------------------------------------

create table public.enrolments (
  user_id     uuid not null references auth.users (id) on delete cascade,
  course_code text not null references public.courses (code) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (user_id, course_code)
);
create index enrolments_course_idx on public.enrolments (course_code);

-- ---------------------------------------------------------------------------
-- A student's own edits (feature 3). Copy-on-write per assignment:
--   * No row here  -> the student sees the shared assignment and tasks.
--   * A row here   -> that row replaces title/due/weight (null column = keep shared value),
--                     and student_tasks rows for the same pair replace the shared task list.
-- Also where a student's answer for a missing due date lives.
-- ---------------------------------------------------------------------------

create table public.student_assignment_edits (
  user_id       uuid not null references auth.users (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  title         text,
  due_date      date,
  weight_pct    numeric(5,2) check (weight_pct is null or weight_pct between 0 and 100),
  updated_at    timestamptz not null default now(),
  primary key (user_id, assignment_id)
);

create table public.student_tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  assignment_id uuid not null,
  name          text not null,
  hours_lo      numeric(5,1) not null check (hours_lo >= 0),
  hours_hi      numeric(5,1) not null,
  position      int not null default 0,
  check (hours_hi >= hours_lo),
  foreign key (user_id, assignment_id)
    references public.student_assignment_edits (user_id, assignment_id) on delete cascade
);
create index student_tasks_idx on public.student_tasks (user_id, assignment_id);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.courses                  enable row level security;
alter table public.assignments              enable row level security;
alter table public.tasks                    enable row level security;
alter table public.enrolments               enable row level security;
alter table public.student_assignment_edits enable row level security;
alter table public.student_tasks            enable row level security;

-- Shared defaults: any signed-in student can read. Anonymous visitors get nothing
-- from these tables; the clash checker goes through the functions below.
create policy courses_read     on public.courses     for select to authenticated using (true);
create policy assignments_read on public.assignments for select to authenticated using (true);
create policy tasks_read       on public.tasks       for select to authenticated using (true);

-- Create-only: a student can create a course and fill in its assignments/tasks, but
-- only the course they created, and nobody can update or delete shared rows from the
-- client ("generated once, shared as the default"). Demo courses are service-role only.
create policy courses_insert on public.courses for insert to authenticated
  with check (created_by = (select auth.uid()) and not is_demo);

create policy assignments_insert on public.assignments for insert to authenticated
  with check (exists (
    select 1 from public.courses c
    where c.code = course_code and c.created_by = (select auth.uid())
  ));

create policy tasks_insert on public.tasks for insert to authenticated
  with check (exists (
    select 1 from public.assignments a
    join public.courses c on c.code = a.course_code
    where a.id = assignment_id and c.created_by = (select auth.uid())
  ));

-- Enrolments: students see and add only their own. (No delete policy: removing a
-- course is not a listed feature.)
create policy enrolments_read   on public.enrolments for select to authenticated
  using (user_id = (select auth.uid()));
create policy enrolments_insert on public.enrolments for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Personal edits: fully private to the owner.
create policy edits_all on public.student_assignment_edits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy student_tasks_all on public.student_tasks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Public clash checker: aggregate counts only.
-- Anonymous users have no table access. They can only call these two functions,
-- which run as the table owner (security definer) and return counts, never rows
-- about a student. The clash window and threshold are parameters; the app passes
-- its named constants (3 days, 1 deadline). Semester start/length also come from
-- app config.
-- ---------------------------------------------------------------------------

-- Course header for the checker: name, demo flag and cohort size.
create function public.check_course_info(p_code text)
returns table (code text, name text, is_demo boolean, student_count bigint)
language sql stable security definer set search_path = ''
as $$
  select c.code, c.name, c.is_demo,
         (select count(*) from public.enrolments e where e.course_code = c.code)
  from public.courses c
  where c.code = upper(regexp_replace(p_code, '\s', '', 'g'));
$$;

-- One row per day of the semester: how many of this course's students would clash
-- if its deadline fell on that day, out of how many are enrolled. The heatmap draws
-- every row; the slider just reads the row for the selected day, so both use the
-- same calculation.
-- A student clashes on day D if they have >= p_min_deadlines deadlines in OTHER
-- courses within p_window_days either side of D. A student's own edited due date
-- wins over the shared one.
-- Returns no rows if the cohort is smaller than p_min_cohort, so a tiny group can't
-- be used to infer an individual.
create function public.clash_heatmap(
  p_code          text,
  p_semester_start date,
  p_semester_days  int,
  p_window_days    int default 3,
  p_min_deadlines  int default 1,
  p_min_cohort     int default 3
)
returns table (day date, clashing bigint, total bigint)
language sql stable security definer set search_path = ''
as $$
  with code as (
    select upper(regexp_replace(p_code, '\s', '', 'g')) as c
  ),
  cohort as (
    select e.user_id from public.enrolments e, code where e.course_code = code.c
  ),
  total as (select count(*) as n from cohort),
  other_deadlines as (
    select e.user_id, coalesce(se.due_date, a.due_date) as due
    from public.enrolments e
    join cohort using (user_id)
    join public.assignments a on a.course_code = e.course_code
    left join public.student_assignment_edits se
           on se.user_id = e.user_id and se.assignment_id = a.id
    where e.course_code <> (select c from code)
      and coalesce(se.due_date, a.due_date) is not null
  )
  select g.day::date,
         (select count(*) from (
            select o.user_id from other_deadlines o
            where o.due between g.day::date - p_window_days and g.day::date + p_window_days
            group by o.user_id
            having count(*) >= p_min_deadlines
          ) x),
         (select n from total)
  from generate_series(p_semester_start, p_semester_start + (p_semester_days - 1), interval '1 day') as g(day)
  where (select n from total) >= p_min_cohort;
$$;

revoke all on function public.check_course_info(text) from public;
revoke all on function public.clash_heatmap(text, date, int, int, int, int) from public;
grant execute on function public.check_course_info(text) to anon, authenticated;
grant execute on function public.clash_heatmap(text, date, int, int, int, int) to anon, authenticated;
