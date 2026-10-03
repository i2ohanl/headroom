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
