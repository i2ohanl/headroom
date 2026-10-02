# Headroom: setup for project + sign-in (feature 1 only)

Scope: Next.js app, Supabase project, email sign-in, sign-in page. No tables yet (Supabase Auth ships its own `auth.users`). The schema is proposed and approved separately, per CLAUDE.md.

## 1. Accounts

| Account | Needed now? | Why |
|---|---|---|
| Supabase (supabase.com) | Yes | Postgres + email auth. Sign up with GitHub. Free tier is enough. |
| GitHub | Recommended | Supabase sign-up, and a place to push so teammates and judges can see the code. |
| Anthropic Console (console.anthropic.com) | Not yet | Needed for feature 3 (extraction). Create the API key later. |
| Vercel | No | Only if asked to deploy. |

## 2. Install locally

You already have Node v26 and npm 11. Nothing else global is required.

- Node 20+ is the minimum Next.js needs; v26 is fine.
- Optional: Supabase CLI (`brew install supabase/tap/supabase`). Not needed for sign-in. It becomes useful when we create tables and the seed script.

## 3. Create the Next.js app (you run this)

From the project root (it is fine that `CLAUDE.md`, `SETUP.md`, `.env.example` and `src/` stubs already exist):

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

If it refuses because of existing files, move the `src/` stubs aside, run it, and move them back.

Then:

```bash
npx shadcn@latest init          # pick defaults (New York style, neutral)
npx shadcn@latest add button input label card
npm install @supabase/supabase-js @supabase/ssr
```

Do not install `@supabase/auth-helpers-*`; it is deprecated in favour of `@supabase/ssr`.

### Design tokens and fonts (from the wireframes)

The design is the "Organic" system from the Claude Design project (see CLAUDE.md > Design). Setup only, no screens yet:

Done (see `src/app/layout.tsx`, `src/app/globals.css`, `src/components/ui/`):

1. Fonts: Libre Caslon Text (headings, as set in the wireframes) and Figtree (body) load through `next/font/google` as `--font-caslon` and `--font-figtree`. Tailwind's `font-heading` and `font-sans` use them.
2. Tokens: Organic's colours, shadows and radii are in `globals.css`. Ramps are renamed so they don't clash with shadcn or Tailwind: `neutral` is `sand-100..900`, `accent` is `terracotta-100..900`, `accent-2` is `sage-100..900`, plus `cream`, `surface` and `ink`. Use them as Tailwind classes, e.g. `bg-sand-200` or `text-terracotta-700`.
3. shadcn mapping: `--background`, `--primary`, `--card`, `--border`, `--ring` and the rest point at those tokens. Light theme only; the dark block was removed. `--radius` is 1.25rem.
4. Pill shapes: `button.tsx` and `input.tsx` use `rounded-full`.
5. Icons: `lucide-react` is installed.

Assumption: the wireframes are greyscale but the build uses Organic's warm colours. Say so if you want greyscale.

## 4. Create the Supabase project

1. supabase.com/dashboard, New project. Name it `headroom`, pick the region nearest you, and save the database password somewhere (we do not use it for sign-in).
2. Wait about 2 minutes for provisioning.
3. Project Settings, API (or "API Keys"): copy the **Project URL** and the **publishable / anon key**. Do NOT copy the `service_role` / secret key into anything that starts with `NEXT_PUBLIC_`. We do not need it yet.
4. Authentication, Providers: confirm **Email** is enabled.
5. Authentication, URL Configuration:
   - Site URL: `http://localhost:3000`
   - Redirect URLs: add `http://localhost:3000/auth/callback`

## 5. Email sign-in flavour: decided, option A

Magic link using Supabase's default mail. No password, no custom SMTP.

- Supabase's built-in sender is rate limited (a few emails per hour on the free tier). Do not test sign-in repeatedly; use one or two real attempts at a time.
- If the limit bites before the video is recorded, the fallback is option B (custom SMTP, e.g. Resend). That needs a sender setup of about 20 minutes and is not needed now.
- Option C (dashboard-created test users) was not chosen and is not to be built without asking.

## 6. Environment variables

```bash
cp .env.example .env.local
```

Fill in the two Supabase values. `.env.local` is gitignored by `create-next-app`; check that it is before the first commit.

## 7. Template map (stubs already in `src/`)

```
src/
  app/
    sign-in/page.tsx          Screen 1 (see CLAUDE.md > Design): email field, "send link", loading/sent/error states
    auth/callback/route.ts    Exchanges the emailed code for a session, redirects to /courses
  lib/supabase/
    client.ts                 Browser Supabase client
    server.ts                 Server Supabase client (cookies)
  proxy.ts                    Refreshes the session; redirects signed-out users to /sign-in
```

`proxy.ts` currently holds a pass-through `proxy()` so the app builds (Next requires the export). It is the Next 16 name for what older versions call `middleware.ts`. If `create-next-app` installs Next 15 or earlier, rename it to `middleware.ts` and the exported function to `middleware`.

The `/sign-in` page and `/auth/callback` must stay public. The clash checker (`/check` and `/check/[code]`, later) must stay public too, so the proxy needs an allowlist of public paths, not a blanket redirect.

## 8. Checklist before we write code

- [x] Supabase project created, Email provider on
- [x] Site URL and redirect URL set in the Supabase dashboard
- [x] `.env.local` filled in
- [x] `create-next-app`, shadcn, and Supabase packages installed
- [x] Fonts, tokens and shadcn theme mapping done (see Design tokens above)
- [ ] `npm run dev` shows the default page at http://localhost:3000
- [x] Decision made: option A (magic link, default Supabase mail)
- [x] Git repo initialised
