// Next 16 name for middleware. Rename to middleware.ts if on Next 15 or earlier.
// TODO: refresh the Supabase session on each request
// TODO: PUBLIC_PATHS allowlist: /sign-in, /auth/callback, /check (clash checker, no login)
// TODO: redirect signed-out users on any other path to /sign-in
// TODO: export const config = { matcher: [...] } excluding _next/static, images, favicon

import { NextResponse } from "next/server";

// Placeholder so the app builds: Next requires a `proxy` export. Passes every request through.
export function proxy() {
  return NextResponse.next();
}
