"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DraftAssignment } from "@/lib/courses";

export type SaveResult = { status: "saved" } | { status: "invalid"; message: string } | { status: "error" };

const isDate = (v: string | null) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v);

// Saves the reviewed assignments. The shared defaults come from the stored draft inside the
// save_draft function; what we send here becomes the student's own copy where it differs.
export async function saveDraft(draftId: string, assignments: DraftAssignment[]): Promise<SaveResult> {
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

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_draft", { p_draft: draftId, p_assignments: assignments });
  if (error) {
    console.error("save_draft failed", error.message);
    return { status: "error" };
  }
  revalidatePath("/courses");
  return { status: "saved" };
}
