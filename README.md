# Fuji Flow

A polished prototype of an AI-powered todo list. Each task can launch an OpenAI Agents SDK workflow that gathers context, creates a plan, waits for approval, and then either completes feasible in-app work or returns concrete next steps.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## OpenAI Agents SDK

- `OPENAI_API_KEY` is required for agent workflows and task understanding.
- Set `OPENAI_MODEL` only when you want to override the SDK default model.

The live adapter uses structured Zod outputs, hosted web search for current details, and an approval-gated function tool before recording task completion.

## Scripts

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
```
