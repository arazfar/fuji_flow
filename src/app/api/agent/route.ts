import { agentCommandSchema } from "@/lib/agent/schemas";
import {
  answerContext,
  approveAgentPlan,
  rejectAgentPlan,
  startAgentWorkflow,
} from "@/lib/agent/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const command = agentCommandSchema.parse(json);

    switch (command.action) {
      case "start":
        return Response.json({
          run: await startAgentWorkflow(command.task, command.workflowKind),
        });
      case "answer_context":
        return Response.json({
          run: await answerContext(command.runId, command.answers),
        });
      case "approve":
        return Response.json({
          run: await approveAgentPlan(command.runId),
        });
      case "reject":
        return Response.json({
          run: await rejectAgentPlan(command.runId, command.reason),
        });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid agent request.";

    return Response.json(
      {
        error: message,
      },
      {
        status: 400,
      },
    );
  }
}
