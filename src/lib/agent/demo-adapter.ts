import type {
  ActionPlan,
  AgentRunRecord,
  ContextQuestion,
  TaskOutcome,
} from "./types";

const externalKeywords = [
  "book",
  "buy",
  "call",
  "cancel",
  "doctor",
  "dmv",
  "flight",
  "passport",
  "pay",
  "permit",
  "phone",
  "refund",
  "reservation",
  "schedule",
  "submit",
  "tax",
];

const creativeKeywords = [
  "draft",
  "outline",
  "plan",
  "summarize",
  "brainstorm",
  "write",
  "organize",
  "checklist",
];

export class DemoAgentsAdapter {
  readonly mode = "demo" as const;
  readonly workflowKind = "todo" as const;

  async generateContextQuestions(
    task: AgentRunRecord["task"],
  ): Promise<ContextQuestion[]> {
    const asksDeadline = /deadline|due|appointment|renew|expire/i.test(
      `${task.title} ${task.notes ?? ""}`,
    );

    return [
      {
        id: "goal",
        label: "What outcome would make this task feel done?",
        helpText: "Be specific about the result, not just the activity.",
        placeholder: "Example: I have a ready-to-send email draft.",
        type: "long",
        required: true,
      },
      {
        id: "constraints",
        label: "Any constraints, preferences, or things to avoid?",
        placeholder: "Budget, tone, location, account details, timing...",
        type: "long",
        required: false,
      },
      {
        id: asksDeadline ? "deadline" : "materials",
        label: asksDeadline
          ? "What deadline or appointment window matters?"
          : "What information or materials do you already have?",
        placeholder: asksDeadline
          ? "Example: Before Friday at 5 PM"
          : "Links, documents, names, dates, account numbers...",
        type: asksDeadline ? "date" : "long",
        required: false,
      },
    ];
  }

  async createPlan(
    run: AgentRunRecord,
    answers: Record<string, string>,
  ): Promise<ActionPlan> {
    const text = `${run.task.title} ${run.task.notes ?? ""}`.toLowerCase();
    const canComplete = creativeKeywords.some((keyword) => text.includes(keyword));
    const needsExternal = externalKeywords.some((keyword) => text.includes(keyword));
    const feasibility = canComplete && !needsExternal ? "can_complete" : "needs_user_action";

    return {
      summary:
        feasibility === "can_complete"
          ? "Create a focused deliverable directly inside this workflow."
          : "Prepare the user to complete the real-world step without pretending it was done.",
      feasibility,
      estimatedEffort: feasibility === "can_complete" ? "Under 2 minutes" : "5-15 minutes",
      requiresCurrentInfo: needsExternal,
      riskLevel: needsExternal ? "medium" : "low",
      approvalPrompt:
        feasibility === "can_complete"
          ? "Approve this plan to let the agent prepare the requested deliverable and mark the task complete."
          : "Approve this plan to let the agent prepare concrete next steps for you to take.",
      steps: [
        {
          id: "understand",
          title: "Clarify the target outcome",
          detail:
            answers.goal ||
            "Use the task title and notes to infer the intended finished state.",
          owner: "agent",
        },
        {
          id: "prepare",
          title:
            feasibility === "can_complete"
              ? "Produce the useful artifact"
              : "Gather actionable next steps",
          detail:
            feasibility === "can_complete"
              ? "Draft a concise completion summary and checklist."
              : "Identify links, phone numbers, deadlines, and materials the user should have ready.",
          owner: "agent",
        },
        {
          id: "confirm",
          title:
            feasibility === "can_complete"
              ? "Record completion"
              : "Hand off user actions",
          detail:
            feasibility === "can_complete"
              ? "Only mark the task complete after the approval-gated completion step succeeds."
              : "Leave the task open with practical next actions.",
          owner: feasibility === "can_complete" ? "agent" : "user",
        },
      ],
    };
  }

  async executeApprovedPlan(run: AgentRunRecord): Promise<{ outcome: TaskOutcome }> {
    const canComplete = run.plan?.feasibility === "can_complete";

    if (canComplete) {
      return {
        outcome: {
          status: "completed",
          summary: "The agent prepared a concise completion artifact for this task.",
          completedActions: [
            `Defined the target outcome for "${run.task.title}".`,
            "Created a practical checklist from the provided context.",
            "Recorded the task as complete after explicit approval.",
          ],
          nextSteps: [],
          citations: [],
        },
      };
    }

    return {
      outcome: {
        status: "needs_user_action",
        summary:
          "This task needs an external action, so the agent prepared a user-action handoff instead of claiming completion.",
        completedActions: ["Converted the task into a practical action checklist."],
        nextSteps: [
          {
            title: "Open the official service page",
            detail:
              "Use the relevant official website for this task and verify current instructions before submitting anything.",
            link: "https://www.usa.gov/",
            materials: [
              "Task notes",
              "Relevant account details",
              "Government ID if applicable",
            ],
          },
          {
            title: "Call before deadlines if timing matters",
            detail:
              "If the task has a deadline or appointment dependency, call the official support number listed on the service page.",
            phone: "Use the phone number on the official page",
            deadline: "As soon as possible if there is a due date",
          },
        ],
        citations: [
          {
            title: "USA.gov official services directory",
            url: "https://www.usa.gov/",
          },
        ],
      },
    };
  }
}
