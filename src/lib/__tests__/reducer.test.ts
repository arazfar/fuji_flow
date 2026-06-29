import { describe, expect, it } from "vitest";

import { reduceAgentRun } from "../agent/reducer";
import type { AgentRunRecord } from "../agent/types";

describe("agent workflow reducer", () => {
  it("moves from context questions to planning to approval", () => {
    const run = makeRun();

    const withQuestions = reduceAgentRun(run, {
      type: "questions_ready",
      questions: [
        {
          id: "goal",
          label: "Goal?",
          required: true,
          type: "long",
        },
        {
          id: "constraints",
          label: "Constraints?",
          required: false,
          type: "long",
        },
      ],
    });

    const planning = reduceAgentRun(withQuestions, {
      type: "answers_submitted",
      answers: { goal: "Finish it" },
    });

    const approvedReady = reduceAgentRun(planning, {
      type: "plan_ready",
      plan: {
        summary: "Do the task",
        feasibility: "can_complete",
        estimatedEffort: "2 minutes",
        requiresCurrentInfo: false,
        riskLevel: "low",
        approvalPrompt: "Approve completion",
        steps: [
          {
            id: "one",
            title: "Step one",
            detail: "Detail",
            owner: "agent",
          },
          {
            id: "two",
            title: "Step two",
            detail: "Detail",
            owner: "agent",
          },
        ],
      },
    });

    expect(withQuestions.status).toBe("gathering_context");
    expect(planning.status).toBe("planning");
    expect(approvedReady.status).toBe("awaiting_approval");
    expect(approvedReady.approvalRequest?.statement).toBe("Approve completion");
    expect(approvedReady.timeline).toHaveLength(3);
  });

  it("records rejected plans as user action", () => {
    const rejected = reduceAgentRun(makeRun(), {
      type: "rejected",
      reason: "Too broad",
    });

    expect(rejected.status).toBe("needs_user_action");
    expect(rejected.outcome?.nextSteps[0].detail).toBe("Too broad");
  });
});

function makeRun(): AgentRunRecord {
  const timestamp = new Date().toISOString();

  return {
    id: "run-1",
    task: {
      taskId: "task-1",
      title: "Test task",
    },
    mode: "live",
    workflowKind: "todo",
    status: "idle",
    createdAt: timestamp,
    updatedAt: timestamp,
    contextQuestions: [],
    contextAnswers: {},
    timeline: [],
  };
}
