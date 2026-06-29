import type { AgentRunRecord, AgentRunView, TaskSnapshot } from "./types";

const STORE_KEY = "__fujiFlowAgentRuns";

type StoreGlobal = typeof globalThis & {
  [STORE_KEY]?: Map<string, AgentRunRecord>;
};

function store(): Map<string, AgentRunRecord> {
  const target = globalThis as StoreGlobal;
  target[STORE_KEY] ??= new Map<string, AgentRunRecord>();
  return target[STORE_KEY];
}

export function createRun(task: TaskSnapshot, mode: AgentRunRecord["mode"]) {
  const timestamp = new Date().toISOString();
  const run: AgentRunRecord = {
    id: crypto.randomUUID(),
    task,
    mode,
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
          mode === "live"
            ? "OpenAI Agents SDK is configured for this run."
            : "Demo mode is active because OPENAI_API_KEY is not configured.",
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
