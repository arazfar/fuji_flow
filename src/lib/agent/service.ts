import { DemoAgentsAdapter } from "./demo-adapter";
import { OpenAIAgentsAdapter } from "./openai-adapter";
import { reduceAgentRun } from "./reducer";
import { createRun, getRun, saveRun, toRunView } from "./store";
import type {
  ActionPlan,
  AdapterMode,
  AgentRunRecord,
  AgentRunView,
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
  return process.env.FUJI_FLOW_AGENT_MODE === "demo" || !process.env.OPENAI_API_KEY
    ? new DemoAgentsAdapter()
    : new OpenAIAgentsAdapter();
}

function getLiveOrDemoAdapter(mode: AdapterMode): AgentAdapter {
  return mode === "live" && process.env.FUJI_FLOW_AGENT_MODE !== "demo"
    ? new OpenAIAgentsAdapter()
    : new DemoAgentsAdapter();
}

export async function startAgentWorkflow(
  task: TaskSnapshot,
): Promise<AgentRunView> {
  const adapter = getAdapter();
  const run = createRun(task, adapter.mode);

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
): Promise<AgentRunView> {
  const run = requireRun(runId);
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

export async function approveAgentPlan(runId: string): Promise<AgentRunView> {
  const run = requireRun(runId);
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
): Promise<AgentRunView> {
  const run = requireRun(runId);
  const rejected = reduceAgentRun(run, {
    type: "rejected",
    reason,
  });
  return toRunView(saveRun(rejected));
}

function getAdapterForRun(run: AgentRunRecord): AgentAdapter {
  return getLiveOrDemoAdapter(run.mode);
}

function requireRun(runId: string): AgentRunRecord {
  const run = getRun(runId);
  if (!run) {
    throw new Error("Agent run not found. Start a new workflow for this task.");
  }
  return run;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected agent error.";
}
