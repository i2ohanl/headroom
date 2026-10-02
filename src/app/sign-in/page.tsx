// Screen 1: Sign-in. One job: get an email address and send the sign-in link.
// Layout (see CLAUDE.md > Design): left column = Headroom wordmark, headline "Know your busiest weeks before they arrive.",
// short blurb, "University email" pill input, "Email me a sign-in link" pill button, hint "No password...",
// link "Lecturer? Check a due date for clashes" -> /check. Right column = "Example" preview card with 3 numbered steps.
// TODO: shadcn Card + Label + Input + Button
// TODO: states: idle, sending (loading), sent ("check your email"), error
// TODO: call supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: <origin>/auth/callback } })
// TODO: if already signed in, redirect to /courses

export default function SignInPage() {
  return null;
}
