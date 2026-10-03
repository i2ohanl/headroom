// Screen 3: review what the AI found, edit anything, save to your own copy.
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatCode, normalizeCode, pluralise, type DraftAssignment } from "@/lib/courses";
import { ReviewForm } from "./review-form";

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
  const skippedTitles = skipped === undefined ? [] : Array.isArray(skipped) ? skipped : [skipped];

  const supabase = await createClient();
  const isUuid = draftId && /^[0-9a-f-]{36}$/i.test(draftId);
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
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 pt-6 pb-16">
        <section
          aria-labelledby="gone-title"
          className="flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed border-sand-400 bg-sand-100 px-8 py-14 text-center"
        >
          <span className="flex size-14 items-center justify-center rounded-full bg-sage-200 text-sage-700">
            <FileQuestion className="size-6" aria-hidden />
          </span>
          <h1 id="gone-title" className="text-2xl">
            This review isn&apos;t available
          </h1>
          <p className="max-w-md text-muted-foreground">
            It may have been saved already, or the link is out of date. Add the assignment again from My courses.
          </p>
          <Link href="/courses" className={cn(buttonVariants(), "mt-2 h-12 px-6 text-base")}>
            Back to my courses
          </Link>
        </section>
      </main>
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
      <ReviewForm draftId={draft.id} initial={assignments} />
    </main>
  );
}
