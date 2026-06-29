import { uid } from "./storage.js";

const recommendationLabels = {
  do_self: "Do yourself",
  ai_delegate: "AI delegate",
  human_delegate: "Human delegate",
  hybrid: "Hybrid",
  defer_or_drop: "Defer/drop",
  unknown: "Unknown",
};

export function getRecommendationLabel(value) {
  return recommendationLabels[value] ?? value;
}

export function analyzeTask(rawTitle) {
  const title = rawTitle.trim();
  const lower = title.toLowerCase();

  const relationship = [
    "recital",
    "ceremony",
    "wedding",
    "birthday dinner",
    "visit mom",
    "visit dad",
    "parent teacher",
  ].some((word) => lower.includes(word));
  const research = ["research", "compare", "draft", "write", "email", "plan"].some((word) =>
    lower.includes(word),
  );
  const errand = ["return", "pick up", "pickup", "drop off", "mail", "groceries", "buy"].some(
    (word) => lower.includes(word),
  );
  const call = ["call", "phone", "book", "schedule"].some((word) => lower.includes(word));
  const home = ["clean", "fix", "replace", "organize"].some((word) => lower.includes(word));

  const category = relationship
    ? "relationship"
    : research
      ? "computer"
      : errand
        ? "errand"
        : call
          ? "call"
          : home
            ? "home"
            : "unknown";

  const delegationRecommendation = relationship
    ? "do_self"
    : research
      ? "ai_delegate"
      : errand
        ? "human_delegate"
        : call
          ? "hybrid"
          : home
            ? "hybrid"
            : "unknown";

  const taskPatch = {
    category,
    locationRelevant: errand,
    deadline: null,
    estimatedMinutes: relationship ? 90 : errand ? 35 : call ? 15 : research ? 45 : null,
    presenceValue: relationship ? "high" : errand || research ? "low" : "unknown",
    privacyRisk: lower.includes("passport") || lower.includes("prescription") ? "medium" : "low",
    delegationRecommendation,
    confidence: relationship || research || errand || call || home ? 0.74 : 0.42,
  };

  return {
    taskPatch,
    questions: buildQuestions(title, taskPatch),
  };
}

export function buildAgentRun(task, questions) {
  const unanswered = questions.filter((question) => question.status === "pending").slice(0, 3);
  const plan = buildPlan(task);
  const feasible = ["ai_delegate", "hybrid"].includes(task.delegationRecommendation);

  return {
    taskId: task.id,
    state: feasible ? "approval" : "handoff",
    contextQuestions: unanswered,
    plan,
    approval: feasible
      ? {
          title: "Approval required",
          body: `The agent can ${task.delegationRecommendation === "ai_delegate" ? "prepare a concrete output" : "prepare the work and leave the personal step to you"}. It will not act until you approve.`,
          actionLabel:
            task.delegationRecommendation === "ai_delegate" ? "Approve AI work" : "Approve prep",
        }
      : null,
    result: null,
    nextSteps: buildNextSteps(task),
  };
}

export function approveAgentRun(task) {
  if (task.delegationRecommendation === "ai_delegate") {
    return {
      state: "execute",
      result: {
        title: "AI work completed",
        body: `Drafted a practical first pass for "${task.title}". Review it, then decide whether to keep, edit, or discard it.`,
        details: [
          "Clarified the likely goal and constraints.",
          "Produced a concise action plan.",
          "Flagged any external dependency the agent cannot complete directly.",
        ],
      },
    };
  }

  if (task.delegationRecommendation === "hybrid") {
    return {
      state: "execute",
      result: {
        title: "Prep completed",
        body: `Prepared the parts of "${task.title}" that do not require your direct judgment or presence.`,
        details: [
          "Created a short script or checklist.",
          "Identified what you need before starting.",
          "Left the final action with you.",
        ],
      },
    };
  }

  return {
    state: "handoff",
    result: null,
  };
}

export function rankQuestions(tasks, questions) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const now = Date.now();

  return questions
    .filter((question) => question.status === "pending")
    .map((question) => {
      const task = tasksById.get(question.taskId);
      const confidenceGap = task ? 1 - task.confidence : 0.5;
      const easeMultiplier = question.estimatedSeconds <= 10 ? 1.2 : 1;
      const ageWeeks = (now - new Date(question.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 7);
      const stalenessPenalty = Math.max(0, ageWeeks * 0.05);
      return {
        ...question,
        score: question.expectedValue * confidenceGap * easeMultiplier - stalenessPenalty,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function applyAnswerToTask(task, question, answerValue) {
  const normalized = answerValue.toLowerCase();
  const patch = { confidence: Math.min(0.98, task.confidence + 0.12) };

  if (question.unlocks.includes("presence_value")) {
    patch.presenceValue = normalized.includes("yes") || normalized.includes("personal") ? "high" : "low";
    patch.delegationRecommendation = patch.presenceValue === "high" ? "do_self" : task.delegationRecommendation;
  }

  if (question.unlocks.includes("delegation")) {
    if (normalized.includes("yes") || normalized.includes("delivery") || normalized.includes("mail")) {
      patch.delegationRecommendation =
        task.category === "computer" ? "ai_delegate" : task.category === "errand" ? "human_delegate" : "hybrid";
    }
    if (normalized.includes("no")) {
      patch.delegationRecommendation = "do_self";
    }
  }

  if (question.unlocks.includes("deadline")) {
    patch.deadline = normalized.includes("today")
      ? "today"
      : normalized.includes("week")
        ? "this week"
        : task.deadline;
  }

  return { ...task, ...patch, updatedAt: new Date().toISOString() };
}

function buildQuestions(title, taskPatch) {
  const createdAt = new Date().toISOString();
  const questions = [];

  if (taskPatch.presenceValue === "unknown" || taskPatch.presenceValue === "high") {
    questions.push({
      id: uid("q"),
      taskId: null,
      scope: "task",
      question: `Does "${title}" matter because you personally show up?`,
      options: optionSet(["Yes, my presence matters", "No, outcome matters most", "Not sure"]),
      unlocks: ["presence_value", "delegation"],
      expectedValue: 0.9,
      estimatedSeconds: 8,
      status: "pending",
      createdAt,
    });
  }

  if (taskPatch.locationRelevant) {
    questions.push({
      id: uid("q"),
      taskId: null,
      scope: "task",
      question: `Can "${title}" be handled by delivery, pickup, or mail?`,
      options: optionSet(["Yes", "No", "Not sure"]),
      unlocks: ["delegation", "route"],
      expectedValue: 0.86,
      estimatedSeconds: 7,
      status: "pending",
      createdAt,
    });
  }

  questions.push({
    id: uid("q"),
    taskId: null,
    scope: "task",
    question: `When does "${title}" need to be done?`,
    options: optionSet(["Today", "This week", "No deadline", "Not sure"]),
    unlocks: ["deadline"],
    expectedValue: 0.72,
    estimatedSeconds: 8,
    status: "pending",
    createdAt,
  });

  return questions;
}

function optionSet(labels) {
  return labels.map((label) => ({
    id: uid("opt"),
    label,
    value: label,
  }));
}

function buildPlan(task) {
  if (task.delegationRecommendation === "do_self") {
    return [
      "Confirm the time, location, and any materials you need.",
      "Block travel or focus time so this does not get squeezed by errands.",
      "Keep supporting tasks separate so only the meaningful presence stays with you.",
    ];
  }

  if (task.delegationRecommendation === "ai_delegate") {
    return [
      "Clarify the desired output and any constraints.",
      "Draft or research the first pass.",
      "Return a concise result for user review before any external action.",
    ];
  }

  if (task.delegationRecommendation === "human_delegate") {
    return [
      "Check whether a delivery, pickup, courier, or local service can handle it.",
      "Estimate cost and time saved.",
      "Ask for approval before placing an order or sharing details.",
    ];
  }

  return [
    "Collect missing context.",
    "Prepare the low-risk parts.",
    "Leave final judgment or personal action to the user.",
  ];
}

function buildNextSteps(task) {
  if (task.delegationRecommendation === "do_self") {
    return [
      "Add the event or action to your calendar.",
      "Bundle nearby errands around it, but do not outsource the core task.",
      "Prepare any materials the day before.",
    ];
  }

  if (task.privacyRisk === "medium") {
    return [
      "Check ID, privacy, or authorization requirements.",
      "Avoid sharing sensitive documents until the exact provider is known.",
      "Use an official site or phone number from the provider.",
    ];
  }

  return [
    "Choose the preferred delegation route.",
    "Confirm budget and timing.",
    "Approve the agent to prepare the next step.",
  ];
}
