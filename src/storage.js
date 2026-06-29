const STORAGE_KEY = "clarity-queue-state-v2";

export function loadState() {
  const fallback = {
    tasks: [],
    questions: [],
    habitSignals: [],
    selectedTaskId: null,
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function uid(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}
