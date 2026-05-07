import type { SignalKitPlugin } from "@signalkit/core";

export type GameActionInput = {
  playerId?: string;
  taskId?: string;
  action: string;
  target?: string;
  outcome?: "success" | "failure" | "partial" | "skipped" | "custom";
  reward?: number;
  metadata?: Record<string, unknown>;
};

export type GameLevelInput = {
  playerId?: string;
  level: string;
  attempt?: number;
  outcome: "started" | "completed" | "failed" | "abandoned" | "replayed" | "custom";
  reward?: number;
  metadata?: Record<string, unknown>;
};

export type GameInputSummaryInput = {
  playerId?: string;
  taskId?: string;
  windowMs: number;
  taps?: number;
  doubleTaps?: number;
  longPresses?: number;
  drags?: number;
  misclicks?: number;
  rageClicks?: number;
  metadata?: Record<string, unknown>;
};

export type GameApi = {
  game: {
    action(input: GameActionInput): void;
    level(input: GameLevelInput): void;
    inputSummary(input: GameInputSummaryInput): void;
  };
};

export function gamePlugin(): SignalKitPlugin {
  return {
    name: "game",
    setup(ctx) {
      return {
        game: {
          action(input: GameActionInput) {
            ctx.emit("game_action", input as unknown as Record<string, unknown>);
          },
          level(input: GameLevelInput) {
            ctx.emit("game_level", input as unknown as Record<string, unknown>);
          },
          inputSummary(input: GameInputSummaryInput) {
            ctx.emit("game_input_summary", input as unknown as Record<string, unknown>);
          }
        }
      };
    }
  };
}
