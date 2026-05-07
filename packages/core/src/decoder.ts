import { decodeRatio } from "./schema.js";
import type { CompactDictionary, DecodedEvent, EncodedBatch, ReadableBatch, SignalEvent } from "./types.js";

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

  if (type === "game_action") {
    return {
      playerId: payload[0],
      taskId: payload[1],
      action: payload[2],
      target: payload[3],
      outcome: payload[4],
      reward: decodeRatio(payload[5]),
      metadata: decodeMetadata(payload[6], dictionary.metadata ?? [])
    };
  }

  if (type === "game_level") {
    return {
      playerId: payload[0],
      level: payload[1],
      attempt: payload[2],
      outcome: payload[3],
      reward: decodeRatio(payload[4]),
      metadata: decodeMetadata(payload[5], dictionary.metadata ?? [])
    };
  }

  if (type === "game_input_summary") {
    return {
      playerId: payload[0],
      taskId: payload[1],
      windowMs: payload[2],
      taps: payload[3],
      doubleTaps: payload[4],
      longPresses: payload[5],
      drags: payload[6],
      misclicks: payload[7],
      rageClicks: payload[8],
      metadata: decodeMetadata(payload[9], dictionary.metadata ?? [])
    };
  }

  const keys = dictionary.payloadKeys?.[type] ?? [];
  return Object.fromEntries(keys.map((key, index) => [key, payload[index]]));
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

function decodeMetadataValue(key: string, value: unknown): unknown {
  if ((key === "editDistance" || key.toLowerCase().endsWith("rate")) && typeof value === "number") {
    return decodeRatio(value);
  }
  return value;
}
