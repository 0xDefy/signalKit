export const EVENT_TYPE_CODES: Record<string, string> = {
  feedback: "fb",
  agent_step: "as",
  outcome: "oc",
  custom: "cu"
};

export const ACTION_CODES: Record<string, number> = {
  accepted: 1,
  rejected: 2,
  edited_then_accepted: 3,
  regenerated: 4,
  copied: 5,
  shared: 6,
  abandoned: 7,
  custom: 8
};

export const STATUS_CODES: Record<string, number> = {
  success: 1,
  failure: 2,
  partial: 3,
  skipped: 4
};

export const OUTCOME_CODES: Record<string, number> = {
  completed: 1,
  failed: 2,
  abandoned: 3,
  converted: 4,
  retained: 5,
  custom: 6
};

export const schemaRegistry = {
  eventTypeCodes: EVENT_TYPE_CODES,
  actionCodes: ACTION_CODES,
  statusCodes: STATUS_CODES,
  outcomeCodes: OUTCOME_CODES,
  codeToAction: reverseNumberMap(ACTION_CODES),
  codeToStatus: reverseNumberMap(STATUS_CODES),
  codeToOutcome: reverseNumberMap(OUTCOME_CODES)
} as const;

export function encodeRatio(value: unknown): unknown {
  if (typeof value !== "number") return value;
  if (value >= 0 && value <= 1) return Math.round(value * 100);
  return value;
}

export function decodeRatio(value: unknown): unknown {
  if (typeof value !== "number") return value;
  if (Number.isInteger(value) && value >= 0 && value <= 100) return value / 100;
  return value;
}

function reverseNumberMap(map: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [String(value), key]));
}
