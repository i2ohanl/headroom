import type { SupabaseClient } from "@supabase/supabase-js";
import type { MyAssignment } from "@/lib/courses";

type TaskRow = { name: string; description: string | null; hours_lo: number; hours_hi: number; position: number };
type AssignmentRow = {
  id: string;
  title: string;
  due_date: string | null;
  weight_pct: number | null;
  position: number;
  tasks: TaskRow[];
};

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;
const toTask = (t: TaskRow) => ({
  name: t.name,
  description: t.description ?? "",
  hours_lo: Number(t.hours_lo),
  hours_hi: Number(t.hours_hi),
});

// The student's version of every assignment in a course: their own copy where they have edited
// (a null column in the edit row means "keep the shared value"; their task list replaces the
// shared one when they have saved any tasks), the shared suggestion otherwise.
// Row-level security means the edit tables only ever return this student's rows.
export async function getMyAssignments(
  supabase: SupabaseClient,
  code: string,
): Promise<{ course: { code: string; name: string } | null; enrolled: boolean; assignments: MyAssignment[] }> {
  const { data: course, error } = await supabase
    .from("courses")
    .select("code, name, assignments(id, title, due_date, weight_pct, position, tasks(name, description, hours_lo, hours_hi, position))")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(`Could not load the course: ${error.message}`);
  if (!course) return { course: null, enrolled: false, assignments: [] };

  const shared = course.assignments as AssignmentRow[];
  const ids = shared.map((a) => a.id);

  const [enrolment, edits, myTasks] = await Promise.all([
    supabase.from("enrolments").select("course_code").eq("course_code", code).maybeSingle(),
    ids.length
      ? supabase.from("student_assignment_edits").select("assignment_id, title, due_date, weight_pct").in("assignment_id", ids)
      : { data: [], error: null },
    ids.length
      ? supabase
          .from("student_tasks")
          .select("assignment_id, name, description, hours_lo, hours_hi, position")
          .in("assignment_id", ids)
      : { data: [], error: null },
  ]);
  for (const r of [enrolment, edits, myTasks]) {
    if (r.error) throw new Error(`Could not load your estimates: ${r.error.message}`);
  }

  const editFor = new Map((edits.data ?? []).map((e) => [e.assignment_id as string, e]));
  const tasksFor = new Map<string, (TaskRow & { assignment_id: string })[]>();
  for (const t of (myTasks.data ?? []) as (TaskRow & { assignment_id: string })[]) {
    tasksFor.set(t.assignment_id, [...(tasksFor.get(t.assignment_id) ?? []), t]);
  }

  const assignments = shared.map((a): MyAssignment => {
    const edit = editFor.get(a.id);
    const mine = (tasksFor.get(a.id) ?? []).sort(byPosition);
    const tasks = mine.length > 0 ? mine : [...a.tasks].sort(byPosition);
    return {
      id: a.id,
      edited: Boolean(edit),
      title: edit?.title ?? a.title,
      due_date: edit?.due_date ?? a.due_date,
      weight_pct: edit?.weight_pct ?? a.weight_pct,
      tasks: tasks.map(toTask),
      shared: { due_date: a.due_date, weight_pct: a.weight_pct, task_count: a.tasks.length },
    };
  });
  assignments.sort((x, y) => {
    if (x.due_date && y.due_date) return x.due_date.localeCompare(y.due_date);
    if (x.due_date) return -1;
    if (y.due_date) return 1;
    return 0;
  });

  return { course, enrolled: Boolean(enrolment.data), assignments };
}
