import type { SignalKitPlugin } from "@signalkit/core";

export type FeedbackInput = {
  task: string;
  outputId?: string;
  action:
    | "accepted"
    | "rejected"
    | "edited_then_accepted"
    | "regenerated"
    | "copied"
    | "shared"
    | "abandoned"
    | "custom";
  reward?: number;
  metadata?: Record<string, unknown>;
};

export type FeedbackApi = {
  feedback: {
    record(input: FeedbackInput): void;
  };
};

export function feedbackPlugin(): SignalKitPlugin {
  return {
    name: "feedback",
    setup(ctx) {
      return {
        feedback: {
          record(input: FeedbackInput) {
            ctx.emit("feedback", input as unknown as Record<string, unknown>);
          }
        }
      };
    }
  };
}
