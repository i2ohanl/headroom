// Placeholder landing page for feature 1. The real My courses screen is feature 2.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function CoursesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-4xl">My courses</h1>
      <p className="text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{user.email}</span>
      </p>
      <form action="/auth/sign-out" method="post">
        <Button type="submit" variant="outline" className="h-10 px-5">
          Sign out
        </Button>
      </form>
    </main>
  );
}
