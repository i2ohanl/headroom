// Screen 2: My courses. The header row, then one plain row per course, or an empty state.
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SEMESTER } from "@/lib/config";
import { formatCode, pluralise, type CourseSummary } from "@/lib/courses";

type EnrolmentRow = {
  added_at: string;
  courses: { code: string; name: string; is_demo: boolean; assignments: { count: number }[] } | null;
};

async function getMyCourses(): Promise<CourseSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enrolments")
    .select("added_at, courses(code, name, is_demo, assignments(count))")
    .order("added_at", { ascending: true })
    .overrideTypes<EnrolmentRow[], { merge: false }>();
  if (error) throw new Error(`Could not load your courses: ${error.message}`);

  return data.flatMap(({ courses }) =>
    courses
      ? [
          {
            code: courses.code,
            name: courses.name,
            is_demo: courses.is_demo,
            assignment_count: courses.assignments[0]?.count ?? 0,
          },
        ]
      : [],
  );
}

export function AddCourseLink({ className }: { className?: string }) {
  return (
    <Link
      href="/courses/add"
      className={cn(buttonVariants(), "h-12 gap-2 px-6 text-base", className)}
    >
      <Plus aria-hidden />
      Add a course
    </Link>
  );
}

export async function CoursesView() {
  const courses = await getMyCourses();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 pt-6 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-4xl">My courses</h1>
          <p className="text-muted-foreground">
            {SEMESTER.name} · {SEMESTER.weeks} weeks
          </p>
        </div>
        {courses.length > 0 && <AddCourseLink />}
      </div>

      {courses.length === 0 ? (
        <section
          aria-labelledby="empty-title"
          className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-sand-400 bg-sand-100 px-8 py-14 text-center"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-sage-200 text-sage-700">
            <BookOpen className="size-6" aria-hidden />
          </span>
          <h2 id="empty-title" className="text-2xl">
            No courses yet
          </h2>
          <p className="max-w-md text-muted-foreground">
            Type a course code to see its deadlines and add it. If nobody has added the course yet,
            you can add it as a new course.
          </p>
          <AddCourseLink className="mt-2" />
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {courses.map((c) => (
            <li
              key={c.code}
              className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 rounded-2xl bg-sand-200 px-7 py-5 sm:grid-cols-[8rem_1fr_auto]"
            >
              <span className="text-lg font-bold">{formatCode(c.code)}</span>
              <span className="order-3 col-span-2 text-lg sm:order-none sm:col-span-1">
                {c.name}
                {c.is_demo && (
                  <span className="ml-3 rounded-full bg-sand-300 px-2.5 py-0.5 align-middle text-xs font-semibold tracking-wide text-sand-800 uppercase">
                    Demo data
                  </span>
                )}
              </span>
              <span className="text-muted-foreground">{pluralise(c.assignment_count, "assignment")}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
