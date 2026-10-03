// Reads one assignment's PDFs with Claude and stores the result as a draft for the review
// screen. Nothing shared is written here; that happens when the student saves the draft.
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { extractAssignments, type ExtractedAssignment } from "@/lib/extraction";
import {
  isValidCode,
  normalizeCode,
  titleKey,
  UPLOAD_LIMITS,
  type DraftAssignment,
} from "@/lib/courses";

export const maxDuration = 120;

export type ExtractResponse =
  | { status: "ok"; draftId: string; skipped: string[] }
  | {
      status: "duplicate";
      existing: { id: string; title: string; due_date: string | null; weight_pct: number | null }[];
    }
  | { status: "unreadable"; error: string }
  | { status: "error"; error: string };

function respond(body: ExtractResponse, status = 200) {
  return Response.json(body, { status });
}

function cleanDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? value
    : null;
}

function cleanWeight(value: string | null) {
  const match = value ? /(\d+(?:\.\d+)?)\s*%/.exec(value) : null;
  const n = match ? Number(match[1]) : NaN;
  return n >= 0 && n <= 100 ? n : null;
}

const toHalfHour = (n: number) => Math.round(Math.max(0, n) * 2) / 2;

function clean(a: ExtractedAssignment): DraftAssignment {
  return {
    title: a.title.trim() || "Untitled assignment",
    due_date: cleanDate(a.due_date),
    weight_pct: cleanWeight(a.weighting),
    tasks: a.tasks
      .filter((t) => t.name.trim())
      .map((t) => {
        const lo = toHalfHour(t.hours_lo);
        const hi = Math.max(toHalfHour(t.hours_hi), lo + 0.5); // always a range
        return { name: t.name.trim(), description: t.description.trim(), hours_lo: lo, hours_hi: hi };
      }),
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return respond({ status: "error", error: "Please sign in again." }, 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respond({ status: "error", error: "That upload didn't arrive intact. Try again." }, 400);
  }

  const code = normalizeCode(String(form.get("code") ?? ""));
  const courseName = String(form.get("courseName") ?? "").trim();
  if (!isValidCode(code)) return respond({ status: "error", error: "That course code isn't valid." }, 400);

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0 || files.length > UPLOAD_LIMITS.maxFiles) {
    return respond({ status: "error", error: `Add between 1 and ${UPLOAD_LIMITS.maxFiles} PDF files.` }, 400);
  }
  if (files.reduce((sum, f) => sum + f.size, 0) > UPLOAD_LIMITS.maxTotalBytes) {
    return respond({ status: "error", error: "Those files are too large. The limit is 20 MB in total." }, 413);
  }

  const pdfs: { name: string; data: Buffer }[] = [];
  for (const file of files) {
    const data = Buffer.from(await file.arrayBuffer());
    if (data.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return respond({ status: "unreadable", error: `${file.name} isn't a PDF.` }, 422);
    }
    pdfs.push({ name: file.name, data });
  }

  const { data: course, error: courseError } = await supabase
    .from("courses")
    .select("code, assignments(id, title, due_date, weight_pct)")
    .eq("code", code)
    .maybeSingle();
  if (courseError) return respond({ status: "error", error: "We couldn't check that course. Try again." }, 500);
  if (!course && !courseName) {
    return respond({ status: "error", error: "Enter a name for the new course." }, 400);
  }

  let extracted;
  try {
    extracted = (await extractAssignments(pdfs)).result;
  } catch (e) {
    console.error("Extraction failed", e instanceof Anthropic.APIError ? e.status : e);
    return respond(
      { status: "error", error: "We couldn't read these files right now. Try again in a moment." },
      502,
    );
  }

  if (!extracted.is_assignment_material || extracted.assignments.length === 0) {
    return respond({
      status: "unreadable",
      error: extracted.error ?? "These files don't look like assignment materials.",
    }, 422);
  }

  // An assignment already in the course is offered instead of creating a duplicate.
  const known = new Map((course?.assignments ?? []).map((a) => [titleKey(a.title), a]));
  const fresh: DraftAssignment[] = [];
  const existing: NonNullable<typeof course>["assignments"] = [];
  for (const a of extracted.assignments.map(clean)) {
    const match = known.get(titleKey(a.title));
    if (match) existing.push(match);
    else {
      fresh.push(a);
      known.set(titleKey(a.title), { id: "", title: a.title, due_date: null, weight_pct: null });
    }
  }
  if (fresh.length === 0) return respond({ status: "duplicate", existing });

  const { data: draft, error: draftError } = await supabase
    .from("extraction_drafts")
    .insert({
      user_id: user.id,
      course_code: code,
      course_name: course ? null : courseName,
      payload: fresh,
    })
    .select("id")
    .single();
  if (draftError) return respond({ status: "error", error: "We couldn't save the result. Try again." }, 500);

  return respond({ status: "ok", draftId: draft.id, skipped: existing.map((a) => a.title) });
}
