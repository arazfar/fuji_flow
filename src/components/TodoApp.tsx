"use client";

import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileQuestion,
  LinkIcon,
  Loader2,
  Pencil,
  Phone,
  Plus,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  AgentRunStatus,
  AgentRunView,
  ContextQuestion,
  TaskOutcome,
} from "@/lib/agent/types";
import { isProviderLookupTask } from "@/lib/provider-lookup/intent";
import {
  TODO_STORAGE_KEY,
  createTodo,
  deleteTodo,
  loadTodos,
  saveTodos,
  updateTodo,
  type Todo,
} from "@/lib/todos";

type AgentCommand =
  | {
      action: "start";
      workflowKind?: "todo" | "provider_lookup";
      task: { taskId: string; title: string; notes?: string };
    }
  | { action: "answer_context"; runId: string; answers: Record<string, string> }
  | { action: "approve"; runId: string }
  | { action: "reject"; runId: string; reason?: string };

const starterTasks = [
  {
    title: "Outline a calm morning routine",
    notes: "Keep it realistic for weekdays and include a short checklist.",
  },
  {
    title: "Renew my passport",
    notes: "Find the official next steps and what materials I should gather.",
  },
  {
    title: "Draft a follow-up note for the design review",
    notes: "Tone should be concise, warm, and action-oriented.",
  },
];

const starterTodos: Todo[] = starterTasks.map((task, index) => ({
  id: `starter-${index + 1}`,
  title: task.title,
  notes: task.notes,
  completed: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}));

const statusCopy: Record<
  AgentRunStatus,
  { label: string; className: string; icon: typeof Clock3 }
> = {
  idle: {
    label: "Ready",
    className: "border-stone-200 bg-stone-100 text-stone-700",
    icon: Clock3,
  },
  gathering_context: {
    label: "Context",
    className: "border-teal-200 bg-teal-50 text-teal-800",
    icon: FileQuestion,
  },
  planning: {
    label: "Planning",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    icon: Pencil,
  },
  awaiting_approval: {
    label: "Approval",
    className: "border-orange-200 bg-orange-50 text-orange-800",
    icon: ShieldCheck,
  },
  executing: {
    label: "Running",
    className: "border-sky-200 bg-sky-50 text-sky-800",
    icon: Loader2,
  },
  completed: {
    label: "Done",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: CheckCircle2,
  },
  needs_user_action: {
    label: "Action",
    className: "border-rose-200 bg-rose-50 text-rose-800",
    icon: AlertCircle,
  },
  error: {
    label: "Error",
    className: "border-red-200 bg-red-50 text-red-800",
    icon: AlertCircle,
  },
};

export function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>(starterTodos);
  const [runs, setRuns] = useState<Record<string, AgentRunView>>({});
  const [selectedId, setSelectedId] = useState<string>(starterTodos[0]?.id);
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, Record<string, string>>>({});
  const [busyAction, setBusyAction] = useState<string>();
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const stored = loadTodos(window.localStorage);

      if (stored.length > 0) {
        setTodos(stored);
        setSelectedId(stored[0]?.id);
      }

      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) {
      saveTodos(window.localStorage, todos);
    }
  }, [loaded, todos]);

  const selectedTodo = useMemo(
    () => todos.find((todo) => todo.id === selectedId) ?? todos[0],
    [selectedId, todos],
  );

  const selectedRun = selectedTodo?.agentRunId
    ? runs[selectedTodo.agentRunId]
    : undefined;

  const counts = useMemo(
    () => ({
      total: todos.length,
      done: todos.filter((todo) => todo.completed).length,
      active: todos.filter((todo) => !todo.completed).length,
    }),
    [todos],
  );

  function addTask() {
    if (!newTitle.trim()) return;
    const todo = createTodo({ title: newTitle, notes: newNotes });
    setTodos((current) => [todo, ...current]);
    setSelectedId(todo.id);
    setNewTitle("");
    setNewNotes("");
  }

  function setTodoCompleted(todo: Todo, completed: boolean) {
    setTodos((current) => updateTodo(current, todo.id, { completed }));
  }

  function removeTodo(todo: Todo) {
    setTodos((current) => {
      const next = deleteTodo(current, todo.id);
      if (selectedId === todo.id) {
        setSelectedId(next[0]?.id);
      }
      return next;
    });
  }

  async function sendAgentCommand(command: AgentCommand) {
    setError(undefined);
    setBusyAction(command.action);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const payload = (await response.json()) as
        | { run: AgentRunView }
        | { error: string };

      if (!response.ok || !("run" in payload)) {
        throw new Error("error" in payload ? payload.error : "Agent request failed.");
      }

      setRuns((current) => ({
        ...current,
        [payload.run.id]: payload.run,
      }));

      if (payload.run.outcome?.status === "completed") {
        setTodos((current) =>
          updateTodo(current, payload.run.task.taskId, { completed: true }),
        );
      }

      return payload.run;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Agent request failed.");
      return undefined;
    } finally {
      setBusyAction(undefined);
    }
  }

  async function launchAgent(todo: Todo, workflowKind: "todo" | "provider_lookup" = "todo") {
    const run = await sendAgentCommand({
      action: "start",
      workflowKind,
      task: {
        taskId: todo.id,
        title: todo.title,
        notes: todo.notes,
      },
    });

    if (run) {
      setTodos((current) => updateTodo(current, todo.id, { agentRunId: run.id }));
    }
  }

  async function submitAnswers(run: AgentRunView) {
    const runAnswers = answerDrafts[run.id] ?? run.contextAnswers;

    await sendAgentCommand({
      action: "answer_context",
      runId: run.id,
      answers: runAnswers,
    });
  }

  async function approveRun(run: AgentRunView) {
    await sendAgentCommand({
      action: "approve",
      runId: run.id,
    });
  }

  async function rejectRun(run: AgentRunView) {
    await sendAgentCommand({
      action: "reject",
      runId: run.id,
      reason: "User rejected the proposed plan from the prototype UI.",
    });
  }

  const requiredAnswersComplete =
    selectedRun?.contextQuestions.every(
      (question) =>
        !question.required ||
        (answerDrafts[selectedRun.id]?.[question.id] ??
          selectedRun.contextAnswers[question.id] ??
          ""
        ).trim(),
    ) ?? false;

  return (
    <main className="min-h-screen bg-[#f7f4ef] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-stone-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-950 text-white shadow-sm">
              <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">Fuji Flow</h1>
              <p className="text-sm text-stone-600">
                {counts.active} active / {counts.done} done
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-stone-200 bg-white text-center shadow-sm sm:min-w-72">
            <Metric label="Tasks" value={counts.total} />
            <Metric label="Active" value={counts.active} />
            <Metric label="Done" value={counts.done} />
          </div>
        </header>

        <div className="grid flex-1 gap-5 py-5 lg:grid-cols-[380px_minmax(0,1fr)]">
          <section className="flex min-h-0 flex-col gap-4">
            <div className="rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
              <div className="flex gap-2">
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addTask();
                  }}
                  placeholder="New task"
                  className="h-11 min-w-0 flex-1 rounded-md border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
                />
                <button
                  type="button"
                  onClick={addTask}
                  disabled={!newTitle.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-stone-950 text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
                  aria-label="Add task"
                  title="Add task"
                >
                  <Plus className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <textarea
                value={newNotes}
                onChange={(event) => setNewNotes(event.target.value)}
                placeholder="Notes"
                className="mt-2 min-h-20 w-full resize-none rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
              />
            </div>

            <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
              {todos.map((todo) => {
                const run = todo.agentRunId ? runs[todo.agentRunId] : undefined;
                const selected = selectedTodo?.id === todo.id;

                return (
                  <button
                    key={todo.id}
                    type="button"
                    onClick={() => setSelectedId(todo.id)}
                    className={`group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-stone-300 hover:shadow-md ${
                      selected
                        ? "border-stone-900 ring-2 ring-stone-900/10"
                        : "border-stone-200"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-md border ${
                        todo.completed
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-stone-300 bg-stone-50 text-transparent"
                      }`}
                    >
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-sm font-medium ${
                          todo.completed ? "text-stone-500 line-through" : "text-stone-950"
                        }`}
                      >
                        {todo.title}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-2">
                        {run ? <StatusPill status={run.status} /> : null}
                        {todo.notes ? (
                          <span className="truncate text-xs text-stone-500">
                            {todo.notes}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <ChevronRight
                      className="h-4 w-4 text-stone-400 transition group-hover:text-stone-700"
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          </section>

          <section className="min-h-[620px] overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
            {selectedTodo ? (
              <div className="grid h-full lg:grid-cols-[minmax(0,0.9fr)_minmax(420px,1.1fr)]">
                <div className="border-b border-stone-200 p-5 lg:border-b-0 lg:border-r">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">
                        Task
                      </p>
                      <textarea
                        value={selectedTodo.title}
                        onChange={(event) =>
                          setTodos((current) =>
                            updateTodo(current, selectedTodo.id, {
                              title: event.target.value,
                            }),
                          )
                        }
                        rows={2}
                        className="mt-2 min-h-16 w-full resize-none rounded-md border border-transparent bg-transparent text-xl font-semibold leading-7 outline-none transition focus:border-stone-200 focus:bg-stone-50 focus:px-2 focus:py-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setTodoCompleted(selectedTodo, !selectedTodo.completed)
                        }
                        className={`flex h-10 w-10 items-center justify-center rounded-md border transition ${
                          selectedTodo.completed
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-stone-200 bg-white text-stone-700 hover:border-emerald-300 hover:text-emerald-700"
                        }`}
                        aria-label="Toggle complete"
                        title="Toggle complete"
                      >
                        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTodo(selectedTodo)}
                        className="flex h-10 w-10 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-500 transition hover:border-red-200 hover:text-red-600"
                        aria-label="Delete task"
                        title="Delete task"
                      >
                        <Trash2 className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={selectedTodo.notes ?? ""}
                    onChange={(event) =>
                      setTodos((current) =>
                        updateTodo(current, selectedTodo.id, {
                          notes: event.target.value,
                        }),
                      )
                    }
                    placeholder="Notes"
                    className="mt-5 min-h-36 w-full resize-none rounded-lg border border-stone-200 bg-stone-50 px-3 py-3 text-sm leading-6 text-stone-700 outline-none transition focus:border-stone-400 focus:bg-white"
                  />

                  <div className="mt-5 flex flex-wrap gap-2">
                    {selectedRun ? (
                      <StatusPill status={selectedRun.status} />
                    ) : (
                      <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-600">
                        No run
                      </span>
                    )}
                    {selectedRun ? (
                      <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-600">
                        {selectedRun.workflowKind === "provider_lookup"
                          ? "Provider lookup"
                          : selectedRun.mode === "live"
                          ? "OpenAI SDK"
                          : "Demo"} mode
                      </span>
                    ) : null}
                    {selectedTodo.completed ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                        Completed
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-6">
                    {!selectedRun ? (
                      <div className="flex flex-wrap gap-2">
                        {isProviderLookupTask(selectedTodo.title, selectedTodo.notes) ? (
                          <button
                            type="button"
                            onClick={() => launchAgent(selectedTodo, "provider_lookup")}
                            disabled={busyAction === "start"}
                            className="inline-flex h-11 items-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800 disabled:cursor-wait disabled:bg-stone-400"
                          >
                            {busyAction === "start" ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <Stethoscope className="h-4 w-4" aria-hidden="true" />
                            )}
                            Find provider
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => launchAgent(selectedTodo)}
                          disabled={busyAction === "start"}
                          className="inline-flex h-11 items-center gap-2 rounded-md bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-wait disabled:bg-stone-400"
                        >
                          {busyAction === "start" ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Sparkles className="h-4 w-4" aria-hidden="true" />
                          )}
                          Start agent
                        </button>
                      </div>
                    ) : (
                      <Timeline run={selectedRun} />
                    )}
                  </div>

                  {error ? (
                    <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}
                </div>

                <AgentPanel
                  run={selectedRun}
                  answers={
                    selectedRun
                      ? answerDrafts[selectedRun.id] ?? selectedRun.contextAnswers
                      : {}
                  }
                  setAnswer={(id, value) =>
                    selectedRun
                      ? setAnswerDrafts((current) => ({
                          ...current,
                          [selectedRun.id]: {
                            ...(current[selectedRun.id] ??
                              selectedRun.contextAnswers),
                            [id]: value,
                          },
                        }))
                      : undefined
                  }
                  canSubmitAnswers={requiredAnswersComplete}
                  busyAction={busyAction}
                  submitAnswers={submitAnswers}
                  approveRun={approveRun}
                  rejectRun={rejectRun}
                />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-stone-500">
                No task selected
              </div>
            )}
          </section>
        </div>
      </div>
      <span className="sr-only">{TODO_STORAGE_KEY}</span>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-stone-200 px-4 py-3 last:border-r-0">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  );
}

function StatusPill({ status }: { status: AgentRunStatus }) {
  const meta = statusCopy[status];
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}
    >
      <Icon
        className={`h-3.5 w-3.5 ${status === "executing" ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      {meta.label}
    </span>
  );
}

function Timeline({ run }: { run: AgentRunView }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">
        Timeline
      </p>
      <ol className="mt-3 space-y-3">
        {run.timeline.map((event) => (
          <li key={event.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-stone-900" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-stone-900">
                {event.title}
              </span>
              <span className="block text-sm leading-6 text-stone-600">
                {event.body}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AgentPanel({
  run,
  answers,
  setAnswer,
  canSubmitAnswers,
  busyAction,
  submitAnswers,
  approveRun,
  rejectRun,
}: {
  run?: AgentRunView;
  answers: Record<string, string>;
  setAnswer: (id: string, value: string) => void;
  canSubmitAnswers: boolean;
  busyAction?: string;
  submitAnswers: (run: AgentRunView) => Promise<void>;
  approveRun: (run: AgentRunView) => Promise<void>;
  rejectRun: (run: AgentRunView) => Promise<void>;
}) {
  if (!run) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-50 p-8 text-center">
        <div>
          <Sparkles className="mx-auto h-8 w-8 text-stone-400" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-stone-700">Agent idle</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-stone-50">
      <div className="border-b border-stone-200 bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">
              Agent
            </p>
            <h2 className="mt-1 text-lg font-semibold text-stone-950">
              {statusCopy[run.status].label}
            </h2>
          </div>
          <StatusPill status={run.status} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {run.status === "gathering_context" ? (
          <ContextForm
            questions={run.contextQuestions}
            answers={answers}
            setAnswer={setAnswer}
            disabled={busyAction === "answer_context"}
            canSubmit={canSubmitAnswers}
            onSubmit={() => submitAnswers(run)}
          />
        ) : null}

        {run.plan ? (
          <PlanPanel
            run={run}
            busyAction={busyAction}
            approveRun={approveRun}
            rejectRun={rejectRun}
          />
        ) : null}

        {run.outcome ? <OutcomePanel outcome={run.outcome} /> : null}

        {run.error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {run.error}
          </div>
        ) : null}

        {run.status === "planning" || run.status === "executing" ? (
          <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-600">
            <Loader2 className="h-4 w-4 animate-spin text-stone-900" aria-hidden="true" />
            Working
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ContextForm({
  questions,
  answers,
  setAnswer,
  disabled,
  canSubmit,
  onSubmit,
}: {
  questions: ContextQuestion[];
  answers: Record<string, string>;
  setAnswer: (id: string, value: string) => void;
  disabled: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-stone-950">Context</h3>
      <div className="mt-4 space-y-4">
        {questions.map((question) => (
          <label key={question.id} className="block">
            <span className="text-sm font-medium text-stone-800">
              {question.label}
            </span>
            {question.helpText ? (
              <span className="mt-1 block text-xs leading-5 text-stone-500">
                {question.helpText}
              </span>
            ) : null}
            {question.type === "long" ? (
              <textarea
                value={answers[question.id] ?? ""}
                onChange={(event) => setAnswer(question.id, event.target.value)}
                placeholder={question.placeholder}
                className="mt-2 min-h-24 w-full resize-none rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
              />
            ) : (
              <input
                value={answers[question.id] ?? ""}
                type={question.type === "date" ? "text" : question.type}
                onChange={(event) => setAnswer(question.id, event.target.value)}
                placeholder={question.placeholder}
                className="mt-2 h-10 w-full rounded-md border border-stone-200 bg-stone-50 px-3 text-sm outline-none transition focus:border-stone-400 focus:bg-white"
              />
            )}
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit || disabled}
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {disabled ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="h-4 w-4" aria-hidden="true" />
        )}
        Submit context
      </button>
    </div>
  );
}

function PlanPanel({
  run,
  busyAction,
  approveRun,
  rejectRun,
}: {
  run: AgentRunView;
  busyAction?: string;
  approveRun: (run: AgentRunView) => Promise<void>;
  rejectRun: (run: AgentRunView) => Promise<void>;
}) {
  if (!run.plan) return null;

  return (
    <div className="mb-5 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-stone-950">Plan</h3>
          <p className="mt-1 text-sm leading-6 text-stone-600">{run.plan.summary}</p>
        </div>
        <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-700">
          {run.plan.estimatedEffort}
        </span>
      </div>

      <ol className="mt-4 space-y-3">
        {run.plan.steps.map((step, index) => (
          <li key={step.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-stone-100 text-xs font-semibold text-stone-700">
              {index + 1}
            </span>
            <span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-stone-900">
                  {step.title}
                </span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium uppercase text-stone-500">
                  {step.owner}
                </span>
              </span>
              <span className="mt-1 block text-sm leading-6 text-stone-600">
                {step.detail}
              </span>
            </span>
          </li>
        ))}
      </ol>

      {run.status === "awaiting_approval" ? (
        <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50 p-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-orange-700" aria-hidden="true" />
            <p className="text-sm leading-6 text-orange-900">
              {run.approvalRequest?.statement}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => approveRun(run)}
              disabled={busyAction === "approve"}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-stone-950 px-4 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-wait disabled:bg-stone-400"
            >
              {busyAction === "approve" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              )}
              Approve
            </button>
            <button
              type="button"
              onClick={() => rejectRun(run)}
              disabled={busyAction === "reject"}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:border-red-200 hover:text-red-700 disabled:cursor-wait disabled:text-stone-400"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Reject
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OutcomePanel({ outcome }: { outcome: TaskOutcome }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {outcome.status === "completed" ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden="true" />
        ) : (
          <AlertCircle className="mt-0.5 h-5 w-5 text-rose-600" aria-hidden="true" />
        )}
        <div>
          <h3 className="text-sm font-semibold text-stone-950">
            {outcome.status === "completed" ? "Completed" : "Next steps"}
          </h3>
          <p className="mt-1 text-sm leading-6 text-stone-600">{outcome.summary}</p>
        </div>
      </div>

      {outcome.completedActions.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">
            Completed
          </p>
          <ul className="mt-2 space-y-2">
            {outcome.completedActions.map((action) => (
              <li key={action} className="flex gap-2 text-sm text-stone-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {outcome.nextSteps.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">
            Actions
          </p>
          <div className="mt-2 space-y-3">
            {outcome.nextSteps.map((step) => (
              <div
                key={`${step.title}-${step.detail}`}
                className="rounded-lg border border-stone-200 bg-stone-50 p-3"
              >
                <p className="text-sm font-medium text-stone-900">{step.title}</p>
                <p className="mt-1 text-sm leading-6 text-stone-600">{step.detail}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {step.link ? (
                    <a
                      href={step.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:border-stone-400"
                    >
                      <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      Link
                    </a>
                  ) : null}
                  {step.phone ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700">
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                      {step.phone}
                    </span>
                  ) : null}
                  {step.deadline ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700">
                      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                      {step.deadline}
                    </span>
                  ) : null}
                </div>
                {step.materials?.length ? (
                  <p className="mt-2 text-xs leading-5 text-stone-500">
                    Materials: {step.materials.join(", ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {outcome.citations.length ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-stone-500">
            Links
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {outcome.citations.map((citation) => (
              <a
                key={citation.url}
                href={citation.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-700 transition hover:border-stone-400"
              >
                <LinkIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {citation.title}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
