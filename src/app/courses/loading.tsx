// Loading state for My courses.
import { SEMESTER } from "@/lib/config";

export default function Loading() {
  return (
    <main
      className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 pt-6 pb-16"
      aria-busy="true"
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-4xl">My courses</h1>
        <p className="text-muted-foreground">
          {SEMESTER.name} · {SEMESTER.weeks} weeks
        </p>
      </div>
      <div role="status" aria-label="Loading your courses" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[4.25rem] animate-pulse rounded-2xl bg-sand-200" />
        ))}
      </div>
    </main>
  );
}
