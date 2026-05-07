import type {
  CompactBatch,
  CompactDictionary,
  CompactEvent,
  ReadableBatch,
  SignalEvent
} from "./types.js";
import { ACTION_CODES, encodeRatio, EVENT_TYPE_CODES, OUTCOME_CODES, STATUS_CODES } from "./schema.js";

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

function encodeMetadata(value: unknown, metadataKeys: string[]): unknown[] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const metadata = value as Record<string, unknown>;
  const lastDefinedIndex = findLastDefinedMetadataIndex(metadata, metadataKeys);
  if (lastDefinedIndex === -1) return undefined;
  return metadataKeys
    .slice(0, lastDefinedIndex + 1)
    .map((key) => encodeMetadataValue(key, metadata[key]));
}

function encodeMetadataValue(key: string, value: unknown): unknown {
  if ((key === "editDistance" || key.toLowerCase().endsWith("rate")) && typeof value === "number") {
    return encodeRatio(value);
  }
  return value;
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
