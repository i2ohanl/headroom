import Anthropic from "@anthropic-ai/sdk";

// Mid-tier model: enough for reading assignment PDFs (CLAUDE.md > Claude API usage).
export const EXTRACTION_MODEL = "claude-sonnet-5-5";

export type ExtractedTask = { name: string; description: string; hours_lo: number; hours_hi: number };
export type ExtractedAssignment = {
  title: string;
  due_date: string | null; // YYYY-MM-DD, only when the documents state it
  due_date_text: string | null; // the wording the date came from, for the review screen
  weighting: string | null; // e.g. "30%", only when stated
  tasks: ExtractedTask[];
};
export type ExtractionResult = {
  is_assignment_material: boolean;
  error: string | null; // set when is_assignment_material is false
  assignments: ExtractedAssignment[];
};

const nullable = (type: string, description: string) => ({
  anyOf: [{ type }, { type: "null" }],
  description,
});

export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_assignment_material", "error", "assignments"],
  properties: {
    is_assignment_material: {
      type: "boolean",
      description: "False if the documents are not university assignment materials.",
    },
    error: nullable("string", "One plain sentence for the student when is_assignment_material is false, otherwise null."),
    assignments: {
      type: "array",
      description: "One entry per assignment described. Empty when is_assignment_material is false.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "due_date", "due_date_text", "weighting", "tasks"],
        properties: {
          title: { type: "string", description: "The assignment's own name only, e.g. 'Assignment 1: Analysis Report'. No course code or course name." },
          due_date: nullable("string", "YYYY-MM-DD. Null unless the documents state the date explicitly."),
          due_date_text: nullable("string", "The exact wording in the documents that gives the due date, or null."),
          weighting: nullable("string", "Share of the course grade as written, e.g. '30%'. Null if not stated."),
          tasks: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "description", "hours_lo", "hours_hi"],
              properties: {
                name: { type: "string", description: "Short label, 8 words or fewer." },
                description: { type: "string", description: "One brief sentence saying what the student does in this task." },
                hours_lo: { type: "number" },
                hours_hi: { type: "number" },
              },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You read the documents for ONE university assignment (brief, rubric, requirements and tasks, sometimes a course-content page) and return the assignment(s) with a task breakdown and effort estimate for a typical student.

Rules:
- Some documents are printouts of web pages. Ignore navigation, footers, cookie banners and other page noise.
- If the documents are not assignment materials (lecture slides, an article, a receipt, unreadable), set is_assignment_material to false, explain in one plain sentence in "error", and return no assignments.
- If a schedule lists several assignments, return each one. Otherwise return one.
- Never invent a due date. Return due_date only if a date is stated for that assignment; use null otherwise. If the year is not stated, return null and quote the wording in due_date_text.
- Return weighting only if stated, as written. It is only a sanity check on the total hours: a 10% task is rarely 60 hours.
- Build the task list from what the brief asks the student to produce. Use the rubric to shape and name the tasks so effort goes where the marks are. Include reading, research, drafting and revision as tasks where the brief implies them. Use 3 to 8 tasks. Keep each task name to 8 words or fewer; put the detail in its one-sentence description.
- The title is the assignment's own name only (e.g. "Assignment 1: Analysis Report"). Leave out the course code and course name; the student supplies those separately.
- Every task gets an hour range: hours_lo and hours_hi, whole or half hours, hours_lo < hours_hi. Never a single number.`;

export async function extractAssignments(
  pdfs: { name: string; data: Buffer }[],
): Promise<{ result: ExtractionResult; usage: Anthropic.Usage }> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY; server-side only
  const content: Anthropic.ContentBlockParam[] = [];
  for (const pdf of pdfs) {
    content.push({ type: "text", text: `Document: ${pdf.name}` });
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdf.data.toString("base64") },
    });
  }
  content.push({ type: "text", text: "Extract the assignment(s) from these documents." });

  const response = await client.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new Error(`Extraction stopped early: ${response.stop_reason}`);
  }
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No text in response");
  return { result: JSON.parse(text.text) as ExtractionResult, usage: response.usage };
}
