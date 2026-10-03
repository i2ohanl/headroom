"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2, Plus, RotateCcw, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { pluralise, type DraftAssignment, type MyAssignment } from "@/lib/courses";
import { resetMyAssignment, saveDraft, saveMyAssignments } from "./actions";

// Numbers are kept as text while typing so "2." and an empty box are not rewritten under the cursor.
type TaskState = { name: string; description: string; lo: string; hi: string };
type AssignmentState = {
  id?: string; // set when editing assignments that are already saved
  edited?: boolean;
  shared?: MyAssignment["shared"];
  title: string;
  due: string;
  weight: string;
  tasks: TaskState[];
};

const toState = (a: DraftAssignment | MyAssignment): AssignmentState => ({
  ...("id" in a ? { id: a.id, edited: a.edited, shared: a.shared } : {}),
  title: a.title,
  due: a.due_date ?? "",
  weight: a.weight_pct === null ? "" : String(a.weight_pct),
  tasks: a.tasks.map((t) => ({
    name: t.name,
    description: t.description,
    lo: String(t.hours_lo),
    hi: String(t.hours_hi),
  })),
});

function toDraft(a: AssignmentState): DraftAssignment | string {
  const weight = a.weight.trim() === "" ? null : Number(a.weight);
  if (!a.title.trim()) return "Every assignment needs a title.";
  if (weight !== null && !(weight >= 0 && weight <= 100)) return `Weight for "${a.title}" must be between 0 and 100.`;
  const tasks = [];
  for (const t of a.tasks) {
    const lo = Number(t.lo);
    const hi = Number(t.hi);
    if (!t.name.trim()) return `Every task in "${a.title}" needs a name.`;
    if (t.lo.trim() === "" || t.hi.trim() === "" || !(lo >= 0) || !(hi >= lo)) {
      return `Check the hours for "${t.name}": enter two numbers, the second at least the first.`;
    }
    tasks.push({ name: t.name.trim(), description: t.description.trim(), hours_lo: lo, hours_hi: hi });
  }
  return { title: a.title.trim(), due_date: a.due || null, weight_pct: weight, tasks };
}

// A textarea that is always as tall as its text, so nothing is cut off and there is no scrollbar.
function AutoTextarea(props: React.ComponentProps<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [props.value]);
  return <textarea ref={ref} rows={1} {...props} />;
}

// The shared suggestion is the fallback, so a student cannot blank out a value it has
// (a blank would just show the shared value again) or remove every task.
function checkAgainstShared(a: AssignmentState): string | null {
  if (!a.shared) return null;
  if (a.shared.due_date && !a.due) return `"${a.title}" has a suggested due date. Change it, but it can't be left empty.`;
  if (a.shared.weight_pct !== null && a.weight.trim() === "") return `"${a.title}" has a suggested weight. Change it, but it can't be left empty.`;
  if (a.shared.task_count > 0 && a.tasks.length === 0) return `Keep at least one task in "${a.title}".`;
  return null;
}

type Props =
  | { mode: "draft"; draftId: string; initial: DraftAssignment[] }
  | { mode: "mine"; code: string; initial: MyAssignment[] };

export function ReviewForm(props: Props) {
  const router = useRouter();
  const [items, setItems] = useState(() => (props.initial as (DraftAssignment | MyAssignment)[]).map(toState));
  const [resetting, setResetting] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<AssignmentState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = items.filter((a) => !a.due).length;

  function update(i: number, patch: Partial<AssignmentState>) {
    setItems((cur) => cur.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }
  function updateTask(i: number, k: number, patch: Partial<TaskState>) {
    setItems((cur) =>
      cur.map((a, j) => (j === i ? { ...a, tasks: a.tasks.map((t, m) => (m === k ? { ...t, ...patch } : t)) } : a)),
    );
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const drafts: (DraftAssignment & { id?: string })[] = [];
    for (const item of items) {
      const d = toDraft(item);
      const problem = typeof d === "string" ? d : checkAgainstShared(item);
      if (problem) return setError(problem);
      drafts.push({ ...(d as DraftAssignment), id: item.id });
    }
    setError(null);
    setSaving(true);
    const result =
      props.mode === "draft"
        ? await saveDraft(props.draftId, drafts)
        : await saveMyAssignments(props.code, drafts as (DraftAssignment & { id: string })[]);
    if (result.status === "saved") {
      router.push("/courses");
      return;
    }
    setSaving(false);
    setError(
      result.status === "invalid" ? result.message : "We couldn't save this. Check your connection and try again.",
    );
  }

  async function onReset(a: AssignmentState) {
    setConfirmReset(null);
    if (props.mode !== "mine" || !a.id) return;
    setResetting(a.id);
    setError(null);
    const result = await resetMyAssignment(a.id, props.code);
    setResetting(null);
    if (result.status === "saved") router.refresh();
    else setError("We couldn't reset that assignment. Try again.");
  }

  return (
    <form onSubmit={onSave} className="flex flex-col gap-6">
      {items.map((a, i) => {
        const noDate = !a.due;
        return (
          <section
            key={i}
            aria-label={a.title || `Assignment ${i + 1}`}
            className={cn("flex flex-col gap-5 rounded-3xl bg-sand-200 px-8 py-7", noDate && "ring-[2.5px] ring-terracotta-500 ring-inset")}
          >
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_7rem]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`title-${i}`}>Title</Label>
                <Input
                  id={`title-${i}`}
                  value={a.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  className="h-11 px-5 font-semibold"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`due-${i}`}>Due date</Label>
                <Input
                  id={`due-${i}`}
                  type="date"
                  value={a.due}
                  onChange={(e) => update(i, { due: e.target.value })}
                  aria-describedby={noDate ? `due-note-${i}` : undefined}
                  className={cn("h-11 px-5", noDate && "border-2 border-dashed border-terracotta-600 bg-terracotta-100")}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`weight-${i}`}>Weight (%)</Label>
                <Input
                  id={`weight-${i}`}
                  inputMode="decimal"
                  value={a.weight}
                  onChange={(e) => update(i, { weight: e.target.value })}
                  placeholder="None"
                  className="h-11 px-5"
                />
              </div>
            </div>

            {a.edited && (
              <div className="flex flex-wrap items-center gap-3 text-sm text-sand-800">
                <span className="rounded-full bg-sage-200 px-3 py-0.5 font-semibold text-sage-800">Your version</span>
                <button
                  type="button"
                  onClick={() => setConfirmReset(a)}
                  disabled={resetting === a.id}
                  className="flex items-center gap-1.5 font-semibold underline underline-offset-4 disabled:opacity-50"
                >
                  {resetting === a.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RotateCcw className="size-3.5" aria-hidden />}
                  Reset to the suggestion
                </button>
              </div>
            )}

            {noDate && (
              <p
                id={`due-note-${i}`}
                className="flex items-center gap-3 self-start rounded-full bg-terracotta-600 px-5 py-2.5 text-[15px] text-white"
              >
                <strong>No due date found.</strong>
                <span>Please fill it in so we can plan for it.</span>
              </p>
            )}

            <div className="flex flex-col gap-4">
              <div className="hidden grid-cols-[minmax(0,1fr)_14rem_2.5rem] gap-4 text-[13px] font-semibold text-sand-800 sm:grid">
                <span>Tasks</span>
                <span>Estimate</span>
                <span />
              </div>
              {a.tasks.length === 0 && (
                <p className="text-sm text-muted-foreground">No tasks yet. Add the tasks you need to do.</p>
              )}
              {a.tasks.map((t, k) => (
                <div
                  key={k}
                  className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_14rem_2.5rem] sm:items-start sm:gap-x-4"
                >
                  <div className="flex flex-col gap-1.5">
                    <Input
                      aria-label={`Task ${k + 1} name`}
                      value={t.name}
                      onChange={(e) => updateTask(i, k, { name: e.target.value })}
                      className="h-10 bg-surface px-4 text-[15px] font-semibold"
                    />
                    <AutoTextarea
                      aria-label={`${t.name || "Task"} description`}
                      value={t.description}
                      onChange={(e) => updateTask(i, k, { description: e.target.value })}
                      placeholder="Add a short description (optional)"
                      className="w-full resize-none overflow-hidden rounded-2xl border border-transparent bg-transparent px-4 py-1.5 text-sm leading-snug text-sand-700 transition-colors outline-none placeholder:text-sand-600 hover:bg-sand-300/50 focus-visible:border-ring focus-visible:bg-surface focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  </div>
                  <div className="flex h-10 items-center gap-2 text-[15px]">
                    <Input
                      aria-label={`${t.name || "Task"} minimum hours`}
                      inputMode="decimal"
                      value={t.lo}
                      onChange={(e) => updateTask(i, k, { lo: e.target.value })}
                      className="h-10 w-16 px-2 text-center"
                    />
                    <span>to</span>
                    <Input
                      aria-label={`${t.name || "Task"} maximum hours`}
                      inputMode="decimal"
                      value={t.hi}
                      onChange={(e) => updateTask(i, k, { hi: e.target.value })}
                      className="h-10 w-16 px-2 text-center"
                    />
                    <span>hours</span>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${t.name || "task"}`}
                    onClick={() => update(i, { tasks: a.tasks.filter((_, m) => m !== k) })}
                    className="flex size-10 items-center justify-center self-start rounded-full hover:bg-sand-300"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                className="mt-1 h-10 gap-2 self-start px-5"
                onClick={() => update(i, { tasks: [...a.tasks, { name: "", description: "", lo: "1", hi: "2" }] })}
              >
                <Plus aria-hidden />
                Add a task
              </Button>
            </div>
          </section>
        );
      })}

      {error && (
        <p role="alert" className="flex items-start gap-2 text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-5">
        <Button type="submit" disabled={saving} className="h-13 px-9 text-[17px]">
          {saving && <Loader2 className="animate-spin" aria-hidden />}
          {saving ? "Saving..." : props.mode === "mine" ? "Save my changes" : "Save"}
        </Button>
        <Link href="/courses" className={cn(buttonVariants({ variant: "ghost" }), "h-13 px-6 text-base")}>
          {props.mode === "mine" ? "Back" : "Discard"}
        </Link>
        <span role="status" className="text-muted-foreground">
          {missing === 0 ? "All due dates filled in" : `${pluralise(missing, "due date")} still missing`}
        </span>
      </div>

      <Dialog open={confirmReset !== null} onOpenChange={(open) => !open && setConfirmReset(null)}>
        <DialogContent className="gap-0 p-8" style={{ maxWidth: "min(30rem, calc(100% - 2rem))" }}>
          <DialogTitle className="text-2xl leading-tight">Go back to the suggestion?</DialogTitle>
          <DialogDescription className="mt-3 text-base text-sand-800">
            Your changes to &ldquo;{confirmReset?.title}&rdquo; will be removed and it will show the suggested estimates
            again. The page reloads, so save any other changes first.
          </DialogDescription>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button type="button" className="h-11 px-6 text-base" onClick={() => confirmReset && onReset(confirmReset)}>
              Reset to the suggestion
            </Button>
            <Button type="button" variant="outline" className="h-11 px-6 text-base" onClick={() => setConfirmReset(null)}>
              Keep my version
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}
