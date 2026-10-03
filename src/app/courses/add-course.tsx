"use client";

// Screen 2, add-a-course modal. States: choose (type a code), found, and code not found.
// Creating a new course and adding assignments to it is feature 3.
import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Loader2, Plus } from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatCode,
  formatDueDate,
  isValidCode,
  normalizeCode,
  pluralise,
  type CourseDetail,
} from "@/lib/courses";
import { addCourse, lookupCourse, searchCourses, type CourseOption } from "./actions";
import { useCloseModal } from "./course-modal";

type Lookup =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "not_found"; code: string }
  | { status: "invalid" }
  | { status: "error" };

type View =
  | { name: "choose" }
  | { name: "found"; course: CourseDetail };

export function AddCourse() {
  const close = useCloseModal();
  const [view, setView] = useState<View>({ name: "choose" });
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<Lookup>({ status: "idle" });
  const [adding, setAdding] = useState<"idle" | "adding" | "error">("idle");
  const [options, setOptions] = useState<CourseOption[] | null>(null); // null = list closed
  const [active, setActive] = useState(-1);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchId = useRef(0);

  // Cancel any pending search if the modal closes.
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  function closeOptions() {
    clearTimeout(searchTimer.current);
    searchId.current++; // ignore any search still in flight
    setOptions(null);
    setActive(-1);
  }

  // Debounced prefix search. Only the latest request may update the list.
  function onCodeChange(value: string) {
    setCode(value);
    if (lookup.status !== "idle" && lookup.status !== "loading") setLookup({ status: "idle" });
    clearTimeout(searchTimer.current);
    const id = ++searchId.current;
    if (normalizeCode(value).length < 2) {
      setOptions(null);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      const result = await searchCourses(value);
      if (id !== searchId.current) return;
      setOptions(result);
      setActive(-1);
    }, 200);
  }

  function pick(option: CourseOption) {
    setCode(formatCode(option.code));
    closeOptions();
    runLookup(option.code);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (options && active >= 0) pick(options[active]);
    else {
      closeOptions();
      runLookup(code);
    }
  }

  function onCodeKeyDown(e: React.KeyboardEvent) {
    if (options === null) return;
    if (e.key === "ArrowDown" && options.length > 0) {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp" && options.length > 0) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // close the list, not the whole modal
      closeOptions();
    }
  }

  async function runLookup(rawCode: string) {
    const normalized = normalizeCode(rawCode);
    if (!isValidCode(normalized)) {
      setLookup({ status: "invalid" });
      return;
    }
    setLookup({ status: "loading" });
    setAdding("idle");
    const result = await lookupCourse(normalized);
    if (result.status === "found") {
      setLookup({ status: "idle" });
      setView({ name: "found", course: result.course });
    } else {
      setView({ name: "choose" });
      setLookup(result.status === "not_found" ? { status: "not_found", code: normalized } : result);
    }
  }

  async function onAdd(course: CourseDetail) {
    setAdding("adding");
    const result = await addCourse(course.code);
    if (result.status === "added") {
      close();
    } else {
      setAdding("error");
    }
  }

  const looking = lookup.status === "loading";
  const found = view.name === "found" ? view.course : null;
  const codeError =
    lookup.status === "invalid"
      ? "Course codes are letters and numbers, like STAT 230."
      : lookup.status === "error"
          ? "Something went wrong looking that up. Try again."
          : null;

  return (
    <div className="flex flex-col gap-6">
      <DialogTitle className="text-3xl leading-tight">Add a course</DialogTitle>

      <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
        <Label htmlFor="course-code">Course code</Label>
        <Input
          id="course-code"
          role="combobox"
          aria-expanded={options !== null}
          aria-controls="course-options"
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `course-option-${active}` : undefined}
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          onKeyDown={onCodeKeyDown}
          onBlur={closeOptions}
          placeholder="e.g. PSYC or STAT 230"
          autoComplete="off"
          disabled={looking}
          aria-invalid={Boolean(codeError)}
          aria-describedby={codeError ? "code-error" : undefined}
          className="h-12 w-full px-5 text-base"
        />
        {options !== null && (
          <ul
            id="course-options"
            role="listbox"
            aria-label="Matching courses"
            className="overflow-hidden rounded-2xl bg-sand-100 py-1.5 ring-1 ring-sand-300"
          >
            {options.length === 0 ? (
              <li className="px-5 py-3 text-sm text-muted-foreground">
                No courses start with that. Press Enter to add it as a new course.
              </li>
            ) : (
              options.map((o, i) => (
                <li
                  key={o.code}
                  id={`course-option-${i}`}
                  role="option"
                  aria-selected={i === active}
                  // mousedown, not click: the input's blur would close the list first
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-baseline gap-4 px-5 py-2.5 ${
                    i === active ? "bg-sand-200" : ""
                  }`}
                >
                  <span className="w-24 shrink-0 font-bold">{formatCode(o.code)}</span>
                  <span className="truncate">{o.name}</span>
                  {o.is_demo && (
                    <span className="ml-auto shrink-0 rounded-full bg-sand-300 px-2 py-0.5 text-xs font-semibold tracking-wide text-sand-800 uppercase">
                      Demo
                    </span>
                  )}
                </li>
              ))
            )}
          </ul>
        )}
        {looking && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Looking up the course...
          </p>
        )}
        {codeError && (
          <p id="code-error" role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {codeError}
          </p>
        )}
      </form>

      {lookup.status === "not_found" && (
        <section
          aria-label="Course not found"
          className="flex flex-col gap-4 rounded-2xl bg-sand-200 px-7 py-6"
        >
          <div className="flex flex-col gap-1">
            <p className="text-lg font-bold">{formatCode(lookup.code)} isn&apos;t in Headroom yet</p>
            <p className="text-sm text-sand-800">
              Check the code, or add it as a new course so classmates can find it too.
            </p>
          </div>
          {/* TODO feature 3: create the course (ask for its name) and add its first assignment. */}
          <div className="flex flex-wrap items-center gap-4">
            <Button className="h-12 gap-2 px-6 text-base" disabled>
              <Plus aria-hidden />
              Add a new course
            </Button>
            <span className="text-sm text-muted-foreground">Coming in the next update.</span>
          </div>
        </section>
      )}

      {found && (
        <>
          <section
            aria-label={`${found.name} deadlines`}
            className="flex flex-col gap-4 rounded-2xl bg-sand-200 px-7 py-6"
          >
            <div className="flex flex-col gap-1">
              <p className="flex flex-wrap items-center gap-3 text-lg font-bold">
                {formatCode(found.code)} · {found.name}
                {found.is_demo && (
                  <span className="rounded-full bg-sand-300 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-sand-800 uppercase">
                    Demo data
                  </span>
                )}
              </p>
              <p className="text-sm text-sand-800">
                {found.assignments.length === 0
                  ? "This course is in Headroom, but it has no deadlines yet."
                  : `This course is already in Headroom. ${pluralise(found.assignments.length, "deadline")} loaded.`}
              </p>
            </div>
            {found.assignments.length > 0 && (
              <ul className="flex flex-col">
                {found.assignments.map((a) => (
                  <li
                    key={a.id}
                    className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-t border-sand-300 py-2.5 text-[15px] sm:grid-cols-[1fr_8rem_4rem]"
                  >
                    <span>{a.title}</span>
                    <span className="text-right text-muted-foreground sm:text-left">
                      {a.due_date ? formatDueDate(a.due_date) : "Date to be confirmed"}
                    </span>
                    <span className="col-span-2 text-sm text-muted-foreground sm:col-span-1 sm:text-right sm:text-[15px]">
                      {a.weight_pct != null ? `${a.weight_pct}%` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {found.enrolled ? (
            <div className="flex flex-wrap items-center gap-4">
              <p role="status" className="flex items-center gap-2 font-semibold text-sage-700">
                <Check className="size-4" aria-hidden />
                You&apos;ve already added this course.
              </p>
              <Button variant="outline" className="h-12 px-6 text-base" onClick={close}>
                Done
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <Button
                  className="h-12 px-6 text-base"
                  disabled={adding === "adding"}
                  onClick={() => onAdd(found)}
                >
                  {adding === "adding" && <Loader2 className="animate-spin" aria-hidden />}
                  {adding === "adding" ? "Adding..." : "Add to my courses"}
                </Button>
                <span className="text-sm text-muted-foreground">
                  You can edit estimates after adding.
                </span>
              </div>
              {adding === "error" && (
                <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  We couldn&apos;t add this course. Try again.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
