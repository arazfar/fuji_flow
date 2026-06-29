import { z } from "zod";

import { sharpenQuestionSchema, taskMetadataSchema } from "./task-intelligence";

export const TODO_STORAGE_KEY = "fuji-flow.todos.v1";

export const todoSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(140),
  notes: z.string().max(1200).optional(),
  completed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  agentRunId: z.string().optional(),
  taskPatch: taskMetadataSchema.optional(),
  questions: z.array(sharpenQuestionSchema).default([]),
  analysisError: z.string().optional(),
});

export const todoListSchema = z.array(todoSchema);

export type Todo = z.infer<typeof todoSchema>;

export type TodoDraft = {
  title: string;
  notes?: string;
};

export function createTodo(draft: TodoDraft): Todo {
  const timestamp = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: draft.title.trim(),
    notes: draft.notes?.trim() || undefined,
    completed: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    questions: [],
  };
}

export function loadTodos(storage: Pick<Storage, "getItem">): Todo[] {
  const raw = storage.getItem(TODO_STORAGE_KEY);
  if (!raw) return [];

  try {
    return todoListSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveTodos(
  storage: Pick<Storage, "setItem">,
  todos: Todo[],
): void {
  storage.setItem(TODO_STORAGE_KEY, JSON.stringify(todoListSchema.parse(todos)));
}

export function upsertTodo(todos: Todo[], todo: Todo): Todo[] {
  const exists = todos.some((item) => item.id === todo.id);
  if (!exists) return [todo, ...todos];
  return todos.map((item) => (item.id === todo.id ? todo : item));
}

export function updateTodo(
  todos: Todo[],
  id: string,
  update: Partial<
    Pick<
      Todo,
      | "title"
      | "notes"
      | "completed"
      | "agentRunId"
      | "taskPatch"
      | "questions"
      | "analysisError"
    >
  >,
): Todo[] {
  return todos.map((todo) =>
    todo.id === id
      ? {
          ...todo,
          ...update,
          title: update.title?.trim() || todo.title,
          notes:
            update.notes === undefined
              ? todo.notes
              : update.notes.trim() || undefined,
          updatedAt: new Date().toISOString(),
        }
      : todo,
  );
}

export function deleteTodo(todos: Todo[], id: string): Todo[] {
  return todos.filter((todo) => todo.id !== id);
}
