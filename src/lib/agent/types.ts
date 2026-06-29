export const agentRunStatuses = [
  "idle",
  "gathering_context",
  "planning",
  "awaiting_approval",
  "executing",
  "completed",
  "needs_user_action",
  "error",
] as const;

export type AgentRunStatus = (typeof agentRunStatuses)[number];

export type AdapterMode = "demo" | "live";

export type TaskSnapshot = {
  taskId: string;
  title: string;
  notes?: string;
};

export type ContextQuestionType = "short" | "long" | "date" | "url";

export type ContextQuestion = {
  id: string;
  label: string;
  helpText?: string;
  placeholder?: string;
  type: ContextQuestionType;
  required: boolean;
};

export type ActionPlanStep = {
  id: string;
  title: string;
  detail: string;
  owner: "agent" | "user";
};

export type ActionPlan = {
  summary: string;
  feasibility: "can_complete" | "needs_user_action" | "mixed";
  estimatedEffort: string;
  requiresCurrentInfo: boolean;
  riskLevel: "low" | "medium" | "high";
  approvalPrompt: string;
  steps: ActionPlanStep[];
};

export type Citation = {
  title: string;
  url: string;
};

export type NextStep = {
  title: string;
  detail: string;
  link?: string;
  phone?: string;
  deadline?: string;
  materials?: string[];
};

export type TaskOutcome = {
  status: "completed" | "needs_user_action";
  summary: string;
  completedActions: string[];
  nextSteps: NextStep[];
  citations: Citation[];
};

export type ApprovalRequest = {
  id: string;
  statement: string;
  riskLevel: ActionPlan["riskLevel"];
  toolName?: string;
  toolArguments?: string;
};

export type TimelineEvent = {
  id: string;
  status: AgentRunStatus;
  title: string;
  body: string;
  timestamp: string;
};

export type AgentRunView = {
  id: string;
  task: TaskSnapshot;
  mode: AdapterMode;
  status: AgentRunStatus;
  createdAt: string;
  updatedAt: string;
  contextQuestions: ContextQuestion[];
  contextAnswers: Record<string, string>;
  plan?: ActionPlan;
  approvalRequest?: ApprovalRequest;
  outcome?: TaskOutcome;
  error?: string;
  timeline: TimelineEvent[];
};

export type AgentRunRecord = AgentRunView & {
  sdkState?: string;
};

export type StartAgentResponse = {
  run: AgentRunView;
};

export type AgentCommandResponse = {
  run: AgentRunView;
};
