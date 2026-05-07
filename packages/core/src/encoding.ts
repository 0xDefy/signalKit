import type {
  CompactBatch,
  CompactDictionary,
  CompactEvent,
  DecodedEvent,
  EncodedBatch,
  ReadableBatch,
  SignalEvent
} from "./types.js";

const EVENT_TYPE_CODES: Record<string, string> = {
  feedback: "fb",
  agent_step: "as",
  outcome: "oc",
  custom: "cu"
};

const ACTION_CODES: Record<string, number> = {
  accepted: 1,
  rejected: 2,
  edited_then_accepted: 3,
  regenerated: 4,
  copied: 5,
  shared: 6,
  abandoned: 7,
  custom: 8
};

const STATUS_CODES: Record<string, number> = {
  success: 1,
  failure: 2,
  partial: 3,
  skipped: 4
};

const OUTCOME_CODES: Record<string, number> = {
  completed: 1,
  failed: 2,
  abandoned: 3,
  converted: 4,
  retained: 5,
  custom: 6
};

const CODE_TO_ACTION = reverseNumberMap(ACTION_CODES);
const CODE_TO_STATUS = reverseNumberMap(STATUS_CODES);
const CODE_TO_OUTCOME = reverseNumberMap(OUTCOME_CODES);

export function encodeReadableBatch(args: {
  appId: string;
  publicKey?: string;
  sessionId: string;
  events: SignalEvent[];
}): ReadableBatch {
  return {
    v: 1,
    appId: args.appId,
    publicKey: args.publicKey,
    sessionId: args.sessionId,
    events: args.events
  };
}

export function encodeCompactBatch(args: {
  appId: string;
  publicKey?: string;
  sessionId: string;
  events: SignalEvent[];
}): CompactBatch {
  const metadataKeys = collectMetadataKeys(args.events);
  const dictionary: CompactDictionary = {
    eventTypes: {},
    actions: {},
    statuses: {},
    outcomes: {},
    metadata: metadataKeys,
    payloadKeys: {}
  };

  const events: CompactEvent[] = args.events.map((event) => {
    const typeCode = EVENT_TYPE_CODES[event.type] ?? EVENT_TYPE_CODES.custom;
    dictionary.eventTypes[typeCode] = event.type;
    return [typeCode, event.timestamp, encodePayload(event, dictionary, metadataKeys)];
  });

  return {
    v: 1,
    a: args.appId,
    k: args.publicKey,
    s: args.sessionId,
    e: events,
    d: pruneDictionary(dictionary)
  };
}

export function decodeCompactBatch(batch: EncodedBatch): ReadableBatch {
  if ("events" in batch) return batch;

  const events: SignalEvent[] = batch.e.map(([typeCode, timestamp, payload]) => {
    const type = batch.d.eventTypes[typeCode] ?? typeCode;
    return {
      type,
      timestamp,
      sessionId: batch.s,
      payload: decodePayload(type, payload, batch.d)
    };
  });

  return {
    v: 1,
    appId: batch.a,
    publicKey: batch.k,
    sessionId: batch.s,
    events
  };
}

export function decodeBatchEvents(batch: EncodedBatch): DecodedEvent[] {
  const readable = decodeCompactBatch(batch);
  return readable.events.map((event) => ({
    ...event,
    appId: readable.appId,
    publicKey: readable.publicKey,
    sessionId: event.sessionId || readable.sessionId
  }));
}

function encodePayload(
  event: SignalEvent,
  dictionary: CompactDictionary,
  metadataKeys: string[]
): unknown[] {
  const payload = event.payload;

  if (event.type === "feedback") {
    const action = String(payload.action ?? "custom");
    const actionCode = ACTION_CODES[action] ?? ACTION_CODES.custom;
    dictionary.actions = { ...dictionary.actions, [String(actionCode)]: action };
    return [
      payload.task,
      payload.outputId,
      actionCode,
      encodeRatio(payload.reward),
      encodeMetadata(payload.metadata, metadataKeys)
    ];
  }

  if (event.type === "agent_step") {
    const status = String(payload.status ?? "partial");
    const statusCode = STATUS_CODES[status] ?? STATUS_CODES.partial;
    dictionary.statuses = { ...dictionary.statuses, [String(statusCode)]: status };
    return [
      payload.taskId,
      payload.step,
      payload.tool,
      statusCode,
      encodeRatio(payload.reward),
      encodeMetadata(payload.metadata, metadataKeys)
    ];
  }

  if (event.type === "outcome") {
    const outcome = String(payload.outcome ?? "custom");
    const outcomeCode = OUTCOME_CODES[outcome] ?? OUTCOME_CODES.custom;
    dictionary.outcomes = { ...dictionary.outcomes, [String(outcomeCode)]: outcome };
    return [
      payload.taskId,
      outcomeCode,
      encodeRatio(payload.reward),
      encodeMetadata(payload.metadata, metadataKeys)
    ];
  }

  const keys = Object.keys(payload);
  dictionary.payloadKeys = { ...dictionary.payloadKeys, [event.type]: keys };
  return keys.map((key) => payload[key]);
}

function decodePayload(type: string, payload: unknown[], dictionary: CompactDictionary): Record<string, unknown> {
  if (type === "feedback") {
    return {
      task: payload[0],
      outputId: payload[1],
      action: dictionary.actions?.[String(payload[2])] ?? payload[2],
      reward: decodeRatio(payload[3]),
      metadata: decodeMetadata(payload[4], dictionary.metadata ?? [])
    };
  }

  if (type === "agent_step") {
    return {
      taskId: payload[0],
      step: payload[1],
      tool: payload[2],
      status: dictionary.statuses?.[String(payload[3])] ?? payload[3],
      reward: decodeRatio(payload[4]),
      metadata: decodeMetadata(payload[5], dictionary.metadata ?? [])
    };
  }

  if (type === "outcome") {
    return {
      taskId: payload[0],
      outcome: dictionary.outcomes?.[String(payload[1])] ?? payload[1],
      reward: decodeRatio(payload[2]),
      metadata: decodeMetadata(payload[3], dictionary.metadata ?? [])
    };
  }

  const keys = dictionary.payloadKeys?.[type] ?? [];
  return Object.fromEntries(keys.map((key, index) => [key, payload[index]]));
}

function encodeMetadata(value: unknown, metadataKeys: string[]): unknown[] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const metadata = value as Record<string, unknown>;
  const lastDefinedIndex = findLastDefinedMetadataIndex(metadata, metadataKeys);
  if (lastDefinedIndex === -1) return undefined;
  return metadataKeys
    .slice(0, lastDefinedIndex + 1)
    .map((key) => encodeMetadataValue(key, metadata[key]));
}

function decodeMetadata(value: unknown, keys: string[]): Record<string, unknown> | undefined {
  if (!Array.isArray(value)) return undefined;
  const decoded: Record<string, unknown> = {};
  value.forEach((item, index) => {
    const key = keys[index];
    if (key) decoded[key] = decodeMetadataValue(key, item);
  });
  return decoded;
}

function encodeMetadataValue(key: string, value: unknown): unknown {
  if ((key === "editDistance" || key.toLowerCase().endsWith("rate")) && typeof value === "number") {
    return encodeRatio(value);
  }
  return value;
}

function decodeMetadataValue(key: string, value: unknown): unknown {
  if ((key === "editDistance" || key.toLowerCase().endsWith("rate")) && typeof value === "number") {
    return decodeRatio(value);
  }
  return value;
}

function encodeRatio(value: unknown): unknown {
  if (typeof value !== "number") return value;
  if (value >= 0 && value <= 1) return Math.round(value * 100);
  return value;
}

function decodeRatio(value: unknown): unknown {
  if (typeof value !== "number") return value;
  if (Number.isInteger(value) && value >= 0 && value <= 100) return value / 100;
  return value;
}

function reverseNumberMap(map: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [String(value), key]));
}

function pruneDictionary(dictionary: CompactDictionary): CompactDictionary {
  return {
    eventTypes: dictionary.eventTypes,
    actions: hasKeys(dictionary.actions) ? dictionary.actions : undefined,
    statuses: hasKeys(dictionary.statuses) ? dictionary.statuses : undefined,
    outcomes: hasKeys(dictionary.outcomes) ? dictionary.outcomes : undefined,
    metadata: dictionary.metadata?.length ? dictionary.metadata : undefined,
    payloadKeys: hasKeys(dictionary.payloadKeys) ? dictionary.payloadKeys : undefined
  };
}

function hasKeys(value: Record<string, unknown> | undefined): boolean {
  return Boolean(value && Object.keys(value).length > 0);
}

function collectMetadataKeys(events: SignalEvent[]): string[] {
  const keys = new Set<string>();
  for (const event of events) {
    const metadata = event.payload.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) continue;
    for (const key of Object.keys(metadata as Record<string, unknown>)) keys.add(key);
  }
  return Array.from(keys);
}

function findLastDefinedMetadataIndex(metadata: Record<string, unknown>, keys: string[]): number {
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    if (metadata[keys[index]] !== undefined) return index;
  }
  return -1;
}

export const schemaRegistry = {
  eventTypeCodes: EVENT_TYPE_CODES,
  actionCodes: ACTION_CODES,
  statusCodes: STATUS_CODES,
  outcomeCodes: OUTCOME_CODES,
  codeToAction: CODE_TO_ACTION,
  codeToStatus: CODE_TO_STATUS,
  codeToOutcome: CODE_TO_OUTCOME
} as const;
