import { describe, expect, it } from "vitest";

import { DemoAgentsAdapter } from "../agent/demo-adapter";
import type { AgentRunRecord } from "../agent/types";

describe("DemoAgentsAdapter", () => {
  it("asks context questions before planning", async () => {
    const adapter = new DemoAgentsAdapter();
    const questions = await adapter.generateContextQuestions({
      taskId: "task-1",
      title: "Draft a project brief",
    });

    expect(questions.length).toBeGreaterThanOrEqual(2);
    expect(questions[0].id).toBe("goal");
  });

  it("allows in-app creative tasks to complete", async () => {
    const adapter = new DemoAgentsAdapter();
    const run = makeRun("Draft a project brief");
    const plan = await adapter.createPlan(run, {
      goal: "A concise brief",
    });
    const result = await adapter.executeApprovedPlan({
      ...run,
      plan,
    });

    expect(plan.feasibility).toBe("can_complete");
    expect(result.outcome.status).toBe("completed");
  });

  it("does not overclaim external tasks", async () => {
    const adapter = new DemoAgentsAdapter();
    const run = makeRun("Book a dentist appointment");
    const plan = await adapter.createPlan(run, {
      goal: "Get an appointment",
    });
    const result = await adapter.executeApprovedPlan({
      ...run,
      plan,
    });

    expect(plan.feasibility).toBe("needs_user_action");
    expect(result.outcome.status).toBe("needs_user_action");
    expect(result.outcome.nextSteps[0].link).toBe("https://www.usa.gov/");
  });
});

function makeRun(title: string): AgentRunRecord {
  const timestamp = new Date().toISOString();

  return {
    id: "run-1",
    task: {
      taskId: "task-1",
      title,
    },
    mode: "demo",
    status: "idle",
    createdAt: timestamp,
    updatedAt: timestamp,
    contextQuestions: [],
    contextAnswers: {},
    timeline: [],
  };
}
