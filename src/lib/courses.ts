// Shared course types and small helpers. Safe to import from server and client code.

export type AssignmentSummary = {
  id: string;
  title: string;
  due_date: string | null; // YYYY-MM-DD, null when the outline did not state one
  weight_pct: number | null;
};

export type CourseSummary = {
  code: string;
  name: string;
  is_demo: boolean;
  assignment_count: number;
};

export type CourseDetail = {
  code: string;
  name: string;
  is_demo: boolean;
  assignments: AssignmentSummary[];
  enrolled: boolean; // the signed-in student already has this course
};

// Course codes are stored uppercase with no spaces or hyphens: "stat 230" -> "STAT230".
export function normalizeCode(raw: string) {
  return raw.toUpperCase().replace(/[\s\-_]+/g, "");
}

export function isValidCode(code: string) {
  return /^[A-Z0-9]{3,12}$/.test(code);
}

// "STAT230" -> "STAT 230" for display.
export function formatCode(code: string) {
  const match = /^([A-Z]+)(\d.*)$/.exec(code);
  return match ? `${match[1]} ${match[2]}` : code;
}

// "2027-02-05" -> "Fri, Feb 5". Parsed as a local date so the day never shifts with timezone.
export function formatDueDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function pluralise(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Same rule as assignments.title_key in the database: lowercase letters and digits only.
// "Assignment 1: Analysis Report" and "assignment 1 analysis report" are the same assignment.
export function titleKey(title: string) {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

// What the AI extracted, after the server has cleaned it. Stored in extraction_drafts.payload
// and edited on the review screen.
export type DraftTask = {
  name: string;
  description: string;
  hours_lo: number;
  hours_hi: number;
};

export type DraftAssignment = {
  title: string;
  due_date: string | null; // YYYY-MM-DD, null when the documents did not state one
  weight_pct: number | null;
  tasks: DraftTask[];
};

export const UPLOAD_LIMITS = {
  maxFiles: 6,
  maxTotalBytes: 20 * 1024 * 1024,
};

export function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// One assignment as the signed-in student sees it: their own copy where they have edited,
// the shared suggestion otherwise. `shared` is what they would go back to on a reset.
export type MyAssignment = DraftAssignment & {
  id: string;
  edited: boolean;
  shared: { due_date: string | null; weight_pct: number | null; task_count: number };
};
