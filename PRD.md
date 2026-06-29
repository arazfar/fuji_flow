# PRD: Habit-Aware Agentic Todo List MVP

## Goal

Build a working MVP of a smart todo list where tasks accumulate during the week, the system builds a backlog of sharpening questions, and the user can spend a chosen amount of time answering high-impact questions to improve planning and delegation recommendations.

The next 30 minutes should produce a real, usable prototype with minimal mocked data. The app should persist user-created tasks and generated question metadata locally or in a real database. AI calls should be wired behind a single service boundary and require live OpenAI APIs when configured for use. Automated tests may mock that boundary, but the product should not silently fall back to deterministic AI behavior.

## Prototype Brief Update

The prototype should also demonstrate a task-level agent workflow inspired by the OpenAI Agents SDK:

- Each task can launch an agent run.
- The agent starts by asking relevant context-gathering questions.
- The agent produces a clear step-by-step action plan.
- The agent asks for explicit user approval before doing any feasible work.
- When direct completion is not feasible, the agent provides concrete next steps.
- Relationship-presence tasks should be protected from careless delegation.
- Full backend and marketplace integrations may use mock behavior in the prototype, but the architecture should keep those boundaries clean.

## Product Hypothesis

People accumulate vague life-admin tasks throughout the week. A useful assistant should not ask questions immediately. It should quietly identify uncertainty, rank the best questions, and ask them only when the user chooses a short sharpening session or when the app has learned that timing is likely welcome.

## MVP Scope

### In Scope

- Fast task capture: one task per Enter.
- Optional voice transcript input as text paste or browser speech input if available.
- Task list with accumulated tasks.
- AI-derived task metadata:
  - category
  - location relevance
  - delegation recommendation
  - confidence
  - presence value
- Question backlog generated from tasks.
- Sharpen mode with 2-minute and 5-minute options.
- Multiple-choice and yes/no questions only.
- Stack-ranked questions by expected value.
- Answering questions updates task metadata.
- Basic habit-aware timing model based on app interactions:
  - notification/session offer shown
  - accepted
  - skipped
  - completed
  - time to response
- Simple recommendation panel:
  - do yourself
  - AI delegate
  - human delegate
  - hybrid
  - defer/drop

### Out of Scope For 30-Minute MVP

- Real marketplace fulfillment.
- Real DoorDash/Uber/TaskRabbit integrations.
- Calendar integrations.
- Location tracking.
- Push notifications.
- Full route optimization.
- Payments.
- Native mobile app.

## Target User Flow

1. User opens the app.
2. User types tasks quickly, pressing Enter after each task.
3. App saves each task immediately.
4. App sends each task to an AI task-understanding endpoint.
5. AI returns structured task metadata plus candidate sharpening questions.
6. Questions enter a backlog.
7. User taps `Sharpen 2 min` or `Sharpen 5 min`.
8. App shows the highest-ranked question.
9. User taps an answer.
10. App updates the related task and asks the next best question until time/question budget ends.
11. App shows improved recommendations and confidence.

## Core Screens

### 1. Capture Screen

Primary screen.

Required UI:

- Single-line input.
- Task list.
- Each task row shows:
  - title
  - status chip
  - delegation recommendation
  - confidence indicator
- `Sharpen 2 min` button.
- `Sharpen 5 min` button.
- `Plan Day` button, disabled or lightweight in MVP.

### 2. Sharpen Session

Flashcard-style interface.

Required UI:

- Current question.
- 2-4 answer options.
- `Skip` option.
- Session progress.
- Timer or remaining question count.
- Small note showing what the question unlocks, e.g. `Improves delegation` or `Improves route planning`.

### 3. Recommendations Panel

Summary view.

Required UI:

- Counts by recommendation type.
- List of delegatable tasks.
- List of presence-required tasks.
- List of unclear tasks.
- Habit timing hint, e.g. `Monday morning appears to be a good sharpening window` once enough interactions exist.

## Data Model

### Task

```ts
type Task = {
  id: string;
  title: string;
  rawInput: string;
  createdAt: string;
  updatedAt: string;
  status: "active" | "done" | "deferred" | "dropped";
  category:
    | "errand"
    | "call"
    | "home"
    | "computer"
    | "relationship"
    | "appointment"
    | "unknown";
  locationRelevant: boolean;
  deadline?: string | null;
  estimatedMinutes?: number | null;
  presenceValue: "low" | "medium" | "high" | "unknown";
  privacyRisk: "low" | "medium" | "high" | "unknown";
  delegationRecommendation:
    | "do_self"
    | "ai_delegate"
    | "human_delegate"
    | "hybrid"
    | "defer_or_drop"
    | "unknown";
  confidence: number;
};
```

### Sharpen Question

```ts
type SharpenQuestion = {
  id: string;
  taskId?: string | null;
  scope: "task" | "batch" | "preference" | "policy";
  question: string;
  options: Array<{
    id: string;
    label: string;
    value: string;
  }>;
  unlocks: Array<
    | "route"
    | "deadline"
    | "delegation"
    | "duration"
    | "dependency"
    | "presence_value"
    | "cost"
  >;
  expectedValue: number;
  estimatedSeconds: number;
  status: "pending" | "answered" | "skipped" | "expired";
  createdAt: string;
  answeredAt?: string | null;
};
```

### Habit Signal

```ts
type HabitSignal = {
  id: string;
  event:
    | "sharpen_offered"
    | "sharpen_started"
    | "question_answered"
    | "question_skipped"
    | "session_completed"
    | "session_abandoned";
  occurredAt: string;
  weekday: number;
  hour: number;
  sessionLengthSeconds?: number | null;
  responseDelaySeconds?: number | null;
};
```

## AI Behavior

### Task Understanding Prompt Contract

Input:

```json
{
  "task": "return shoes",
  "userPreferences": {
    "paidDelegationAllowed": true,
    "presenceSensitive": true
  }
}
```

Output:

```json
{
  "taskPatch": {
    "category": "errand",
    "locationRelevant": true,
    "presenceValue": "low",
    "privacyRisk": "low",
    "delegationRecommendation": "human_delegate",
    "confidence": 0.72
  },
  "questions": [
    {
      "scope": "task",
      "question": "Can these shoes be returned by mail?",
      "options": ["Yes", "No", "Not sure"],
      "unlocks": ["delegation", "route"],
      "expectedValue": 0.88,
      "estimatedSeconds": 8
    }
  ]
}
```

Rules:

- Ask only questions that change planning, delegation, timing, or whether the task should be done.
- Prefer yes/no and multiple choice.
- Include `Not sure` where appropriate.
- Do not recommend outsourcing relationship-presence tasks like recitals, ceremonies, bedside visits, or important family events.
- Recommend hybrid delegation when the AI can prepare and the user should execute.

## Question Ranking

Rank pending questions with:

```ts
score =
  expectedValue *
  urgencyMultiplier *
  confidenceGap *
  easeMultiplier -
  annoyancePenalty -
  stalenessPenalty;
```

MVP approximation:

- `expectedValue`: AI-provided 0-1 score.
- `urgencyMultiplier`: `1.3` if deadline is soon, otherwise `1`.
- `confidenceGap`: `1 - task.confidence`.
- `easeMultiplier`: `1.2` if estimated under 10 seconds, otherwise `1`.
- `annoyancePenalty`: `0.1` if user skipped related question.
- `stalenessPenalty`: `0.05` per week old.

## Habit-Aware Timing MVP

Do not proactively interrupt in the 30-minute MVP. Instead, measure signals so future prompting can be smarter.

Show a small insight after enough data:

- `You tend to complete 2-minute sharpen sessions around Monday morning.`
- `5-minute sessions are often abandoned.`
- `Saturday night seems like a poor time for non-urgent questions.`

MVP heuristic:

```ts
slotScore =
  completionRate * 0.5 +
  answerRate * 0.3 +
  speedScore * 0.2 -
  skipRate * 0.4;
```

Slot format:

```ts
type TimeSlot = {
  weekday: number;
  hourBucket: "morning" | "afternoon" | "evening" | "night";
};
```

## Minimal Implementation Plan

### First 10 Minutes

- Create app shell.
- Add task input and persistent task list.
- Add local database/storage.
- Add task creation flow.

### Next 10 Minutes

- Add task analysis service.
- Require `OPENAI_API_KEY` for task analysis.
- Return a clear configuration error when the key is missing.
- Save generated questions to backlog.

### Final 10 Minutes

- Add Sharpen 2 min / 5 min session.
- Rank questions.
- Record answers and habit signals.
- Update recommendation summaries.
- Add a small habit insight panel.

## Acceptance Criteria

- User can add at least 10 tasks without friction.
- Each task persists after refresh.
- Each task receives a delegation recommendation.
- At least one useful sharpening question is created for vague or delegatable tasks.
- `Sharpen 2 min` shows only top-ranked pending questions.
- Questions are multiple choice or yes/no.
- Answering a question changes task confidence or recommendation.
- App records habit signals locally.
- Recommendations distinguish presence-based tasks from delegatable tasks.

## Example Test Tasks

Use real user-entered tasks rather than preloaded mock data:

- `return shoes`
- `go to daughter's recital`
- `buy snacks for recital`
- `call dentist`
- `pick up prescription`
- `clean kitchen`
- `research flights`
- `drop off dry cleaning`
- `mail passport form`
- `get groceries`

Expected behavior:

- `go to daughter's recital` => `do_self`, high presence value.
- `buy snacks for recital` => `human_delegate` or `hybrid`.
- `research flights` => `ai_delegate`.
- `return shoes` => ask whether mail return is possible.
- `pick up prescription` => ask whether someone else is allowed to pick it up.

## Open Questions

- Should voice capture ship in the first prototype or wait until typed capture feels good?
- Should task analysis happen immediately on Enter or in a background batch?
- Should human delegation recommendations include estimated costs in MVP?
- Should the user be able to set a max paid delegation budget?

## Recommendation

For the 30-minute build, prioritize:

1. Task capture.
2. AI task understanding.
3. Question backlog.
4. Sharpen mode.
5. Habit signal collection.

Skip real routing and marketplace integrations for now. They matter, but they are only valuable once the app can reliably turn messy task accumulation into sharper, better-structured work.
