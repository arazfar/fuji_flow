import type {
  AgentRunRecord,
  AgentRunView,
  AgentWorkflowKind,
  TaskSnapshot,
} from "./types";

const STORE_KEY = "__fujiFlowAgentRuns";

type StoreGlobal = typeof globalThis & {
  [STORE_KEY]?: Map<string, AgentRunRecord>;
};

function store(): Map<string, AgentRunRecord> {
  const target = globalThis as StoreGlobal;
  target[STORE_KEY] ??= new Map<string, AgentRunRecord>();
  return target[STORE_KEY];
}

export function createRun(
  task: TaskSnapshot,
  mode: AgentRunRecord["mode"],
  workflowKind: AgentWorkflowKind = "todo",
) {
  const timestamp = new Date().toISOString();
  const run: AgentRunRecord = {
    id: crypto.randomUUID(),
    task,
    mode,
    workflowKind,
    status: "idle",
    createdAt: timestamp,
    updatedAt: timestamp,
    contextQuestions: [],
    contextAnswers: {},
    timeline: [
      {
        id: crypto.randomUUID(),
        status: "idle",
        title: "Agent ready",
        body:
          workflowKind === "provider_lookup"
            ? "Provider lookup is ready to gather search details."
            : "OpenAI Agents SDK is configured for this run.",
        timestamp,
      },
    ],
  };

  store().set(run.id, run);
  return run;
}

export function getRun(runId: string): AgentRunRecord | undefined {
  return store().get(runId);
}

export function saveRun(run: AgentRunRecord): AgentRunRecord {
  store().set(run.id, run);
  return run;
}

export function clearRunsForTests(): void {
  store().clear();
}

export function toRunView(run: AgentRunRecord): AgentRunView {
  return {
    id: run.id,
    task: run.task,
    mode: run.mode,
    workflowKind: run.workflowKind,
    status: run.status,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    contextQuestions: run.contextQuestions,
    contextAnswers: run.contextAnswers,
    plan: run.plan,
    approvalRequest: run.approvalRequest,
    outcome: run.outcome,
    error: run.error,
    timeline: run.timeline,
  };
}
