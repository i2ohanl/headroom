# Headroom

## What this is

A web app for a university hackathon with the theme "Innovate Education". Students upload their assignment materials and get their deadlines, an effort estimate for each assignment, and a plan. Because many students do this, the app also knows when a course's students are busiest, and a lecturer can use that to pick a due date with the fewest clashes.

The build window is about 36 hours, with roughly 12 to 15 real working hours. The submission is a video. Scope is fixed by this file: do not add features that are not listed here.

## The problem

Deadlines across courses pile into the same weeks because each lecturer sets dates without seeing the other courses. Students also underestimate how long assignments take and start late. Existing student planners work for one student at a time and make the student supply the hours. Nothing gives lecturers a view of the clashes they are about to create.

Frame the product as fixing a coordination failure between courses, not as helping disorganised students.

## Users

- **Student.** Signs in, adds courses, gets estimates and a plan.
- **Lecturer.** Never signs in. Opens the clash checker from a link, types a course code, and tests due dates.

## How it is judged

| Criterion | Max |
|---|---|
| Problem relevance | 10 |
| Desirability and impact | 10 |
| Solution and creativity | 8 |
| Design (UI/UX) | 8 |
| Functionality | 9 |
| Video presentation | 5 |

What this means for the build:

- Functionality scores a core flow that works reliably end to end. A smaller app that works beats a larger one that half works.
- Design scores an interface that is intuitive and visually clear. Keep each screen to one job.
- Technical complexity is not scored. Do not add architecture for its own sake.
- The original parts are the clash checker and the effort estimates. The planner is conventional, so it should stay minimal.

## Core features, in build order

Build these in order. Get each one working before starting the next.

### 1. Light sign-in (student)

Just enough to save a student's courses and plan. Use email sign-in through Supabase Auth. There are no roles, no professor accounts, and no passwords that we manage ourselves. If email delivery gets in the way during local development, propose the lightest alternative and ask before building it.

### 2. Add a course (student)

The student types a course code, then either uses an assignment already in the app or adds one by uploading its materials. There is no single course-overview document. An assignment's materials are several PDFs: the brief, the rubric, the requirements and tasks, and sometimes a course-content page. Some will be printouts of web pages.

- If the course code already exists in the app, load its assignments instantly with no upload.
- If it does not exist, the student types the course name to create the course, then adds assignments by upload. The course and its assignments are then available to everyone.
- An upload is one assignment: the student drops all of its PDFs together and they go to the AI in one call. If an assignment with the same normalised title already exists in the course, offer the existing one instead of creating a duplicate.
- The set of courses a student has added is their enrolment. There is no separate enrolment step.

### 3. Breakdown and estimate (student)

After an upload, the AI returns the assignment (or assignments, if a schedule page lists several). For each one it gives the title, the due date, the weighting if stated, and a list of tasks with an hour range for each task.

- The student reviews the result on one screen and can edit any field before saving.
- The breakdown and estimates are generated once per assignment and shared as the default for that course. A student's edits apply only to their own copy.

### 3b. Edit your own copy (student)

Feature 3 only lets a student edit what they just uploaded. Students who adopt an existing course, and anyone coming back later, also need to change the shared estimates for themselves. One student may need 1 hour for a task that another needs 3. The shared version is only a suggestion.

- After "Add to my courses" (the course already exists), open the review screen for that course's assignments, showing the student's values: their own copy where they have edited, the shared suggestion otherwise. This is what the modal means by "You can edit estimates after adding".
- Make each course row on My courses clickable (`›`). It opens the same review screen for that course, so a student can edit their copy at any time. This reuses the review screen. It is not a new screen.
- Saving writes only what differs from the shared version to the student's own copy (`student_assignment_edits`, `student_tasks`). Shared rows are never changed. A student can also reset an assignment to the shared suggestion.
- A student can edit any field, including a due date, add or remove tasks, and change hours. Other students never see these edits.
- Anywhere the app shows a student their own numbers (the review screen, and the plan in feature 4), it uses their own copy first and falls back to the shared suggestion. The clash checker already prefers a student's own due date.
- Students can already write their own copy under the existing policies. A database function is only there to save a copy all-or-nothing and to share the "store only what differs" logic with the upload flow. Propose it as a migration file and wait for approval before applying anything.
- Needs the usual loading, empty and error states. Does not add a screen.

### 4. Plan view (student)

Shows the student's assignments across the semester, with each assignment's estimated hours spread over the weeks before its deadline and the busy weeks made obvious.

- First version: spread the hours evenly from the date the course was added to the due date, using the midpoint of each hour range.
- Show total planned hours per week and highlight weeks above a threshold.
- Do not build smarter scheduling until the core flow works end to end.

### 5. Clash checker (anyone, no login)

A public page. The visitor types a course code and sees when that course's students are busiest across the semester. They drag a proposed due date along the calendar and the clash count updates as they drag.

- The heatmap and the slider use the same calculation: the heatmap shows the clash count for every possible date, and the slider selects one date and shows its number.
- Show the count as "X of Y students", for example "142 of 180 students".
- Load the course's data once and recalculate in the browser as the slider moves. No real-time infrastructure.
- Show counts only. Never show student names or any individual student's data.
- The checker is read-only. It does not create or publish assignments.

## Stretch features, only after all five core features work

6. **Re-planning.** The student ticks off work and the plan redistributes the remaining hours, showing the consequence of falling behind.
7. **Calendar export.** Export the plan as a standard calendar file.
8. **Reported hours.** Actual hours logged by students correct the shared estimates.

## Out of scope

Do not build any of these, even if they seem helpful:

- Professor accounts, course ownership, or lecturers publishing due dates to students
- A separate enrolment or course subscription flow
- Integration with a university learning management system
- Native mobile apps
- A chat interface
- Notifications or reminders
- Grade tracking

## Rules the app must follow

### Clash definition

A student counts as clashing with a proposed due date if they have at least one deadline in another course within 3 days either side of that date. Keep the window (3 days) and the threshold (1 other deadline) as named constants so they are easy to change.

### AI extraction and estimates

- Estimate from the tasks described in the brief. Use weighting only as a sanity check.
- Always return hour ranges, never single numbers.
- Never invent a due date. If the document does not state one, return it as missing and have the review screen ask the student for it.
- If extraction fails or the documents are not assignment materials, show a clear error and let the student enter the assignment by hand.

### Seeded data

The clash checker needs a cohort to show. Write a seed script that creates about 180 fictional students across about 8 courses in one program, with deadlines that pile up late in the semester. Label seeded data as demo data in the interface.

### Semester

Keep the semester start date and length as configuration, not hard-coded values.

## Core concepts

These describe the domain in plain language. They are not a schema.

- A **course** is identified by its course code and has assignments.
- An **assignment** has a title, a due date, an optional weighting, and tasks.
- A **task** has a name and an hour range.
- A **student** has a set of courses, plus their own edits to the shared estimates.

Students and courses are many-to-many, and the clash count is a join across them.

## Tech stack

- **App:** Next.js (App Router) with TypeScript. One project for frontend and backend.
- **Database and sign-in:** Postgres and Auth through Supabase.
- **Styling:** Tailwind with shadcn/ui components.
- **AI:** the Claude API through the official TypeScript SDK, called from the server only.
- **Hosting:** runs locally for the video. Deploy to Vercel only if asked.

### Claude API usage

- Send the PDF to the API directly as a document. Do not add a PDF parsing library.
- Use structured outputs so the response always matches a JSON schema that we define.
- One call per upload sends all of the assignment's PDFs together as document blocks and returns the assignment(s) with their tasks and hour ranges. The course code and name are typed by the student, not extracted. Use the rubric to shape the tasks and the brief for the due date.
- Keep the API key in an environment variable and never send it to the browser.
- Check the current docs for exact parameter names and the model string instead of relying on memory. Start at https://platform.claude.com/docs/en/build-with-claude/pdf-support and the Structured outputs page in the same section. A mid-tier model is enough for this task.

## Screens

1. Sign-in
2. My courses, with the add-a-course action
3. Assignment review, shown after an upload, after adding an existing course, and when a course row is opened
4. Plan
5. Clash checker (public)

Do not add screens beyond these without asking.

## Design

The starting design is the low-fi wireframes in the Claude Design project "Workload Map wireframes" (https://claude.ai/design/p/b4a5b971-f20e-45ef-82dc-e6ca2fdd922e, file `Workload Map Wireframes.dc.html`). Follow their layout and flow. They are greyscale and still say "Workload Map"; the product name is Headroom.

- **Visual style:** the "Organic" design system in the same project (`_ds/organic-.../styles.css` and `readme.md`). Warm cream ground, terracotta accent, sage second accent, Libre Caslon Text headings (the wireframes override Organic's Caprasimo) over Figtree body, pill-shaped buttons and inputs, large rounded cards. Take colours, fonts, radii and shadows from its tokens (in `globals.css`; ramps renamed `sand`, `terracotta`, `sage`). Do not hard-code hex values. The wireframes use the neutral ramp only; the accent colours are for emphasis (busy weeks, deadlines, primary buttons).
- **How it meets the stack:** Tailwind and shadcn/ui stay. The Organic tokens are mapped into `globals.css` and the shadcn theme variables. We do not import Organic's `.btn`, `.card` etc. classes. Icons are Lucide.
- **Routes (from the wireframes):** `/sign-in`, `/courses`, `/courses/add` (a modal over `/courses`), `/courses/[code]/review` (after an upload it loads a draft; for 3b it loads the student's own assignments), `/plan`, `/check/[code]` (public).
- **Screen 1, sign-in:** email field, "Email me a sign-in link", a short example preview panel labelled "Example", and a link "Lecturer? Check a due date for clashes" to the clash checker.
- **Screen 2, add a course:** one modal with five states: choose (type a code), code found (shows the existing deadlines and an "Add to my courses" button), new course (code not found: ask for the course name), add an assignment (drop several PDFs, or pick an existing assignment), uploading (progress and steps), error (unreadable documents, with "try other files" or "type the code"), and the courses list behind it. The list has an empty state still to design.
- **Screen 3, review:** one card per assignment with title, due date, weight, and tasks with "lo to hi hours". A missing due date gets a dashed, highlighted input and a notice. Save is shown with a count of missing dates.
- **Screen 4, plan:** rows are assignments grouped by course, columns are the semester weeks, cells show hours, deadlines are dots, and a "Hours per week" bar row marks the busiest weeks.
- **Screen 5, clash checker:** course code field, a "DEMO DATA" badge, a large "X of Y" count, a day-by-day heatmap (84 cells for a 12-week semester) with a draggable marker, week labels, and a quiet-to-busy legend.
- **Where the wireframes go beyond this file:** the "Example" panel on sign-in, the bar row on the plan screen, the verdict line on the clash checker ("Busy week for your students"), and the course rows on screen 2 being clickable (`›`). The clickable rows are agreed (feature 3b): a row opens the existing review screen for that course, not a new course detail screen.

## Working agreements

- Features come before data models. Propose the database schema and wait for approval before creating any tables.
- Work one feature at a time, in the build order above. Do not jump ahead.
- Ask when a product decision is unclear. Do not guess and build.
- Do not use a chart library. The heatmap is a grid of coloured cells and the slider is a standard range input.
- Test extraction against real assignment materials (brief, rubric, requirements, web printouts) in `/samples` early, before building the screens that depend on it.
- Every screen that loads or submits data needs a loading state, an empty state, and an error state.
- Never make git commits, and never push, branch, or otherwise change git history or state. The user makes all commits. Leave changes uncommitted, and when a feature or fix is finished, say what changed so the user can commit it as one small, focused commit.

## Definition of done for the demo

This path works reliably, start to finish, on a fresh database with seeded data:

1. A student signs in.
2. They add an assignment by uploading its real materials (several PDFs).
3. They see the extracted assignments with tasks and hour ranges, edit one, and save.
4. They see their plan with busy weeks highlighted.
5. A second student types the same course code and gets the assignments with no upload.
6. On the clash checker, typing that course code shows the heatmap, and dragging the proposed due date changes the clash count.
