import { describe, expect, it } from "vitest";

import { ProviderLookupAdapter } from "../agent/provider-lookup-adapter";
import type { AgentRunRecord } from "../agent/types";
import { isProviderLookupTask } from "../provider-lookup/intent";

describe("provider lookup workflow", () => {
  it("detects doctor and dentist appointment tasks", () => {
    expect(isProviderLookupTask("Make a doctor appointment")).toBe(true);
    expect(isProviderLookupTask("Find a dentist phone number")).toBe(true);
    expect(isProviderLookupTask("Draft appointment follow-up notes")).toBe(false);
  });

  it("creates provider-specific context and handoff results", async () => {
    const adapter = new ProviderLookupAdapter("demo");
    const run = makeRun("Find a dentist phone number");
    const questions = await adapter.generateContextQuestions(run.task);

    expect(questions.map((question) => question.id)).toContain("location");

    const plan = await adapter.createPlan(run, {
      location: "San Francisco, CA",
      service: "cleaning",
      insurance: "Delta Dental",
      preferences: "within 5 miles, accepting new patients",
    });

    const result = await adapter.executeApprovedPlan({
      ...run,
      plan,
      contextAnswers: {
        location: "San Francisco, CA",
        service: "cleaning",
        insurance: "Delta Dental",
        preferences: "within 5 miles, accepting new patients",
      },
    });

    expect(plan.feasibility).toBe("needs_user_action");
    expect(result.outcome.status).toBe("needs_user_action");
    expect(result.outcome.nextSteps[0].phone).toEqual(expect.any(String));
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
    workflowKind: "provider_lookup",
    status: "idle",
    createdAt: timestamp,
    updatedAt: timestamp,
    contextQuestions: [],
    contextAnswers: {},
    timeline: [],
  };
}
