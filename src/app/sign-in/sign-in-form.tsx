"use client";

import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Status = "idle" | "sending" | "sent" | "error";

export function SignInForm({ initialError }: { initialError: boolean }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>(initialError ? "error" : "idle");
  const [message, setMessage] = useState(
    initialError ? "That sign-in link didn't work. It may have expired. Request a new one." : "",
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setMessage(
        error.status === 429
          ? "Too many emails sent recently. Wait a little while and try again."
          : "We couldn't send the link. Check the address and try again.",
      );
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-3xl bg-sage-200 p-6 text-sage-900">
        <MailCheck className="size-6" aria-hidden />
        <p className="font-heading text-xl">Check your email</p>
        <p className="text-sm">
          We sent a sign-in link to <span className="font-medium">{email.trim()}</span>. Open it in
          this browser.
        </p>
        <Button
          type="button"
          variant="ghost"
          className="h-9 self-start px-4"
          onClick={() => setStatus("idle")}
        >
          Use a different email
        </Button>
      </div>
    );
  }

  const sending = status === "sending";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Label htmlFor="email">University email</Label>
      <Input
        id="email"
        type="email"
        required
        autoComplete="email"
        placeholder="you@university.edu"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={sending}
        aria-invalid={status === "error"}
        aria-describedby={status === "error" ? "email-error" : undefined}
        className="h-11 px-4"
      />
      {status === "error" && (
        <p id="email-error" role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <Button type="submit" disabled={sending} className="h-11 px-6 text-base">
        {sending && <Loader2 className="animate-spin" aria-hidden />}
        {sending ? "Sending..." : "Email me a sign-in link"}
      </Button>
      <p className="text-sm text-muted-foreground">No password. We email you a link.</p>
    </form>
  );
}
