// Signed-in header: brand, navigation, who you are, and sign out.
import Link from "next/link";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppHeader({ email }: { email: string | undefined }) {
  return (
    <header className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-8 gap-y-2 px-6 py-5">
      <Link href="/courses" className="font-heading text-2xl text-terracotta-700">
        Headroom
      </Link>
      <nav aria-label="Main">
        <Link
          href="/courses"
          aria-current="page"
          className="border-b-2 border-foreground pb-0.5 font-semibold"
        >
          Courses
        </Link>
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
        <form action="/auth/sign-out" method="post">
          <Button type="submit" variant="ghost" size="sm" className="h-9 px-3 text-sm">
            <LogOut aria-hidden />
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}
