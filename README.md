# SignalKit

SignalKit is a modular, ultra-lightweight feedback and reward-data layer for modern apps. It helps developers collect structured user feedback, AI output feedback, task outcomes, agent-step outcomes, and reward signals without turning their product into a heavy analytics or session-replay stack.

This MVP is intentionally small: developers choose which plugins to install, what metadata to record, and where batches are sent. The default privacy mode redacts raw content-like fields.

## Why This Is Not Normal Analytics

SignalKit is for high-signal product and AI workflow events: accepted outputs, rejected outputs, edited responses, task results, tool-step outcomes, rewards, and safe metadata. It does not record screens, DOM trees, videos, heatmaps, screenshots, keystrokes, or full user sessions.

The data is meant to be useful later for dashboards, evaluation datasets, fine-tuning datasets, reward modeling, personalization, automation improvement, or developer-owned analytics.

## Run Locally

```bash
pnpm install
pnpm dev:server
pnpm dev:dashboard
pnpm dev:example
```

Default URLs:

- Server: `http://localhost:8787`
- Dashboard: `http://localhost:5174`
- Example React app: `http://localhost:5173`

## Packages

- `@signalkit/core`: SDK client, plugin system, queue, privacy scrubber, compact/readable encoding, decoder, custom transport interface.
- `@signalkit/plugin-feedback`: `signal.feedback.record(...)`.
- `@signalkit/plugin-agent`: `signal.agent.step(...)`.
- `@signalkit/plugin-outcome`: `signal.outcome.record(...)`.
- `@signalkit/transport-fetch`: small fetch transport for hosted or self-hosted ingest endpoints.
- `apps/server`: Fastify ingest API with in-memory storage plus JSONL append.
- `apps/dashboard`: Vite React dashboard for decoded events and reward stats.
- `apps/example-react`: Vite React app that proves the SDK flow locally.

## SDK Usage

```ts
import { SignalKit } from "@signalkit/core";
import { feedbackPlugin } from "@signalkit/plugin-feedback";
import { agentPlugin } from "@signalkit/plugin-agent";
import { outcomePlugin } from "@signalkit/plugin-outcome";
import { fetchTransport } from "@signalkit/transport-fetch";

const signal = SignalKit.init({
  appId: "demo-app",
  publicKey: "dev_public_key",
  privacy: "metadata_only",
  schemaMode: "compact",
  flushIntervalMs: 5000,
  maxBatchSize: 50,
  plugins: [feedbackPlugin(), agentPlugin(), outcomePlugin()],
  transport: fetchTransport({
    endpoint: "http://localhost:8787/v1/ingest"
  })
});

signal.feedback.record({
  task: "generate_email_reply",
  outputId: "out_123",
  action: "edited_then_accepted",
  reward: 0.82,
  metadata: {
    timeToDecisionMs: 14000,
    editDistance: 0.24,
    language: "en"
  }
});

signal.agent.step({
  taskId: "task_123",
  step: "search_docs",
  tool: "vector_search",
  status: "success",
  reward: 0.9
});

signal.outcome.record({
  taskId: "task_123",
  outcome: "completed",
  reward: 1,
  metadata: {
    durationMs: 43000
  }
});
```

## Custom Transport

Bring-your-own-storage is first-class. A transport only needs a `send(batch)` method:

```ts
const transport = {
  async send(batch) {
    await myQueue.publish("signals", batch);
  }
};
```

Use this for your own API, warehouse, queue, edge worker, local file collector, or hosted SignalKit endpoint.

## Privacy Modes

- `metadata_only` is the default. It redacts raw fields named `prompt`, `input`, `output`, `content`, `message`, `text`, `email`, `phone`, `name`, and `address`.
- `strict` also hashes `userId` and removes unknown long string values over 80 characters.
- `allow_content` allows raw content but still redacts obvious secret fields like passwords, tokens, cookies, and API keys.

Developers choose what to collect. SignalKit does not collect raw private user content by default.

## Compact Encoding

Readable mode sends normal JSON for debugging. Compact mode sends shorter keys and array payloads:

```json
{
  "v": 1,
  "a": "demo-app",
  "s": "s_abc",
  "e": [["fb", 123456, ["generate_email_reply", "out_123", 3, 82, [14000, 24, "en"]]]],
  "d": {
    "eventTypes": { "fb": "feedback" },
    "actions": { "3": "edited_then_accepted" },
    "metadata": ["timeToDecisionMs", "editDistance", "language"]
  }
}
```

Rewards and ratio-like fields such as `editDistance` are scaled from `0..1` to `0..100` when possible. The dictionary lets the server or dashboard decode compact batches back into readable events. `decodeCompactBatch()` is exported from `@signalkit/core`.

## Roadmap

- Authenticated hosted transport and project keys.
- Better schema registration and event export.
- Evaluation dataset and reward-model export helpers.
- More plugins for games, automations, and personalization.
- Optional persistence adapters for Postgres, S3, queues, and warehouses.
- Dashboard filtering and dataset export.
