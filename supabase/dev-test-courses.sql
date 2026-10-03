-- DEV ONLY: a few hand-made courses so code lookup can be tested before the seed script exists.
-- Run in the Supabase dashboard SQL editor AFTER the migration. The editor runs as the
-- database owner, so it bypasses row-level security (created_by stays null).
-- Safe to re-run: it deletes and recreates these three courses (assignments and tasks cascade).

delete from public.courses where code in ('PSYC210', 'STAT230', 'ENVS301');

insert into public.courses (code, name) values
  ('PSYC210', 'Research Methods'),
  ('STAT230', 'Applied Regression'),
  ('ENVS301', 'Watershed Systems');

insert into public.assignments (id, course_code, title, due_date, weight_pct, position) values
  ('00000000-0000-0000-0000-000000000001', 'PSYC210', 'Ethics module quiz',     '2027-01-22',  5, 1),
  ('00000000-0000-0000-0000-000000000002', 'PSYC210', 'Literature review',      '2027-02-12', 20, 2),
  ('00000000-0000-0000-0000-000000000003', 'PSYC210', 'Midterm exam',           '2027-03-03', 25, 3),
  ('00000000-0000-0000-0000-000000000004', 'PSYC210', 'Study proposal',         '2027-03-19', 20, 4),
  ('00000000-0000-0000-0000-000000000005', 'PSYC210', 'Final research report',  '2027-04-02', 30, 5),
  ('00000000-0000-0000-0000-000000000011', 'STAT230', 'Problem set 1',          '2027-01-29', 10, 1),
  ('00000000-0000-0000-0000-000000000012', 'STAT230', 'Regression project',     '2027-04-02', 40, 2),
  -- A missing due date, to test the "Date to be confirmed" row:
  ('00000000-0000-0000-0000-000000000021', 'ENVS301', 'Field report',           '2027-02-05', 25, 1),
  ('00000000-0000-0000-0000-000000000022', 'ENVS301', 'Watershed policy brief', null,         15, 2);

-- Tasks are not shown in the add-course modal yet (they appear in feature 3's review screen),
-- but add a few so that screen has data to show later.
insert into public.tasks (assignment_id, name, hours_lo, hours_hi, position) values
  ('00000000-0000-0000-0000-000000000002', 'Find and read sources',      6, 9, 1),
  ('00000000-0000-0000-0000-000000000002', 'Write and edit the review',  5, 8, 2),
  ('00000000-0000-0000-0000-000000000012', 'Clean and explore the data', 6, 9, 1),
  ('00000000-0000-0000-0000-000000000012', 'Fit and check models',       8, 12, 2),
  ('00000000-0000-0000-0000-000000000012', 'Write the report',           8, 12, 3),
  ('00000000-0000-0000-0000-000000000021', 'Clean and chart sample data', 4, 6, 1),
  ('00000000-0000-0000-0000-000000000021', 'Write and edit report',       5, 7, 2);
