# fuji_flow

A polished static prototype for an AI-powered todo list where each task can launch an agent-style workflow:

1. Gather context with focused questions.
2. Produce a step-by-step plan.
3. Request explicit approval before doing feasible AI work.
4. Provide concrete next steps when direct completion is not feasible.

The prototype uses local storage and deterministic agent behavior so it can run without a backend. The code keeps the agent boundary isolated in `src/agentWorkflow.js` so a real OpenAI Agents SDK backend can replace the mock workflow without rewriting the UI.

## Run

From this folder, run:

```bash
python -m http.server 5178 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:5178
```

The app uses browser modules, so serving it over localhost is more reliable than double-clicking the HTML file.

## OpenAI Agents SDK Alignment

The architecture mirrors the official Agents SDK primitives:

- agents with instructions and tools
- human-in-the-loop approval checkpoints
- handoff-style next steps when the agent cannot complete work
- guardrail-like handling for relationship-sensitive tasks
- session-like local state for tasks, questions, and habit signals

For production, replace `analyzeTask`, `buildAgentRun`, and `approveAgentRun` with a server endpoint backed by `@openai/agents`, keeping API keys off the client.
# fuji_flow
