import type {
  ActionPlan,
  AgentRunRecord,
  ContextQuestion,
  TaskOutcome,
  TimelineEvent,
} from "./types";

type WorkflowEvent =
  | { type: "questions_ready"; questions: ContextQuestion[] }
  | { type: "answers_submitted"; answers: Record<string, string> }
  | { type: "plan_ready"; plan: ActionPlan }
  | { type: "approved" }
  | { type: "rejected"; reason?: string }
  | { type: "completed"; outcome: TaskOutcome }
  | { type: "needs_user_action"; outcome: TaskOutcome }
  | { type: "failed"; error: string };

const now = () => new Date().toISOString();

export function makeTimelineEvent(
  status: TimelineEvent["status"],
  title: string,
  body: string,
): TimelineEvent {
  return {
    id: crypto.randomUUID(),
    status,
    title,
    body,
    timestamp: now(),
  };
}

export function reduceAgentRun(
  run: AgentRunRecord,
  event: WorkflowEvent,
): AgentRunRecord {
  const updatedAt = now();

  switch (event.type) {
    case "questions_ready":
      return appendEvent(
        {
          ...run,
          status: "gathering_context",
          contextQuestions: event.questions,
          updatedAt,
        },
        "gathering_context",
        "Context requested",
        "The agent needs a few details before it can make a useful plan.",
      );
    case "answers_submitted":
      return appendEvent(
        {
          ...run,
          status: "planning",
          contextAnswers: event.answers,
          updatedAt,
        },
        "planning",
        "Planning started",
        "The agent is turning the task and answers into a concrete plan.",
      );
    case "plan_ready":
      return appendEvent(
        {
          ...run,
          status: "awaiting_approval",
          plan: event.plan,
          approvalRequest: {
            id: crypto.randomUUID(),
            riskLevel: event.plan.riskLevel,
            statement: event.plan.approvalPrompt,
          },
          updatedAt,
        },
        "awaiting_approval",
        "Approval needed",
        "Review the plan before the agent attempts any completion step.",
      );
    case "approved":
      return appendEvent(
        { ...run, status: "executing", updatedAt },
        "executing",
        "Execution approved",
        "The agent can now attempt the approved workflow.",
      );
    case "rejected":
      return appendEvent(
        {
          ...run,
          status: "needs_user_action",
          outcome: {
            status: "needs_user_action",
            summary: "The proposed plan was not approved.",
            completedActions: [],
            nextSteps: [
              {
                title: "Revise the task or relaunch the agent",
                detail:
                  event.reason?.trim() ||
                  "Add more detail to the task and start a fresh workflow when ready.",
              },
            ],
            citations: [],
          },
          updatedAt,
        },
        "needs_user_action",
        "Plan rejected",
        event.reason?.trim() || "The workflow stopped before execution.",
      );
    case "completed":
      return appendEvent(
        {
          ...run,
          status: "completed",
          outcome: event.outcome,
          updatedAt,
        },
        "completed",
        "Task completed",
        event.outcome.summary,
      );
    case "needs_user_action":
      return appendEvent(
        {
          ...run,
          status: "needs_user_action",
          outcome: event.outcome,
          updatedAt,
        },
        "needs_user_action",
        "User action needed",
        event.outcome.summary,
      );
    case "failed":
      return appendEvent(
        {
          ...run,
          status: "error",
          error: event.error,
          updatedAt,
        },
        "error",
        "Workflow error",
        event.error,
      );
  }
}

function appendEvent(
  run: AgentRunRecord,
  status: TimelineEvent["status"],
  title: string,
  body: string,
): AgentRunRecord {
  return {
    ...run,
    timeline: [...run.timeline, makeTimelineEvent(status, title, body)],
  };
}
