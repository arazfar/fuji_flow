import { z } from "zod";

import { agentRunStatuses } from "./types";

export const contextQuestionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  helpText: z.string().optional(),
  placeholder: z.string().optional(),
  type: z.enum(["short", "long", "date", "url"]),
  required: z.boolean().default(false),
});

export const contextQuestionsOutputSchema = z.object({
  questions: z.array(contextQuestionSchema).min(2).max(5),
});

export const actionPlanStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().min(1),
  owner: z.enum(["agent", "user"]),
});

export const actionPlanSchema = z.object({
  summary: z.string().min(1),
  feasibility: z.enum(["can_complete", "needs_user_action", "mixed"]),
  estimatedEffort: z.string().min(1),
  requiresCurrentInfo: z.boolean(),
  riskLevel: z.enum(["low", "medium", "high"]),
  approvalPrompt: z.string().min(1),
  steps: z.array(actionPlanStepSchema).min(2).max(8),
});

export const citationSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
});

export const nextStepSchema = z.object({
  title: z.string().min(1),
  detail: z.string().min(1),
  link: z.string().url().optional(),
  phone: z.string().optional(),
  deadline: z.string().optional(),
  materials: z.array(z.string().min(1)).optional(),
});

export const taskOutcomeSchema = z.object({
  status: z.enum(["completed", "needs_user_action"]),
  summary: z.string().min(1),
  completedActions: z.array(z.string().min(1)),
  nextSteps: z.array(nextStepSchema),
  citations: z.array(citationSchema),
});

export const taskSnapshotSchema = z.object({
  taskId: z.string().min(1),
  title: z.string().min(1).max(140),
  notes: z.string().max(1200).optional(),
});

export const contextAnswersSchema = z.record(
  z.string().min(1),
  z.string().max(1200),
);

export const approvalRequestSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1),
  riskLevel: z.enum(["low", "medium", "high"]),
  toolName: z.string().optional(),
  toolArguments: z.string().optional(),
});

export const workflowEventSchema = z.object({
  id: z.string().min(1),
  status: z.enum(agentRunStatuses),
  title: z.string(),
  body: z.string(),
  timestamp: z.string(),
});

export const agentRunViewSchema = z.object({
  id: z.string().min(1),
  task: taskSnapshotSchema,
  mode: z.literal("live"),
  workflowKind: z.enum(["todo", "provider_lookup"]),
  status: z.enum(agentRunStatuses),
  createdAt: z.string(),
  updatedAt: z.string(),
  contextQuestions: z.array(contextQuestionSchema),
  contextAnswers: contextAnswersSchema,
  plan: actionPlanSchema.optional(),
  approvalRequest: approvalRequestSchema.optional(),
  outcome: taskOutcomeSchema.optional(),
  error: z.string().optional(),
  timeline: z.array(workflowEventSchema),
});

export const startAgentCommandSchema = z.object({
  action: z.literal("start"),
  task: taskSnapshotSchema,
  workflowKind: z.enum(["todo", "provider_lookup"]).optional(),
});

export const answerContextCommandSchema = z.object({
  action: z.literal("answer_context"),
  runId: z.string().min(1),
  answers: contextAnswersSchema,
  run: agentRunViewSchema.optional(),
});

export const approveAgentCommandSchema = z.object({
  action: z.literal("approve"),
  runId: z.string().min(1),
  run: agentRunViewSchema.optional(),
});

export const rejectAgentCommandSchema = z.object({
  action: z.literal("reject"),
  runId: z.string().min(1),
  reason: z.string().max(800).optional(),
  run: agentRunViewSchema.optional(),
});

export const agentCommandSchema = z.discriminatedUnion("action", [
  startAgentCommandSchema,
  answerContextCommandSchema,
  approveAgentCommandSchema,
  rejectAgentCommandSchema,
]);
