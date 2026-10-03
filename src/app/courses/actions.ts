"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidCode, normalizeCode, type CourseDetail } from "@/lib/courses";

export type LookupResult =
  | { status: "found"; course: CourseDetail }
  | { status: "not_found"; code: string }
  | { status: "invalid" }
  | { status: "error" };

export type CourseOption = { code: string; name: string; is_demo: boolean };

export type AddResult =
  | { status: "added" }
  | { status: "not_found" }
  | { status: "error" };

// Looks up a course by code and returns its shared assignments. Reads only; adding is separate.
export async function lookupCourse(rawCode: string): Promise<LookupResult> {
  const code = normalizeCode(rawCode);
  if (!isValidCode(code)) return { status: "invalid" };

  const supabase = await createClient();
  const { data: course, error } = await supabase
    .from("courses")
    .select("code, name, is_demo, assignments(id, title, due_date, weight_pct, position)")
    .eq("code", code)
    .maybeSingle();
  if (error) return { status: "error" };
  if (!course) return { status: "not_found", code };

  // Row-level security means this only ever returns the signed-in student's own enrolment.
  const { data: enrolment, error: enrolmentError } = await supabase
    .from("enrolments")
    .select("course_code")
    .eq("course_code", code)
    .maybeSingle();
  if (enrolmentError) return { status: "error" };

  const assignments = [...course.assignments]
    .sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return a.position - b.position;
    })
    .map(({ id, title, due_date, weight_pct }) => ({ id, title, due_date, weight_pct }));

  return {
    status: "found",
    course: {
      code: course.code,
      name: course.name,
      is_demo: course.is_demo,
      assignments,
      enrolled: Boolean(enrolment),
    },
  };
}

// Adding a course is just creating the enrolment row. There is no separate enrolment flow.
export async function addCourse(rawCode: string): Promise<AddResult> {
  const code = normalizeCode(rawCode);
  if (!isValidCode(code)) return { status: "not_found" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error" };

  const { error } = await supabase
    .from("enrolments")
    .insert({ user_id: user.id, course_code: code });

  // 23505: already enrolled, which is fine. 23503: the course does not exist.
  if (error && error.code !== "23505") {
    return { status: error.code === "23503" ? "not_found" : "error" };
  }

  revalidatePath("/courses");
  return { status: "added" };
}

// Courses whose code starts with what the student has typed, for the suggestion list.
// Returns null on failure so the caller can keep working without suggestions.
export async function searchCourses(rawPrefix: string): Promise<CourseOption[] | null> {
  const prefix = normalizeCode(rawPrefix);
  if (!/^[A-Z0-9]{2,12}$/.test(prefix)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("courses")
    .select("code, name, is_demo")
    .like("code", `${prefix}%`)
    .order("code")
    .limit(8);
  return error ? null : data;
}
