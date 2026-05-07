import cors from "@fastify/cors";
import { decodeBatchEvents, type DecodedEvent, type EncodedBatch } from "@signalkit/core";
import Fastify from "fastify";
import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type StoredEvent = DecodedEvent & {
  receivedAt: number;
};

const app = Fastify({ logger: true });
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataFile = join(__dirname, "..", "data", "events.jsonl");
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
    const now = Date.now();
    const stored = valid.map((event) => ({ ...event, receivedAt: now }));

    events.push(...stored);
    await appendEvents(stored);

    return { ok: true, received: stored.length };
  } catch (error) {
    request.log.warn({ error }, "Failed to ingest SignalKit batch");
    return reply.code(400).send({ ok: false, error: "Invalid SignalKit payload" });
  }
});

app.get("/v1/events", async () => ({
  events: events.slice(-100).reverse()
}));

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

const port = 8787;
await app.listen({ port, host: "::" });

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
