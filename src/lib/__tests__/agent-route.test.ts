import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/agent/route";
import { clearRunsForTests } from "../agent/store";

vi.mock("../agent/openai-adapter", () => ({
  OpenAIAgentsAdapter: class {
    readonly mode = "live" as const;

    async generateContextQuestions() {
      return [
        {
          id: "goal",
          label: "What outcome would make this task feel done?",
          required: true,
          type: "long" as const,
        },
        {
          id: "constraints",
          label: "Any constraints?",
          required: false,
          type: "long" as const,
        },
      ];
    }

    async createPlan() {
      return {
        summary: "Create a concise plan.",
        feasibility: "can_complete" as const,
        estimatedEffort: "2 minutes",
        requiresCurrentInfo: false,
        riskLevel: "low" as const,
        approvalPrompt: "Approve completion",
        steps: [
          {
            id: "one",
            title: "Clarify",
            detail: "Clarify the outcome.",
            owner: "agent" as const,
          },
          {
            id: "two",
            title: "Prepare",
            detail: "Prepare the result.",
            owner: "agent" as const,
          },
        ],
      };
    }

    async executeApprovedPlan() {
      return {
        outcome: {
          status: "completed" as const,
          summary: "Completed after approval.",
          completedActions: ["Prepared the approved result."],
          nextSteps: [],
          citations: [],
        },
      };
    }
  },
}));

describe("agent API route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearRunsForTests();
  });

  it("requires an OpenAI API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const response = await post({
      action: "start",
      task: {
        taskId: "task-1",
        title: "Draft a project brief",
      },
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("OPENAI_API_KEY is required");
  });

  it("runs the OpenAI start, context, and approval flow", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");

    const start = await post({
      action: "start",
      task: {
        taskId: "task-1",
        title: "Draft a project brief",
      },
    });
    expect(start.status).toBe(200);
    const startPayload = await start.json();

    expect(startPayload.run.mode).toBe("live");
    expect(startPayload.run.status).toBe("gathering_context");

    const answered = await post({
      action: "answer_context",
      runId: startPayload.run.id,
      answers: {
        goal: "A concise brief",
        constraints: "Plain English",
      },
    });
    const answeredPayload = await answered.json();

    expect(answeredPayload.run.status).toBe("awaiting_approval");

    const approved = await post({
      action: "approve",
      runId: answeredPayload.run.id,
    });
    const approvedPayload = await approved.json();

    expect(approvedPayload.run.status).toBe("completed");
    expect(approvedPayload.run.outcome.status).toBe("completed");
  });

  it("continues a run from the client snapshot if server memory is empty", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const start = await post({
      action: "start",
      task: {
        taskId: "task-1",
        title: "Draft a project brief",
      },
    });
    const startPayload = await start.json();

    clearRunsForTests();

    const answered = await post({
      action: "answer_context",
      runId: startPayload.run.id,
      run: startPayload.run,
      answers: {
        goal: "A concise brief",
        constraints: "Plain English",
      },
    });
    const answeredPayload = await answered.json();

    expect(answered.status).toBe(200);
    expect(answeredPayload.run.status).toBe("awaiting_approval");
  });

  it("rejects invalid commands", async () => {
    const response = await post({ action: "missing" });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toEqual(expect.any(String));
  });
});

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}
