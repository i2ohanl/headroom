"use client";

// Error state for My courses.
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CoursesError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 pt-6 pb-16">
      <h1 className="text-4xl">My courses</h1>
      <div
        role="alert"
        className="flex flex-col items-start gap-4 rounded-3xl bg-sand-200 p-8"
      >
        <TriangleAlert className="size-7 text-terracotta-700" aria-hidden />
        <h2 className="text-2xl">We couldn&apos;t load your courses</h2>
        <p className="text-muted-foreground">
          Something went wrong on our side. Your courses are safe. Try again in a moment.
        </p>
        <Button onClick={reset} className="h-11 px-6 text-base">
          Try again
        </Button>
      </div>
    </main>
  );
}
