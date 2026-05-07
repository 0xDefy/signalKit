import type { SignalKitPlugin } from "@signalkit/core";

export type AgentStepInput = {
  taskId: string;
  step: string;
  tool?: string;
  status: "success" | "failure" | "partial" | "skipped";
  reward?: number;
  metadata?: Record<string, unknown>;
};

export type AgentApi = {
  agent: {
    step(input: AgentStepInput): void;
  };
};

export function agentPlugin(): SignalKitPlugin {
  return {
    name: "agent",
    setup(ctx) {
      return {
        agent: {
          step(input: AgentStepInput) {
            ctx.emit("agent_step", input as unknown as Record<string, unknown>);
          }
        }
      };
    }
  };
}
