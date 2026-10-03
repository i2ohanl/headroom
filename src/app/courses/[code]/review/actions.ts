"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeCode, type DraftAssignment } from "@/lib/courses";

export type SaveResult = { status: "saved" } | { status: "invalid"; message: string } | { status: "error" };

const isDate = (v: string | null) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v);

// Saves the reviewed assignments. The shared defaults come from the stored draft inside the
// save_draft function; what we send here becomes the student's own copy where it differs.
function validate(assignments: DraftAssignment[]): SaveResult | null {
  for (const a of assignments) {
    if (!a.title.trim()) return { status: "invalid", message: "Every assignment needs a title." };
    if (!isDate(a.due_date)) return { status: "invalid", message: "Check the due dates." };
    if (a.weight_pct !== null && !(a.weight_pct >= 0 && a.weight_pct <= 100)) {
      return { status: "invalid", message: "A weight must be between 0 and 100." };
    }
    for (const t of a.tasks) {
      if (!t.name.trim()) return { status: "invalid", message: "Every task needs a name." };
      if (!(t.hours_lo >= 0) || !(t.hours_hi >= t.hours_lo)) {
        return { status: "invalid", message: "Check the hours: the second number can't be lower than the first." };
      }
    }
  }
  return null;
}

export async function saveDraft(draftId: string, assignments: DraftAssignment[]): Promise<SaveResult> {
  const invalid = validate(assignments);
  if (invalid) return invalid;

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_draft", { p_draft: draftId, p_assignments: assignments });
  if (error) {
    console.error("save_draft failed", error.message);
    return { status: "error" };
  }
  revalidatePath("/courses");
  return { status: "saved" };
}

// Saves the student's own copy of a course's assignments after the fact (feature 3b).
export async function saveMyAssignments(
  rawCode: string,
  assignments: (DraftAssignment & { id: string })[],
): Promise<SaveResult> {
  const invalid = validate(assignments);
  if (invalid) return invalid;

  const code = normalizeCode(rawCode);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_my_assignments", { p_course: code, p_assignments: assignments });
  if (error) {
    console.error("save_my_assignments failed", error.message);
    return { status: "error" };
  }
  revalidatePath("/courses");
  revalidatePath(`/courses/${code}/review`);
  return { status: "saved" };
}

// Puts one assignment back to the shared suggestion by deleting the student's own copy
// (their tasks go with it). Allowed by the existing row-level security: it only matches their rows.
export async function resetMyAssignment(assignmentId: string, rawCode: string): Promise<SaveResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("student_assignment_edits").delete().eq("assignment_id", assignmentId);
  if (error) {
    console.error("reset failed", error.message);
    return { status: "error" };
  }
  revalidatePath(`/courses/${normalizeCode(rawCode)}/review`);
  return { status: "saved" };
}
