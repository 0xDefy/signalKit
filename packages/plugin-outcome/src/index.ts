import type { SignalKitPlugin } from "@signalkit/core";

export type OutcomeInput = {
  taskId?: string;
  outcome: "completed" | "failed" | "abandoned" | "converted" | "retained" | "custom";
  reward?: number;
  metadata?: Record<string, unknown>;
};

export type OutcomeApi = {
  outcome: {
    record(input: OutcomeInput): void;
  };
};

export function outcomePlugin(): SignalKitPlugin {
  return {
    name: "outcome",
    setup(ctx) {
      return {
        outcome: {
          record(input: OutcomeInput) {
            ctx.emit("outcome", input as unknown as Record<string, unknown>);
          }
        }
      };
    }
  };
}
