import { Agent, run, type NonStreamRunOptions } from "@openai/agents";
import { z } from "zod";

import {
  type ExtractedTask,
  type SharpenQuestion,
  type TaskUnderstanding,
  taskExtractionSchema,
  taskUnderstandingSchema,
} from "@/lib/task-intelligence";

export const runtime = "nodejs";

const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("understand"),
    task: z.object({
      title: z.string().min(1).max(140),
      notes: z.string().max(1200).optional(),
    }),
  }),
  z.object({
    action: z.literal("extract"),
    text: z.string().min(1).max(8000),
  }),
]);

const runOptions = {
  maxTurns: 4,
} satisfies NonStreamRunOptions;

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for task understanding.");
    }

    const command = commandSchema.parse(await request.json());

    if (command.action === "understand") {
      return Response.json(await understandTask(command.task));
    }

    return Response.json(await extractTasks(command.text));
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Task understanding failed.",
      },
      {
        status: 400,
      },
    );
  }
}

async function understandTask(task: {
  title: string;
  notes?: string;
}): Promise<TaskUnderstanding & { questions: SharpenQuestion[] }> {
  const agent = new Agent({
    name: "Fuji Flow task analyst",
    ...modelConfig(),
    instructions: taskUnderstandingInstructions(),
    outputType: taskUnderstandingSchema,
  });
  const result = await run(
    agent,
    `Analyze this task:\n${JSON.stringify(task, null, 2)}`,
    runOptions,
  );
  const output = requireOutput(result.finalOutput, "task understanding");

  return {
    taskPatch: output.taskPatch,
    questions: output.questions.map(hydrateQuestion),
  };
}

async function extractTasks(text: string): Promise<{ tasks: ExtractedTask[] }> {
  const agent = new Agent({
    name: "Fuji Flow dump extractor",
    ...modelConfig(),
    instructions: [
      taskUnderstandingInstructions(),
      "Extract separate atomic tasks from a messy spoken or pasted task dump.",
      "Preserve implied location context. If the user says 'while I am there' after naming a place, attach that place to the later task's locationContext.",
      "Do not merge unrelated tasks. Do not include filler, uncertainty markers, or standalone place visits unless the visit is itself actionable.",
    ].join(" "),
    outputType: taskExtractionSchema,
  });
  const result = await run(agent, `Extract tasks from this dump:\n${text}`, runOptions);
  const output = requireOutput(result.finalOutput, "task extraction");

  return {
    tasks: output.tasks.map((task) => ({
      ...task,
      questions: task.questions.map(hydrateQuestion),
    })),
  };
}

function hydrateQuestion(question: TaskUnderstanding["questions"][number]): SharpenQuestion {
  return {
    ...question,
    id: crypto.randomUUID(),
    taskId: null,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

function taskUnderstandingInstructions() {
  return [
    "Return structured task metadata and only questions that materially improve planning, delegation, route planning, timing, cost, dependency handling, or whether to do the task at all.",
    "Prefer yes/no or 2-4 option multiple-choice questions. Include 'Not sure' when useful.",
    "Protect relationship-presence tasks from careless delegation.",
    "For low-presence errands that another person, delivery, pickup, mail, or courier could handle, prefer human_delegate.",
    "Use ai_delegate when the useful work is digital research, writing, planning, summarizing, or comparison.",
    "Use hybrid when OpenAI can prepare options but the user should execute or decide.",
    "Use do_self when the user's body, taste, relationship, privacy, or direct judgment is central.",
    "Use JSON null for absent nullable fields.",
  ].join(" ");
}

function modelConfig() {
  return process.env.OPENAI_MODEL ? { model: process.env.OPENAI_MODEL } : {};
}

function requireOutput<T>(output: T | undefined, label: string): T {
  if (!output) {
    throw new Error(`OpenAI did not return ${label}.`);
  }
  return output;
}
