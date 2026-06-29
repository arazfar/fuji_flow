import { OpenAIAgentsAdapter } from "./openai-adapter";
import { ProviderLookupAdapter } from "./provider-lookup-adapter";
import { reduceAgentRun } from "./reducer";
import { createRun, getRun, saveRun, toRunView } from "./store";
import type {
  ActionPlan,
  AdapterMode,
  AgentRunRecord,
  AgentRunView,
  AgentWorkflowKind,
  ApprovalRequest,
  ContextQuestion,
  TaskOutcome,
  TaskSnapshot,
} from "./types";

type ExecutionResult = {
  outcome: TaskOutcome;
  approvalRequest?: ApprovalRequest;
  sdkState?: string;
};

type AgentAdapter = {
  readonly mode: AdapterMode;
  readonly workflowKind: AgentWorkflowKind;
  generateContextQuestions(
    task: AgentRunRecord["task"],
  ): Promise<ContextQuestion[]>;
  createPlan(
    runRecord: AgentRunRecord,
    answers: Record<string, string>,
  ): Promise<ActionPlan>;
  executeApprovedPlan(runRecord: AgentRunRecord): Promise<ExecutionResult>;
};

function getAdapter(): AgentAdapter {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to run Fuji Flow agents.");
  }
  return new OpenAIAgentsAdapter();
}

function getAdapterForWorkflow(workflowKind: AgentWorkflowKind): AgentAdapter {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to run Fuji Flow agents.");
  }

  if (workflowKind === "provider_lookup") {
    return new ProviderLookupAdapter("live");
  }

  return getAdapter();
}

export async function startAgentWorkflow(
  task: TaskSnapshot,
  workflowKind: AgentWorkflowKind = "todo",
): Promise<AgentRunView> {
  const adapter = getAdapterForWorkflow(workflowKind);
  const run = createRun(task, adapter.mode, adapter.workflowKind);

  try {
    const questions = await adapter.generateContextQuestions(run.task);
    const updated = reduceAgentRun(run, {
      type: "questions_ready",
      questions,
    });
    return toRunView(saveRun(updated));
  } catch (error) {
    const failed = reduceAgentRun(run, {
      type: "failed",
      error: errorMessage(error),
    });
    return toRunView(saveRun(failed));
  }
}

export async function answerContext(
  runId: string,
  answers: Record<string, string>,
  fallbackRun?: AgentRunView,
): Promise<AgentRunView> {
  const run = requireRun(runId, fallbackRun);
  const adapter = getAdapterForRun(run);
  const planning = reduceAgentRun(run, {
    type: "answers_submitted",
    answers,
  });
  saveRun(planning);

  try {
    const plan = await adapter.createPlan(planning, answers);
    const updated = reduceAgentRun(planning, {
      type: "plan_ready",
      plan,
    });
    return toRunView(saveRun(updated));
  } catch (error) {
    const failed = reduceAgentRun(planning, {
      type: "failed",
      error: errorMessage(error),
    });
    return toRunView(saveRun(failed));
  }
}

export async function approveAgentPlan(
  runId: string,
  fallbackRun?: AgentRunView,
): Promise<AgentRunView> {
  const run = requireRun(runId, fallbackRun);
  if (run.status !== "awaiting_approval" || !run.plan) {
    throw new Error("This run is not awaiting approval.");
  }

  const adapter = getAdapterForRun(run);
  const executing = reduceAgentRun(run, { type: "approved" });
  saveRun(executing);

  try {
    const result = await adapter.executeApprovedPlan(executing);
    const finalRun = {
      ...executing,
      approvalRequest: result.approvalRequest ?? executing.approvalRequest,
      sdkState: result.sdkState,
    };
    const updated = reduceAgentRun(finalRun, {
      type:
        result.outcome.status === "completed"
          ? "completed"
          : "needs_user_action",
      outcome: result.outcome,
    });
    return toRunView(saveRun(updated));
  } catch (error) {
    const failed = reduceAgentRun(executing, {
      type: "failed",
      error: errorMessage(error),
    });
    return toRunView(saveRun(failed));
  }
}

export async function rejectAgentPlan(
  runId: string,
  reason?: string,
  fallbackRun?: AgentRunView,
): Promise<AgentRunView> {
  const run = requireRun(runId, fallbackRun);
  const rejected = reduceAgentRun(run, {
    type: "rejected",
    reason,
  });
  return toRunView(saveRun(rejected));
}

function getAdapterForRun(run: AgentRunRecord): AgentAdapter {
  if (run.mode !== "live") {
    throw new Error("This run was created by an unsupported adapter mode.");
  }

  return getAdapterForWorkflow(run.workflowKind);
}

function requireRun(
  runId: string,
  fallbackRun?: AgentRunView,
): AgentRunRecord {
  const run = getRun(runId);
  if (run) {
    return run;
  }

  if (!fallbackRun || fallbackRun.id !== runId) {
    throw new Error("Agent run not found. Start a new workflow for this task.");
  }

  return saveRun({ ...fallbackRun });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected agent error.";
}
