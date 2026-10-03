"use client";

// Add-course modal, the upload half: pick the assignment's PDFs, read them, and either
// open the review screen, show the assignment that already exists, or show an error.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, FileText, Loader2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatBytes,
  formatCode,
  formatDueDate,
  UPLOAD_LIMITS,
} from "@/lib/courses";
import type { ExtractResponse } from "@/app/api/extract/route";
import { addCourse } from "./actions";
import { useCloseModal } from "./course-modal";

type Stage =
  | { name: "pick" }
  | { name: "uploading"; percent: number; reading: boolean }
  | { name: "error"; message: string; unreadable: boolean }
  | { name: "duplicate"; existing: Extract<ExtractResponse, { status: "duplicate" }>["existing"] };

const fileKey = (f: File) => `${f.name}:${f.size}:${f.lastModified}`;

export function UploadAssignment({
  code,
  courseName, // typed by the student when the course is new, otherwise null
  courseExists,
  enrolled,
  onTypeCode,
}: {
  code: string;
  courseName: string | null;
  courseExists: boolean;
  enrolled: boolean;
  onTypeCode: () => void;
}) {
  const router = useRouter();
  const close = useCloseModal();
  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>({ name: "pick" });
  const [enrolling, setEnrolling] = useState<"idle" | "busy" | "error">("idle");

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  function addFiles(incoming: FileList | File[]) {
    const next = [...files];
    let message: string | null = null;
    for (const f of Array.from(incoming)) {
      if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
        message = `${f.name} isn't a PDF. Only PDF files can be read.`;
      } else if (next.some((x) => fileKey(x) === fileKey(f))) {
        continue;
      } else if (next.length >= UPLOAD_LIMITS.maxFiles) {
        message = `You can add up to ${UPLOAD_LIMITS.maxFiles} files for one assignment.`;
      } else if (next.reduce((s, x) => s + x.size, f.size) > UPLOAD_LIMITS.maxTotalBytes) {
        message = `${f.name} would take you over the 20 MB limit.`;
      } else {
        next.push(f);
      }
    }
    setFiles(next);
    setProblem(message);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
    setProblem(null);
  }

  function fail(message: string, unreadable = false) {
    setStage({ name: "error", message, unreadable });
  }

  // XMLHttpRequest, not fetch, because only XHR reports real upload progress.
  function readFiles() {
    const body = new FormData();
    body.set("code", code);
    if (courseName) body.set("courseName", courseName);
    files.forEach((f) => body.append("files", f));

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    setStage({ name: "uploading", percent: 0, reading: false });

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setStage({ name: "uploading", percent: Math.round((e.loaded / e.total) * 100), reading: false });
      }
    };
    xhr.upload.onload = () => setStage({ name: "uploading", percent: 100, reading: true });
    xhr.onerror = () => fail("We couldn't reach the server. Check your connection and try again.");
    xhr.ontimeout = () => fail("That took too long. Try again, or use fewer files.");
    xhr.onload = () => {
      let result: ExtractResponse | null = null;
      try {
        result = JSON.parse(xhr.responseText) as ExtractResponse;
      } catch {}
      if (!result) return fail("Something went wrong reading those files. Try again.");
      if (result.status === "ok") {
        const params = new URLSearchParams({ draft: result.draftId });
        result.skipped.forEach((t) => params.append("skipped", t));
        router.push(`/courses/${code}/review?${params}`);
      } else if (result.status === "duplicate") {
        setStage({ name: "duplicate", existing: result.existing });
      } else {
        fail(result.error, result.status === "unreadable");
      }
    };
    xhr.timeout = 150_000;
    xhr.open("POST", "/api/extract");
    xhr.send(body);
  }

  function cancel() {
    xhrRef.current?.abort();
    setStage({ name: "pick" });
  }

  async function enrol() {
    setEnrolling("busy");
    const result = await addCourse(code);
    if (result.status === "added") router.push(`/courses/${code}/review`);
    else setEnrolling("error");
  }

  const title = courseExists ? "Add an assignment" : "Add your first assignment";

  if (stage.name === "uploading") {
    const steps = [
      { label: `Uploading ${files.length === 1 ? "1 file" : `${files.length} files`}`, done: stage.reading },
      { label: "Reading the documents and estimating hours", done: false, active: stage.reading },
      { label: "Preparing your review", done: false },
    ];
    return (
      <div className="flex flex-col gap-6" aria-live="polite">
        <h2 className="font-heading text-3xl leading-tight">Reading your files</h2>
        <div className="flex flex-col gap-3">
          <div className="flex justify-between text-base">
            <span className="font-semibold">{files.length === 1 ? files[0].name : `${files.length} files`}</span>
            <span className="text-muted-foreground">{formatBytes(totalBytes)}</span>
          </div>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={stage.percent}
            className="h-3 overflow-hidden rounded-full bg-sand-300"
          >
            <div className="h-full rounded-full bg-terracotta-600 transition-[width]" style={{ width: `${stage.percent}%` }} />
          </div>
        </div>
        <ul className="flex flex-col gap-2.5 text-base">
          {steps.map((s) => (
            <li key={s.label} className={`flex items-center gap-3 ${s.active ? "font-semibold" : s.done ? "" : "text-muted-foreground"}`}>
              <span className="flex size-5 items-center justify-center">
                {s.done ? (
                  <Check className="size-4 text-sage-700" aria-hidden />
                ) : s.active || (!stage.reading && s === steps[0]) ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
              </span>
              {s.label}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-sm text-muted-foreground">
            Usually under 30 seconds. You&apos;ll review everything before it&apos;s saved.
          </p>
          <Button variant="outline" className="ml-auto h-10 px-5" onClick={cancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (stage.name === "error") {
    return (
      <div className="flex flex-col gap-5">
        <span className="flex size-13 items-center justify-center rounded-full border-2 border-terracotta-600 text-terracotta-700">
          <CircleAlert className="size-6" aria-hidden />
        </span>
        <h2 className="font-heading text-3xl leading-tight">
          {stage.unreadable ? "We couldn't use these files" : "That didn't work"}
        </h2>
        <p role="alert" className="text-[17px] leading-relaxed text-sand-800">
          {stage.message}
          {stage.unreadable && " Try the original PDFs from your course page, or add the course by its code."}
        </p>
        <div className="flex flex-wrap items-center gap-5">
          <Button
            className="h-12 px-6 text-base"
            onClick={() => {
              setFiles([]);
              setProblem(null);
              setStage({ name: "pick" });
            }}
          >
            Try other files
          </Button>
          <button type="button" onClick={onTypeCode} className="text-base font-semibold underline underline-offset-4">
            Type the course code instead
          </button>
        </div>
      </div>
    );
  }

  if (stage.name === "duplicate") {
    return (
      <div className="flex flex-col gap-5">
        <h2 className="font-heading text-3xl leading-tight">That assignment is already here</h2>
        <p className="text-[17px] leading-relaxed text-sand-800">
          {formatCode(code)} already has {stage.existing.length === 1 ? "this assignment" : "these assignments"}, so
          nothing new was added. {enrolled ? "It's in your courses already." : "Add the course to use the existing one."}
        </p>
        <ul className="flex flex-col rounded-2xl bg-sand-200 px-7 py-3">
          {stage.existing.map((a) => (
            <li key={a.id} className="grid grid-cols-[1fr_auto] gap-x-4 border-t border-sand-300 py-2.5 first:border-t-0">
              <span>{a.title}</span>
              <span className="text-muted-foreground">{a.due_date ? formatDueDate(a.due_date) : "Date to be confirmed"}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-4">
          {enrolled ? (
            <Button className="h-12 px-6 text-base" onClick={close}>
              Done
            </Button>
          ) : (
            <Button className="h-12 px-6 text-base" disabled={enrolling === "busy"} onClick={enrol}>
              {enrolling === "busy" && <Loader2 className="animate-spin" aria-hidden />}
              Add to my courses
            </Button>
          )}
          <Button
            variant="outline"
            className="h-12 px-6 text-base"
            onClick={() => {
              setFiles([]);
              setStage({ name: "pick" });
            }}
          >
            Upload different files
          </Button>
        </div>
        {enrolling === "error" && (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            We couldn&apos;t add this course. Try again.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-3xl leading-tight">{title}</h2>
        <p className="text-sand-800">
          {formatCode(code)}
          {courseName ? ` · ${courseName}` : ""}. Drop all the PDFs for one assignment together: the brief, the rubric,
          the requirements and tasks, and any course-content page.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-start gap-2 rounded-2xl border-2 border-dashed px-8 py-8 ${
          dragging ? "border-terracotta-600 bg-terracotta-100" : "border-sand-400"
        }`}
      >
        <span className="flex items-center gap-2 text-lg font-bold">
          <UploadCloud className="size-5" aria-hidden />
          Drop the assignment&apos;s PDFs here
        </span>
        <p className="text-muted-foreground">
          or{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-semibold text-foreground underline underline-offset-4"
          >
            choose files
          </button>
          . PDF only, up to {UPLOAD_LIMITS.maxFiles} files and 20 MB in total.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          aria-label="Choose PDF files"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {problem && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {problem}
        </p>
      )}

      {files.length > 0 && (
        <ul aria-label="Files to read" className="flex flex-col gap-2">
          {files.map((f, i) => (
            <li key={fileKey(f)} className="flex items-center gap-3 rounded-full bg-sand-200 py-2 pr-2 pl-5">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate font-semibold">{f.name}</span>
              <span className="ml-auto shrink-0 text-sm text-muted-foreground">{formatBytes(f.size)}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                aria-label={`Remove ${f.name}`}
                className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-sand-300"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button className="h-12 px-6 text-base" disabled={files.length === 0} onClick={readFiles}>
          Read these files
        </Button>
        <button type="button" onClick={onTypeCode} className="text-base font-semibold underline underline-offset-4">
          Back
        </button>
      </div>
    </div>
  );
}
