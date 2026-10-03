// Screen 3: review assignments and edit them. Two ways in:
//   ?draft=<id>   right after an upload: what the AI found, not yet saved.
//   (no draft)    the student's own version of a course they have added: their copy where
//                 they have edited, the shared suggestion otherwise.
// Saving only ever writes to the student's own copy.
import Link from "next/link";
import { FileQuestion, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getMyAssignments } from "@/lib/my-assignments";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCode, normalizeCode, pluralise, type DraftAssignment } from "@/lib/courses";
import { ReviewForm } from "./review-form";

function Unavailable({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pt-6 pb-16">
      <section
        aria-labelledby="gone-title"
        className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-sand-400 bg-sand-100 px-8 py-14 text-center"
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-sage-200 text-sage-700">
          <FileQuestion className="size-6" aria-hidden />
        </span>
        <h1 id="gone-title" className="text-2xl">
          {title}
        </h1>
        <p className="max-w-md text-muted-foreground">{body}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          {action && (
            <Link href={action.href} className={cn(buttonVariants(), "h-12 gap-2 px-6 text-base")}>
              <Plus aria-hidden />
              {action.label}
            </Link>
          )}
          <Link
            href="/courses"
            className={cn(buttonVariants({ variant: action ? "outline" : "default" }), "h-12 px-6 text-base")}
          >
            Back to my courses
          </Link>
        </div>
      </section>
    </main>
  );
}

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ draft?: string; skipped?: string | string[] }>;
}) {
  const { code: rawCode } = await params;
  const { draft: draftId, skipped } = await searchParams;
  const code = normalizeCode(rawCode);
  const supabase = await createClient();

  // ---- Your own version of a course you have added
  if (!draftId) {
    const { course, enrolled, assignments } = await getMyAssignments(supabase, code);
    if (!course || !enrolled) {
      return (
        <Unavailable
          title="This course isn't in your courses"
          body="Add it from My courses first, then you can edit your estimates for it."
        />
      );
    }
    if (assignments.length === 0) {
      return (
        <Unavailable
          title="No assignments yet"
          body={`${formatCode(code)} doesn't have any assignments yet. Add one by uploading its PDFs.`}
          action={{ href: `/courses/add?code=${code}`, label: "Add an assignment" }}
        />
      );
    }
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-7 px-6 pt-6 pb-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-1 basis-96 flex-col gap-1">
            <h1 className="text-4xl">Your estimates</h1>
            <p className="text-muted-foreground">
              {formatCode(code)} · {course.name} · {pluralise(assignments.length, "assignment")}. These start as the
              suggested estimates. Change anything to fit how you work. Your changes are only yours.
            </p>
          </div>
          <Link href={`/courses/add?code=${code}`} className={cn(buttonVariants({ variant: "outline" }), "h-12 gap-2 px-6 text-base")}>
            <Plus aria-hidden />
            Add an assignment
          </Link>
        </div>
        <ReviewForm
          key={assignments.map((a) => `${a.id}:${a.edited}`).join()}
          mode="mine"
          code={code}
          initial={assignments}
        />
      </main>
    );
  }

  // ---- Right after an upload
  const skippedTitles = skipped === undefined ? [] : Array.isArray(skipped) ? skipped : [skipped];
  const isUuid = /^[0-9a-f-]{36}$/i.test(draftId);
  const { data: draft, error } = isUuid
    ? await supabase
        .from("extraction_drafts")
        .select("id, course_code, course_name, payload")
        .eq("id", draftId)
        .eq("course_code", code)
        .maybeSingle()
    : { data: null, error: null };
  if (error) throw new Error(`Could not load the review: ${error.message}`);

  if (!draft) {
    return (
      <Unavailable
        title="This review isn't available"
        body="It may have been saved already, or the link is out of date. Add the assignment again from My courses."
      />
    );
  }

  let courseName = draft.course_name;
  if (!courseName) {
    const { data: course } = await supabase.from("courses").select("name").eq("code", code).maybeSingle();
    courseName = course?.name ?? null;
  }
  const assignments = draft.payload as DraftAssignment[];

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-7 px-6 pt-6 pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-4xl">Check what we found</h1>
        <p className="text-muted-foreground">
          {formatCode(code)}
          {courseName ? ` · ${courseName}` : ""} · {pluralise(assignments.length, "assignment")} found. Every field is
          editable, and your changes are only yours.
        </p>
      </div>
      {skippedTitles.length > 0 && (
        <p className="rounded-2xl bg-sage-100 px-5 py-3 text-sage-800">
          Already in {formatCode(code)}, so not added again: {skippedTitles.join(", ")}.
        </p>
      )}
      <ReviewForm mode="draft" draftId={draft.id} initial={assignments} />
    </main>
  );
}
