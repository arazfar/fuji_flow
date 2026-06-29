import { buildAgentRun, analyzeTask, approveAgentRun, applyAnswerToTask, getRecommendationLabel, rankQuestions } from "./agentWorkflow.js";
import { loadState, saveState, uid } from "./storage.js";

const sampleTasks = [
  "return shoes",
  "go to daughter's recital",
  "buy snacks for recital",
  "call dentist",
  "pick up prescription",
  "research flights",
];

const state = loadState();
let activeRun = null;
let sharpenQueue = [];
let sharpenLimit = 0;

const els = {
  form: document.querySelector("#taskForm"),
  input: document.querySelector("#taskInput"),
  taskList: document.querySelector("#taskList"),
  taskCount: document.querySelector("#taskCount"),
  questionCount: document.querySelector("#questionCount"),
  approvalCount: document.querySelector("#approvalCount"),
  activeTaskLabel: document.querySelector("#activeTaskLabel"),
  agentRun: document.querySelector("#agentRun"),
  recommendations: document.querySelector("#recommendations"),
  habitPanel: document.querySelector("#habitPanel"),
  seedButton: document.querySelector("#seedButton"),
  voiceDumpButton: document.querySelector("#voiceDumpButton"),
  voiceDialog: document.querySelector("#voiceDialog"),
  voiceText: document.querySelector("#voiceText"),
  voiceSaveButton: document.querySelector("#voiceSaveButton"),
  speechButton: document.querySelector("#speechButton"),
  sharpenTwoButton: document.querySelector("#sharpenTwoButton"),
  sharpenFiveButton: document.querySelector("#sharpenFiveButton"),
  sharpenDialog: document.querySelector("#sharpenDialog"),
  sharpenTitle: document.querySelector("#sharpenTitle"),
  sharpenProgress: document.querySelector("#sharpenProgress"),
  questionCard: document.querySelector("#questionCard"),
  endSharpenButton: document.querySelector("#endSharpenButton"),
};

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  addTask(els.input.value);
  els.input.value = "";
});

els.seedButton.addEventListener("click", () => {
  sampleTasks.forEach(addTask);
});

els.voiceDumpButton.addEventListener("click", () => {
  els.voiceText.value = "";
  els.voiceDialog.showModal();
});

els.voiceSaveButton.addEventListener("click", () => {
  splitTaskDump(els.voiceText.value).forEach(addTask);
});

els.speechButton.addEventListener("click", startSpeechCapture);
els.sharpenTwoButton.addEventListener("click", () => startSharpenSession(120));
els.sharpenFiveButton.addEventListener("click", () => startSharpenSession(300));
els.endSharpenButton.addEventListener("click", endSharpenSession);

render();

function addTask(rawTitle) {
  const title = rawTitle.trim();
  if (!title) return;

  const now = new Date().toISOString();
  const analysis = analyzeTask(title);
  const task = {
    id: uid("task"),
    title,
    rawInput: title,
    createdAt: now,
    updatedAt: now,
    status: "active",
    ...analysis.taskPatch,
  };

  const questions = analysis.questions.map((question) => ({
    ...question,
    taskId: task.id,
  }));

  state.tasks.unshift(task);
  state.questions.push(...questions);
  state.selectedTaskId = task.id;
  activeRun = buildAgentRun(task, getQuestionsForTask(task.id));
  persistAndRender();
}

function launchRun(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  state.selectedTaskId = taskId;
  activeRun = buildAgentRun(task, getQuestionsForTask(task.id));
  recordHabit("sharpen_started", null);
  persistAndRender();
}

function approveRun() {
  const task = selectedTask();
  if (!task || !activeRun) return;
  const approval = approveAgentRun(task);
  activeRun = { ...activeRun, ...approval };
  persistAndRender();
}

function answerQuestion(questionId, optionValue) {
  const question = state.questions.find((item) => item.id === questionId);
  if (!question) return;

  question.status = "answered";
  question.answeredAt = new Date().toISOString();
  question.answer = optionValue;

  const taskIndex = state.tasks.findIndex((item) => item.id === question.taskId);
  if (taskIndex >= 0) {
    state.tasks[taskIndex] = applyAnswerToTask(state.tasks[taskIndex], question, optionValue);
  }

  recordHabit("question_answered", 4);
  if (activeRun?.taskId === question.taskId) {
    activeRun = buildAgentRun(state.tasks[taskIndex], getQuestionsForTask(question.taskId));
  }
  renderSharpenQuestion();
  persistAndRender();
}

function skipQuestion(questionId) {
  const question = state.questions.find((item) => item.id === questionId);
  if (!question) return;
  question.status = "skipped";
  question.answeredAt = new Date().toISOString();
  recordHabit("question_skipped", 2);
  renderSharpenQuestion();
  persistAndRender();
}

function startSharpenSession(seconds) {
  sharpenLimit = Math.max(1, Math.floor(seconds / 20));
  sharpenQueue = rankQuestions(state.tasks, state.questions).slice(0, sharpenLimit);
  recordHabit("sharpen_offered", null, seconds);
  recordHabit("sharpen_started", null, seconds);
  els.sharpenTitle.textContent = seconds === 120 ? "2 minutes" : "5 minutes";
  els.sharpenDialog.showModal();
  renderSharpenQuestion();
}

function endSharpenSession() {
  recordHabit("session_completed", null);
  els.sharpenDialog.close();
  persistAndRender();
}

function renderSharpenQuestion() {
  sharpenQueue = sharpenQueue.filter((question) => {
    const live = state.questions.find((item) => item.id === question.id);
    return live?.status === "pending";
  });

  const question = sharpenQueue[0];
  els.sharpenProgress.textContent = `${sharpenQueue.length} left`;

  if (!question) {
    els.questionCard.innerHTML = `
      <div class="empty-state">
        <p>No high-impact questions left. Your list is sharper than it was.</p>
      </div>
    `;
    return;
  }

  const task = state.tasks.find((item) => item.id === question.taskId);
  els.questionCard.innerHTML = `
    <div>
      <p class="eyebrow">${question.unlocks.join(" + ")}</p>
      <h3>${escapeHtml(question.question)}</h3>
      <p>${task ? escapeHtml(task.title) : "Batch preference"}</p>
    </div>
    <div class="answer-grid">
      ${question.options
        .map(
          (option) => `
            <button type="button" data-answer="${escapeHtml(option.value)}" data-question="${question.id}">
              ${escapeHtml(option.label)}
            </button>
          `,
        )
        .join("")}
      <button type="button" data-skip="${question.id}">Skip</button>
    </div>
  `;

  els.questionCard.querySelectorAll("[data-answer]").forEach((button) => {
    button.addEventListener("click", () => answerQuestion(button.dataset.question, button.dataset.answer));
  });
  els.questionCard.querySelector("[data-skip]").addEventListener("click", () => skipQuestion(question.id));
}

function render() {
  renderCounts();
  renderTasks();
  renderAgentRun();
  renderRecommendations();
  renderHabitPanel();
  saveState(state);
}

function renderCounts() {
  const pending = state.questions.filter((question) => question.status === "pending").length;
  const approvals = state.tasks.filter((task) => ["ai_delegate", "hybrid"].includes(task.delegationRecommendation)).length;
  els.taskCount.textContent = `${state.tasks.length} ${state.tasks.length === 1 ? "task" : "tasks"}`;
  els.questionCount.textContent = `${pending} questions`;
  els.approvalCount.textContent = `${approvals} approvals`;
  els.sharpenTwoButton.disabled = pending === 0;
  els.sharpenFiveButton.disabled = pending === 0;
}

function renderTasks() {
  if (!state.tasks.length) {
    els.taskList.innerHTML = `<div class="empty-state">Add tasks as they come in, or use the sample set for a quick demo.</div>`;
    return;
  }

  els.taskList.innerHTML = state.tasks
    .map(
      (task) => `
        <article class="task-card ${task.id === state.selectedTaskId ? "active" : ""}">
          <div>
            <div class="task-title">${escapeHtml(task.title)}</div>
            <div class="meta-row">
              <span class="tag">${escapeHtml(task.category)}</span>
              <span class="tag ${task.delegationRecommendation}">${getRecommendationLabel(task.delegationRecommendation)}</span>
              <span class="tag">${Math.round(task.confidence * 100)}% confidence</span>
            </div>
          </div>
          <div class="task-actions">
            <button type="button" data-launch="${task.id}">Start</button>
            <button type="button" class="ghost-button icon-button" title="Mark done" data-done="${task.id}">✓</button>
          </div>
        </article>
      `,
    )
    .join("");

  els.taskList.querySelectorAll("[data-launch]").forEach((button) => {
    button.addEventListener("click", () => launchRun(button.dataset.launch));
  });
  els.taskList.querySelectorAll("[data-done]").forEach((button) => {
    button.addEventListener("click", () => markDone(button.dataset.done));
  });
}

function renderAgentRun() {
  const task = selectedTask();
  els.activeTaskLabel.textContent = task ? task.title : "No task selected";

  document.querySelectorAll(".state-chip").forEach((chip) => {
    chip.classList.toggle("active", Boolean(activeRun && chip.dataset.state === activeRun.state));
  });

  if (!task || !activeRun) {
    els.agentRun.className = "agent-run empty-state";
    els.agentRun.textContent = "Select a task to launch an agent workflow.";
    return;
  }

  els.agentRun.className = "agent-run";
  els.agentRun.innerHTML = `
    <section class="workflow-section">
      <p class="eyebrow">Context first</p>
      <h3>Questions the agent wants answered</h3>
      ${
        activeRun.contextQuestions.length
          ? `<ul class="question-list">${activeRun.contextQuestions.map((question) => `<li>${escapeHtml(question.question)}</li>`).join("")}</ul>`
          : `<p>No blocking context questions remain for this task.</p>`
      }
    </section>
    <section class="workflow-section">
      <p class="eyebrow">Plan</p>
      <h3>Step-by-step action plan</h3>
      <ol class="plan-list">${activeRun.plan.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
    </section>
    ${renderApproval(activeRun)}
    ${renderResult(activeRun)}
    <section class="workflow-section">
      <p class="eyebrow">When direct completion is not feasible</p>
      <h3>Concrete next steps</h3>
      <ul class="next-list">${activeRun.nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>
    </section>
  `;

  const approveButton = els.agentRun.querySelector("[data-approve]");
  if (approveButton) approveButton.addEventListener("click", approveRun);
}

function renderApproval(run) {
  if (!run.approval || run.result) return "";

  return `
    <section class="workflow-section">
      <div class="approval-box">
        <div>
          <p class="eyebrow">Checkpoint</p>
          <h3>${escapeHtml(run.approval.title)}</h3>
          <p>${escapeHtml(run.approval.body)}</p>
        </div>
        <div class="approval-actions">
          <button type="button" data-approve>${escapeHtml(run.approval.actionLabel)}</button>
          <button type="button" class="ghost-button">Keep as plan only</button>
        </div>
      </div>
    </section>
  `;
}

function renderResult(run) {
  if (!run.result) return "";
  return `
    <section class="workflow-section">
      <p class="eyebrow">Completed after approval</p>
      <h3>${escapeHtml(run.result.title)}</h3>
      <p>${escapeHtml(run.result.body)}</p>
      <ul class="next-list">${run.result.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}</ul>
    </section>
  `;
}

function renderRecommendations() {
  const buckets = ["do_self", "ai_delegate", "human_delegate", "hybrid", "defer_or_drop"];
  els.recommendations.innerHTML = buckets
    .map((bucket) => {
      const count = state.tasks.filter((task) => task.delegationRecommendation === bucket).length;
      return `
        <div class="rec-tile">
          <strong class="${bucket}">${count}</strong>
          <span>${getRecommendationLabel(bucket)}</span>
        </div>
      `;
    })
    .join("");
}

function renderHabitPanel() {
  const total = state.habitSignals.length;
  const answered = state.habitSignals.filter((signal) => signal.event === "question_answered").length;
  const skipped = state.habitSignals.filter((signal) => signal.event === "question_skipped").length;
  const bestSlot = inferBestSlot();

  els.habitPanel.innerHTML = `
    <div class="habit-row"><span>Signals collected</span><strong>${total}</strong></div>
    <div class="habit-row"><span>Answered questions</span><strong>${answered}</strong></div>
    <div class="habit-row"><span>Skipped questions</span><strong>${skipped}</strong></div>
    <div class="habit-row"><span>Current timing insight</span><strong>${bestSlot}</strong></div>
  `;
}

function inferBestSlot() {
  if (state.habitSignals.length < 3) return "Learning from this session";
  const answered = state.habitSignals.filter((signal) => signal.event === "question_answered");
  if (!answered.length) return "No strong response window yet";
  const hour = Math.round(answered.reduce((sum, signal) => sum + signal.hour, 0) / answered.length);
  if (hour < 11) return "Mornings look promising";
  if (hour < 17) return "Afternoons look promising";
  if (hour < 21) return "Evenings look promising";
  return "Late sessions should stay urgent-only";
}

function markDone(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.status = "done";
  state.tasks = state.tasks.filter((item) => item.id !== taskId);
  state.questions = state.questions.filter((question) => question.taskId !== taskId);
  if (state.selectedTaskId === taskId) {
    state.selectedTaskId = state.tasks[0]?.id ?? null;
    activeRun = state.selectedTaskId ? buildAgentRun(state.tasks[0], getQuestionsForTask(state.selectedTaskId)) : null;
  }
  persistAndRender();
}

function selectedTask() {
  return state.tasks.find((task) => task.id === state.selectedTaskId) ?? null;
}

function getQuestionsForTask(taskId) {
  return state.questions.filter((question) => question.taskId === taskId);
}

function persistAndRender() {
  saveState(state);
  render();
}

function splitTaskDump(value) {
  return value
    .split(/\n|,|;|\band\b|\boh\b/gi)
    .map((item) => item.trim())
    .filter((item) => item.length > 2);
}

function recordHabit(event, responseDelaySeconds = null, sessionLengthSeconds = null) {
  const now = new Date();
  state.habitSignals.push({
    id: uid("signal"),
    event,
    occurredAt: now.toISOString(),
    weekday: now.getDay(),
    hour: now.getHours(),
    sessionLengthSeconds,
    responseDelaySeconds,
  });
}

function startSpeechCapture() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    els.voiceText.value += "\nSpeech capture is not available in this browser. Paste a rough dump here instead.";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = (event) => {
    els.voiceText.value = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(" ");
  };
  recognition.start();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
