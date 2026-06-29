import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/agent/route";
import { clearRunsForTests } from "../agent/store";

describe("agent API route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearRunsForTests();
  });

  it("runs the demo start, context, and approval flow without an API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    const start = await post({
      action: "start",
      task: {
        taskId: "task-1",
        title: "Draft a project brief",
      },
    });
    expect(start.status).toBe(200);
    const startPayload = await start.json();

    expect(startPayload.run.mode).toBe("demo");
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
