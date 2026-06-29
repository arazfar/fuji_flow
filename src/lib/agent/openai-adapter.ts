import {
  Agent,
  RunState,
  run,
  tool,
  webSearchTool,
  type RunToolApprovalItem,
  type NonStreamRunOptions,
} from "@openai/agents";
import { z } from "zod";

import {
  actionPlanSchema,
  contextQuestionsOutputSchema,
  taskOutcomeSchema,
} from "./schemas";
import type {
  ActionPlan,
  AgentRunRecord,
  ApprovalRequest,
  ContextQuestion,
  TaskOutcome,
} from "./types";

const runOptions = {
  maxTurns: 8,
  toolExecution: {
    preApprovalInputGuardrails: true,
  },
} satisfies NonStreamRunOptions;

function modelConfig() {
  return process.env.OPENAI_MODEL ? { model: process.env.OPENAI_MODEL } : {};
}

function taskPrompt(run: AgentRunRecord) {
  return [
    `Task title: ${run.task.title}`,
    run.task.notes ? `Task notes: ${run.task.notes}` : undefined,
    Object.keys(run.contextAnswers).length
      ? `Context answers: ${JSON.stringify(run.contextAnswers, null, 2)}`
      : undefined,
    run.plan ? `Approved plan: ${JSON.stringify(run.plan, null, 2)}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const completionToolSchema = z.object({
  summary: z.string().min(1),
  completedActions: z.array(z.string().min(1)).min(1),
});

export class OpenAIAgentsAdapter {
  readonly mode = "live" as const;
  readonly workflowKind = "todo" as const;

  async generateContextQuestions(
    task: AgentRunRecord["task"],
  ): Promise<ContextQuestion[]> {
    const agent = new Agent({
      name: "Todo context interviewer",
      ...modelConfig(),
      instructions:
        "Ask concise context-gathering questions before planning a todo task. Return 2-5 questions. Ask only for details that materially change the plan. Do not plan or execute yet.",
      outputType: contextQuestionsOutputSchema,
    });

    const result = await run(
      agent,
      `Create context questions for this task:\n${JSON.stringify(task, null, 2)}`,
      runOptions,
    );

    return requireFinalOutput(result.finalOutput, "context questions").questions;
  }

  async createPlan(
    runRecord: AgentRunRecord,
    answers: Record<string, string>,
  ): Promise<ActionPlan> {
    const agent = new Agent({
      name: "Todo action planner",
      ...modelConfig(),
      instructions:
        "Create a step-by-step action plan for a todo task after context has been gathered. If current facts, official links, phone numbers, deadlines, or requirements could matter, use web search and keep the plan honest. Never claim that external real-world actions can be completed by this app. Return structured output only.",
      tools: [
        webSearchTool({
          searchContextSize: "medium",
          externalWebAccess: true,
        }),
      ],
      outputType: actionPlanSchema,
    });

    const planningRun = {
      ...runRecord,
      contextAnswers: answers,
    };

    const result = await run(agent, taskPrompt(planningRun), runOptions);
    return requireFinalOutput(result.finalOutput, "action plan");
  }

  async executeApprovedPlan(runRecord: AgentRunRecord): Promise<{
    outcome: TaskOutcome;
    approvalRequest?: ApprovalRequest;
    sdkState?: string;
  }> {
    const completionTool = tool({
      name: "record_task_completion",
      description:
        "Record completion only for work that can truthfully be completed inside this app. Do not call this tool for bookings, purchases, calls, submissions, account changes, medical/legal/financial steps, or any other external action.",
      parameters: completionToolSchema,
      needsApproval: true,
      execute: async ({ summary, completedActions }) => ({
        recorded: true,
        summary,
        completedActions,
      }),
    });

    const agent = new Agent({
      name: "Approval gated todo executor",
      ...modelConfig(),
      instructions:
        "Execute only the already-approved plan. If the task can be completed inside the app, call record_task_completion; that tool requires human approval. If the task needs external action, do not call the tool and instead return concrete next steps with useful details such as official links, phone numbers, deadlines, and materials. Be explicit and do not overclaim.",
      tools: [
        completionTool,
        webSearchTool({
          searchContextSize: "medium",
          externalWebAccess: true,
        }),
      ],
      outputType: taskOutcomeSchema,
    });

    const firstResult = await run(agent, taskPrompt(runRecord), runOptions);
    const interruption = firstResult.interruptions?.[0];

    if (!interruption) {
      return {
        outcome: requireFinalOutput(firstResult.finalOutput, "task outcome"),
      };
    }

    const sdkState = firstResult.state.toString();
    const approvalRequest = approvalFromInterruption(interruption, runRecord);
    const resumedState = await RunState.fromString(agent, sdkState);
    const [resumedInterruption] = resumedState.getInterruptions();

    resumedState.approve(resumedInterruption ?? interruption);

    const resumed = await run(agent, resumedState, runOptions);

    return {
      outcome: requireFinalOutput(resumed.finalOutput, "approved task outcome"),
      approvalRequest,
      sdkState,
    };
  }
}

function requireFinalOutput<T>(output: T | undefined, label: string): T {
  if (!output) {
    throw new Error(`The agent did not return ${label}.`);
  }

  return output;
}

function approvalFromInterruption(
  interruption: RunToolApprovalItem,
  runRecord: AgentRunRecord,
): ApprovalRequest {
  return {
    id: crypto.randomUUID(),
    statement:
      runRecord.plan?.approvalPrompt ||
      "Approve the SDK tool call before the agent records completion.",
    riskLevel: runRecord.plan?.riskLevel || "medium",
    toolName: interruption.name,
    toolArguments: interruption.arguments,
  };
}
