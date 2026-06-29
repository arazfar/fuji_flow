import { describe, expect, it, vi } from "vitest";

import {
  TODO_STORAGE_KEY,
  createTodo,
  loadTodos,
  saveTodos,
  updateTodo,
} from "../todos";

describe("todo persistence", () => {
  it("saves and loads valid todos", () => {
    const todo = createTodo({ title: "Draft launch checklist", notes: "Short" });
    const storage = makeStorage();

    saveTodos(storage, [todo]);

    expect(storage.setItem).toHaveBeenCalledWith(
      TODO_STORAGE_KEY,
      expect.stringContaining("Draft launch checklist"),
    );
    expect(loadTodos(storage)).toEqual([todo]);
  });

  it("falls back to an empty list for malformed storage", () => {
    const storage = makeStorage("not-json");

    expect(loadTodos(storage)).toEqual([]);
  });

  it("updates a todo without dropping existing fields", () => {
    const todo = createTodo({ title: "Original", notes: "Notes" });
    const [updated] = updateTodo([todo], todo.id, { completed: true });

    expect(updated).toMatchObject({
      id: todo.id,
      title: "Original",
      completed: true,
    });
    expect(updated.updatedAt).toEqual(expect.any(String));
  });
});

function makeStorage(initial?: string) {
  let value = initial;

  return {
    getItem: vi.fn(() => value ?? null),
    setItem: vi.fn((_key: string, next: string) => {
      value = next;
    }),
  };
}
