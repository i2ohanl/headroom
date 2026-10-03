// Screen 1: Sign-in. One job: get an email address and send the sign-in link.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignInForm } from "./sign-in-form";

const EXAMPLE_STEPS = [
  "Add a course, then upload an assignment's brief and rubric",
  "See every assignment with an hour estimate",
  "Spot your busiest weeks before they arrive",
];

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/courses");

  const { error } = await searchParams;

  return (
    <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 px-6 py-12 md:grid-cols-2">
      <div className="flex flex-col gap-6">
        <span className="font-heading text-2xl text-terracotta-700">Headroom</span>
        <h1 className="text-4xl leading-tight md:text-5xl">
          Know your busiest weeks before they arrive.
        </h1>
        <p className="text-lg text-muted-foreground">
          Add your courses and Headroom shows when the deadlines pile up and how many hours each
          one will really take.
        </p>
        <SignInForm initialError={error === "link"} />
        <Link
          href="/check"
          className="text-sm text-sage-700 underline underline-offset-4 hover:text-sage-800"
        >
          Lecturer? Check a due date for clashes
        </Link>
      </div>

      <aside className="rounded-3xl bg-card p-8 shadow-md" aria-label="Example">
        <span className="inline-block rounded-full bg-sand-300 px-3 py-1 text-xs font-medium tracking-wide text-sand-800 uppercase">
          Example
        </span>
        <ol className="mt-6 flex flex-col gap-5">
          {EXAMPLE_STEPS.map((step, i) => (
            <li key={step} className="flex items-center gap-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sage text-sm font-medium text-cream">
                {i + 1}
              </span>
              <span className="text-base">{step}</span>
            </li>
          ))}
        </ol>
      </aside>
    </main>
  );
}
