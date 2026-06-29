import { z } from "zod";

export const taskCategories = [
  "errand",
  "call",
  "home",
  "computer",
  "relationship",
  "appointment",
  "unknown",
] as const;

export const delegationRecommendations = [
  "do_self",
  "ai_delegate",
  "human_delegate",
  "hybrid",
  "defer_or_drop",
  "unknown",
] as const;

export const presenceValues = ["low", "medium", "high", "unknown"] as const;
export const privacyRisks = ["low", "medium", "high", "unknown"] as const;

export const taskMetadataSchema = z.object({
  category: z.enum(taskCategories),
  locationRelevant: z.boolean(),
  locationContext: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  estimatedMinutes: z.number().int().positive().nullable().optional(),
  presenceValue: z.enum(presenceValues),
  privacyRisk: z.enum(privacyRisks),
  delegationRecommendation: z.enum(delegationRecommendations),
  confidence: z.number().min(0).max(1),
  rationale: z.string().optional(),
});

export const sharpenQuestionSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().nullable().optional(),
  scope: z.enum(["task", "batch", "preference", "policy"]),
  question: z.string().min(1),
  options: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        value: z.string().min(1),
      }),
    )
    .min(2)
    .max(4),
  unlocks: z.array(
    z.enum([
      "route",
      "deadline",
      "delegation",
      "duration",
      "dependency",
      "presence_value",
      "cost",
    ]),
  ),
  expectedValue: z.number().min(0).max(1),
  estimatedSeconds: z.number().int().positive(),
  status: z.enum(["pending", "answered", "skipped", "expired"]),
  createdAt: z.string(),
  answeredAt: z.string().nullable().optional(),
  answer: z.string().optional(),
});

export const aiSharpenQuestionSchema = sharpenQuestionSchema.omit({
  id: true,
  taskId: true,
  status: true,
  createdAt: true,
  answeredAt: true,
  answer: true,
});

export const taskUnderstandingSchema = z.object({
  taskPatch: taskMetadataSchema,
  questions: z.array(aiSharpenQuestionSchema).max(5),
});

export const extractedTaskSchema = z.object({
  title: z.string().min(1).max(140),
  notes: z.string().max(1200).optional(),
  sourceText: z.string().optional(),
  taskPatch: taskMetadataSchema,
  questions: z.array(aiSharpenQuestionSchema).max(5),
});

export const taskExtractionSchema = z.object({
  tasks: z.array(extractedTaskSchema),
});

export type TaskMetadata = z.infer<typeof taskMetadataSchema>;
export type SharpenQuestion = z.infer<typeof sharpenQuestionSchema>;
export type TaskUnderstanding = z.infer<typeof taskUnderstandingSchema>;
export type ExtractedTask = z.infer<typeof extractedTaskSchema>;

type RankableQuestion = SharpenQuestion & {
  taskConfidence?: number;
  skippedRelated?: boolean;
  deadline?: string | null;
};

export function rankSharpenQuestions(questions: RankableQuestion[]): RankableQuestion[] {
  const now = Date.now();

  return [...questions].sort((left, right) => scoreQuestion(right, now) - scoreQuestion(left, now));
}

export function applySharpenAnswer(
  metadata: TaskMetadata,
  question: SharpenQuestion,
  answer: string,
): TaskMetadata {
  const normalized = answer.toLowerCase();
  const patch: Partial<TaskMetadata> = {
    confidence: Math.min(0.98, metadata.confidence + 0.12),
  };

  if (question.unlocks.includes("presence_value")) {
    patch.presenceValue =
      normalized.includes("yes") || normalized.includes("personal") ? "high" : "low";
  }

  if (question.unlocks.includes("delegation")) {
    if (normalized.includes("no")) patch.delegationRecommendation = "do_self";
    if (
      normalized.includes("yes") ||
      normalized.includes("delivery") ||
      normalized.includes("mail") ||
      normalized.includes("courier")
    ) {
      patch.delegationRecommendation =
        metadata.category === "computer" ? "ai_delegate" : "human_delegate";
    }
  }

  if (question.unlocks.includes("deadline")) {
    patch.deadline = normalized.includes("today")
      ? "today"
      : normalized.includes("week")
        ? "this week"
        : metadata.deadline;
  }

  return {
    ...metadata,
    ...patch,
  };
}

function scoreQuestion(question: RankableQuestion, now: number): number {
  const confidenceGap = 1 - (question.taskConfidence ?? 0.5);
  const urgencyMultiplier = question.deadline && question.deadline !== "No deadline" ? 1.3 : 1;
  const easeMultiplier = question.estimatedSeconds <= 10 ? 1.2 : 1;
  const annoyancePenalty = question.skippedRelated ? 0.1 : 0;
  const ageWeeks = (now - new Date(question.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 7);
  const stalenessPenalty = Math.max(0, ageWeeks * 0.05);

  return (
    question.expectedValue * urgencyMultiplier * confidenceGap * easeMultiplier -
    annoyancePenalty -
    stalenessPenalty
  );
}
