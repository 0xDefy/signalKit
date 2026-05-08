import cors from "@fastify/cors";
import { type DecodedEvent, type EncodedBatch } from "@signalkit/core";
import { decodeBatchEvents } from "@signalkit/core/decoder";
import Fastify, { type FastifyReply } from "fastify";
import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

type StoredEvent = DecodedEvent & {
  receivedAt: number;
};

type EventFilters = {
  type?: string;
  sessionId?: string;
  taskId?: string;
  appId?: string;
  userId?: string;
  anonymousId?: string;
  from?: number;
  to?: number;
  minReward?: number;
  maxReward?: number;
  limit?: number;
};

const maxStoredEvents = readEnvInt("SIGNALKIT_MAX_STORED_EVENTS", 100000);
const app = Fastify({ logger: true, bodyLimit: readEnvInt("SIGNALKIT_BODY_LIMIT_BYTES", 262144) });
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataFile = join(__dirname, "..", "data", "events.jsonl");
const compactBatchFile = join(__dirname, "..", "data", "batches.compact.jsonl");
const events: StoredEvent[] = [];

await mkdir(dirname(dataFile), { recursive: true });
await loadExistingEvents();
await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true }));

app.post("/v1/ingest", async (request, reply) => {
  try {
    const batch = request.body as EncodedBatch;
    const decoded = decodeBatchEvents(batch);
    const valid = decoded.filter(isValidEvent);
    if (decoded.length === 0 || valid.length !== decoded.length) {
      return reply.code(400).send({ ok: false, error: "Invalid SignalKit event batch" });
    }
    const now = Date.now();
    const stored = valid.map((event) => ({ ...event, receivedAt: now }));

    events.push(...stored);
    trimStoredEvents();
    await Promise.all([appendEvents(stored), appendCompactBatch(batch, now)]);

    return { ok: true, received: stored.length };
  } catch (error) {
    request.log.warn({ error }, "Failed to ingest SignalKit batch");
    return reply.code(400).send({ ok: false, error: "Invalid SignalKit payload" });
  }
});

app.get("/v1/events", async (request) => ({
  events: applyFilters(events, parseFilters(request.query)).slice(-100).reverse()
}));

app.get("/v1/export.json", async (request, reply) => {
  const filters = parseFilters(request.query);
  const filteredEvents = applyFilters(events, filters);

  return reply
    .header("content-type", "application/json; charset=utf-8")
    .header("content-disposition", `attachment; filename="${createExportName("json")}"`)
    .send({
      v: 1,
      exportedAt: new Date().toISOString(),
      filters,
      count: filteredEvents.length,
      events: filteredEvents
    });
});

app.get("/v1/export.jsonl", async (request, reply) => {
  const body = toJsonl(applyFilters(events, parseFilters(request.query)));
  return reply
    .header("content-type", "application/x-ndjson; charset=utf-8")
    .header("content-disposition", `attachment; filename="${createExportName("jsonl")}"`)
    .send(body);
});

app.get("/v1/export.jsonl.gz", async (request, reply) => {
  const body = toJsonl(applyFilters(events, parseFilters(request.query)));
  return sendGzip(reply, body, "jsonl.gz", "application/x-ndjson");
});

app.get("/v1/export.compact.jsonl", async (_request, reply) => {
  return reply
    .header("content-type", "application/x-ndjson; charset=utf-8")
    .header("content-disposition", `attachment; filename="${createExportName("compact.jsonl")}"`)
    .send(await readOptionalFile(compactBatchFile));
});

app.get("/v1/export.compact.jsonl.gz", async (_request, reply) => {
  const body = await readOptionalFile(compactBatchFile);
  return sendGzip(reply, body, "compact.jsonl.gz", "application/x-ndjson");
});

app.get("/v1/stats", async () => {
  const eventsByType: Record<string, number> = {};
  const rewardTotals: Record<string, { total: number; count: number }> = {};
  const sessions = new Set<string>();

  for (const event of events) {
    eventsByType[event.type] = (eventsByType[event.type] ?? 0) + 1;
    sessions.add(event.sessionId);

    const reward = event.payload.reward;
    if (typeof reward === "number") {
      const current = rewardTotals[event.type] ?? { total: 0, count: 0 };
      current.total += reward;
      current.count += 1;
      rewardTotals[event.type] = current;
    }
  }

  const avgRewardByType = Object.fromEntries(
    Object.entries(rewardTotals).map(([type, value]) => [
      type,
      value.count ? Number((value.total / value.count).toFixed(3)) : 0
    ])
  );

  return {
    totalEvents: events.length,
    eventsByType,
    avgRewardByType,
    recentSessions: Array.from(sessions).slice(-10).reverse()
  };
});

const port = Number(process.env.PORT ?? 8787);
const host = process.env.SIGNALKIT_HOST ?? "localhost";
await app.listen({ port, host });

async function loadExistingEvents(): Promise<void> {
  try {
    const contents = await readFile(dataFile, "utf8");
    for (const line of contents.split("\n")) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as StoredEvent;
      if (isValidEvent(event)) events.push(event);
    }
  } catch {
    // First run starts with an empty local event store.
  }
}

async function appendEvents(stored: StoredEvent[]): Promise<void> {
  if (stored.length === 0) return;
  const lines = `${stored.map((event) => JSON.stringify(event)).join("\n")}\n`;
  await appendFile(dataFile, lines, "utf8");
}

async function appendCompactBatch(batch: EncodedBatch, receivedAt: number): Promise<void> {
  const line = JSON.stringify({ receivedAt, batch });
  await appendFile(compactBatchFile, `${line}\n`, "utf8");
}

async function readOptionalFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function sendGzip(
  reply: FastifyReply,
  body: string,
  extension: "jsonl.gz" | "compact.jsonl.gz",
  contentType: string
) {
  return reply
    .header("content-type", contentType)
    .header("content-encoding", "gzip")
    .header("content-disposition", `attachment; filename="${createExportName(extension)}"`)
    .send(gzipSync(body));
}

function parseFilters(query: unknown): EventFilters {
  const params = query && typeof query === "object" ? (query as Record<string, unknown>) : {};
  return compactObject({
    type: readString(params.type),
    sessionId: readString(params.sessionId),
    taskId: readString(params.taskId),
    appId: readString(params.appId),
    userId: readString(params.userId),
    anonymousId: readString(params.anonymousId),
    from: readTimestamp(params.from),
    to: readTimestamp(params.to),
    minReward: readNumber(params.minReward),
    maxReward: readNumber(params.maxReward),
    limit: readLimit(params.limit)
  });
}

function applyFilters(source: StoredEvent[], filters: EventFilters): StoredEvent[] {
  let result = source.filter((event) => {
    if (filters.type && event.type !== filters.type) return false;
    if (filters.sessionId && event.sessionId !== filters.sessionId) return false;
    if (filters.appId && event.appId !== filters.appId) return false;
    if (filters.userId && event.userId !== filters.userId) return false;
    if (filters.anonymousId && event.anonymousId !== filters.anonymousId) return false;
    if (filters.taskId && event.payload.taskId !== filters.taskId) return false;
    if (filters.from && event.timestamp < filters.from) return false;
    if (filters.to && event.timestamp > filters.to) return false;

    const reward = event.payload.reward;
    if (filters.minReward !== undefined && (typeof reward !== "number" || reward < filters.minReward)) return false;
    if (filters.maxReward !== undefined && (typeof reward !== "number" || reward > filters.maxReward)) return false;

    return true;
  });

  if (filters.limit !== undefined) {
    result = result.slice(-filters.limit);
  }

  return result;
}

function toJsonl(filteredEvents: StoredEvent[]): string {
  const body = filteredEvents.map((event) => JSON.stringify(event)).join("\n");
  return body ? `${body}\n` : "";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readLimit(value: unknown): number | undefined {
  const parsed = readNumber(value);
  if (parsed === undefined) return undefined;
  return Math.max(1, Math.min(100000, Math.floor(parsed)));
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function trimStoredEvents(): void {
  if (events.length <= maxStoredEvents) return;
  events.splice(0, events.length - maxStoredEvents);
}

function readEnvInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function isValidEvent(event: unknown): event is StoredEvent {
  if (!event || typeof event !== "object") return false;
  const candidate = event as Partial<StoredEvent>;
  return (
    typeof candidate.type === "string" &&
    typeof candidate.timestamp === "number" &&
    typeof candidate.sessionId === "string" &&
    Boolean(candidate.payload) &&
    typeof candidate.payload === "object"
  );
}

function createExportName(extension: "json" | "jsonl" | "jsonl.gz" | "compact.jsonl" | "compact.jsonl.gz"): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `signalkit-events-${stamp}.${extension}`;
}
