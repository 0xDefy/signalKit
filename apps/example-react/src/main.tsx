import { SignalKit, type EncodedBatch, type SignalKitClient } from "@signalkit/core";
import { agentPlugin, type AgentApi } from "@signalkit/plugin-agent";
import { feedbackPlugin, type FeedbackApi } from "@signalkit/plugin-feedback";
import { gamePlugin, type GameApi } from "@signalkit/plugin-game";
import { outcomePlugin, type OutcomeApi } from "@signalkit/plugin-outcome";
import { fetchTransport } from "@signalkit/transport-fetch";
import { useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Signal = SignalKitClient & FeedbackApi & AgentApi & OutcomeApi & GameApi;
type PrivacyMode = "metadata_only" | "allow_content" | "strict";
type SchemaMode = "compact" | "readable";

type ServerEvent = {
  type: string;
  timestamp: number;
  sessionId: string;
  payload: Record<string, unknown>;
};

type Scenario = {
  id: string;
  title: string;
  description: string;
  eventType: "feedback" | "agent" | "outcome" | "game";
  reward: string;
  run(signal: Signal): void;
};

const endpoint = "http://localhost:8787/v1/ingest";

const scenarios: Scenario[] = [
  {
    id: "accepted",
    title: "Accepted AI reply",
    description: "User accepts an AI-generated reply with safe decision metadata.",
    eventType: "feedback",
    reward: "1.00",
    run(signal) {
      signal.feedback.record({
        task: "generate_email_reply",
        outputId: "out_123",
        action: "accepted",
        reward: 1,
        metadata: { timeToDecisionMs: 4200, language: "en", outputLength: 680 }
      });
    }
  },
  {
    id: "edited",
    title: "Edited then accepted",
    description: "High-value reward signal with edit distance and decision time.",
    eventType: "feedback",
    reward: "0.82",
    run(signal) {
      signal.feedback.record({
        task: "generate_email_reply",
        outputId: "out_125",
        action: "edited_then_accepted",
        reward: 0.82,
        metadata: { timeToDecisionMs: 14000, editDistance: 0.24, language: "en" }
      });
    }
  },
  {
    id: "redaction",
    title: "Privacy redaction check",
    description: "Attempts to send raw content fields; metadata_only should redact them.",
    eventType: "feedback",
    reward: "0.35",
    run(signal) {
      signal.feedback.record({
        task: "summarize_support_email",
        outputId: "out_private",
        action: "rejected",
        reward: 0.35,
        metadata: {
          language: "en",
          email: "customer@example.com",
          text: "My private account number is 12345",
          outputLength: 420
        }
      });
    }
  },
  {
    id: "agent-success",
    title: "Agent tool success",
    description: "A tool step succeeds and earns a positive reward.",
    eventType: "agent",
    reward: "0.90",
    run(signal) {
      signal.agent.step({
        taskId: "task_123",
        step: "search_docs",
        tool: "vector_search",
        status: "success",
        reward: 0.9,
        metadata: { latencyMs: 312, resultCount: 6 }
      });
    }
  },
  {
    id: "agent-failure",
    title: "Agent tool failure",
    description: "A failing step records status and retryability without raw traces.",
    eventType: "agent",
    reward: "0.10",
    run(signal) {
      signal.agent.step({
        taskId: "task_123",
        step: "call_crm",
        tool: "http",
        status: "failure",
        reward: 0.1,
        metadata: { retryable: true, latencyMs: 2200 }
      });
    }
  },
  {
    id: "completed",
    title: "Task completed",
    description: "End-to-end task outcome for evals, personalization, or automation tuning.",
    eventType: "outcome",
    reward: "1.00",
    run(signal) {
      signal.outcome.record({
        taskId: "task_123",
        outcome: "completed",
        reward: 1,
        metadata: { durationMs: 43000, stepCount: 4 }
      });
    }
  },
  {
    id: "abandoned",
    title: "Task abandoned",
    description: "Negative task outcome that can be joined with earlier feedback/agent events.",
    eventType: "outcome",
    reward: "0.00",
    run(signal) {
      signal.outcome.record({
        taskId: "task_124",
        outcome: "abandoned",
        reward: 0,
        metadata: { durationMs: 8000, stepCount: 1 }
      });
    }
  },
  {
    id: "game-action",
    title: "Game action outcome",
    description: "Semantic gameplay action without pointer trails or screen replay.",
    eventType: "game",
    reward: "-0.20",
    run(signal) {
      signal.game.action({
        playerId: "player_123",
        taskId: "level_2_attempt_4",
        action: "jump",
        target: "moving_platform",
        outcome: "failure",
        reward: -0.2,
        metadata: { level: "level_2", attempt: 4, distanceToTarget: 12 }
      });
    }
  },
  {
    id: "game-level",
    title: "Level completed",
    description: "A compact level outcome for balancing, evals, or progression tuning.",
    eventType: "game",
    reward: "1.00",
    run(signal) {
      signal.game.level({
        playerId: "player_123",
        level: "level_2",
        attempt: 5,
        outcome: "completed",
        reward: 1,
        metadata: { durationMs: 92000, deaths: 4, difficulty: "normal" }
      });
    }
  },
  {
    id: "game-input-summary",
    title: "Input summary window",
    description: "Counts taps, drags, and misclicks over a window without raw coordinates.",
    eventType: "game",
    reward: "n/a",
    run(signal) {
      signal.game.inputSummary({
        playerId: "player_123",
        taskId: "level_2_attempt_5",
        windowMs: 10000,
        taps: 18,
        doubleTaps: 3,
        longPresses: 1,
        drags: 4,
        misclicks: 2,
        rageClicks: 1,
        metadata: { level: "level_2", device: "touch" }
      });
    }
  }
];

function createSignal(options: {
  privacy: PrivacyMode;
  schemaMode: SchemaMode;
  onBatch(batch: EncodedBatch): void;
  onStatus(status: string): void;
}): Signal {
  const transport = fetchTransport({ endpoint });

  return SignalKit.init({
    appId: "demo-app",
    publicKey: "dev_public_key",
    userId: "user_demo_123",
    anonymousId: "anon_demo_456",
    privacy: options.privacy,
    schemaMode: options.schemaMode,
    flushIntervalMs: 0,
    maxBatchSize: 20,
    maxQueueSize: 100,
    plugins: [feedbackPlugin(), agentPlugin(), outcomePlugin(), gamePlugin()],
    transport: {
      async send(batch) {
        options.onBatch(batch);
        options.onStatus("Sending batch to local server");
        await transport.send(batch);
        options.onStatus(`Sent ${getBatchCount(batch)} event(s) at ${new Date().toLocaleTimeString()}`);
      }
    },
    debug: true
  }) as Signal;
}

function ExampleApp() {
  const [privacy, setPrivacy] = useState<PrivacyMode>("metadata_only");
  const [schemaMode, setSchemaMode] = useState<SchemaMode>("compact");
  const [status, setStatus] = useState("Ready");
  const [queueSize, setQueueSize] = useState(0);
  const [lastBatch, setLastBatch] = useState<EncodedBatch | null>(null);
  const [latestEvents, setLatestEvents] = useState<ServerEvent[]>([]);
  const [serverStatus, setServerStatus] = useState("Not checked");
  const [sendCount, setSendCount] = useState(0);

  const signal = useMemo(
    () =>
      createSignal({
        privacy,
        schemaMode,
        onBatch(batch) {
          setLastBatch(batch);
          setSendCount((count) => count + getBatchCount(batch));
        },
        onStatus: setStatus
      }),
    [privacy, schemaMode]
  );

  function record(scenario: Scenario) {
    scenario.run(signal);
    setQueueSize(signal.getQueueSize());
    setStatus(`Queued: ${scenario.title}`);
  }

  async function flush() {
    try {
      setStatus("Flushing queue");
      await signal.flush();
      setQueueSize(signal.getQueueSize());
      await refreshServerEvents();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Flush failed");
    }
  }

  async function refreshServerEvents() {
    try {
      const response = await fetch("http://localhost:8787/v1/events");
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const body = (await response.json()) as { events: ServerEvent[] };
      setLatestEvents(body.events.slice(0, 5));
      setServerStatus(`Loaded ${body.events.length} decoded event(s)`);
    } catch {
      setServerStatus("Server unavailable. Start pnpm dev:server.");
    }
  }

  async function checkHealth() {
    try {
      const response = await fetch("http://localhost:8787/health");
      setServerStatus(response.ok ? "Server healthy" : `Server returned ${response.status}`);
    } catch {
      setServerStatus("Server unavailable. Start pnpm dev:server.");
    }
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>SignalKit SDK Lab</h1>
          <p>Exercise modular feedback, agent-step, outcome, privacy, and compact encoding flows.</p>
        </div>
        <div className="statusStrip">
          <Metric label="Queue" value={queueSize} />
          <Metric label="Sent" value={sendCount} />
        </div>
      </header>

      <section className="controls">
        <div>
          <h2>SDK mode</h2>
          <div className="segmented">
            <button className={schemaMode === "compact" ? "active" : ""} onClick={() => setSchemaMode("compact")}>
              Compact
            </button>
            <button className={schemaMode === "readable" ? "active" : ""} onClick={() => setSchemaMode("readable")}>
              Readable
            </button>
          </div>
        </div>

        <div>
          <h2>Privacy</h2>
          <div className="segmented privacy">
            <button className={privacy === "metadata_only" ? "active" : ""} onClick={() => setPrivacy("metadata_only")}>
              Metadata
            </button>
            <button className={privacy === "strict" ? "active" : ""} onClick={() => setPrivacy("strict")}>
              Strict
            </button>
            <button className={privacy === "allow_content" ? "active" : ""} onClick={() => setPrivacy("allow_content")}>
              Content
            </button>
          </div>
        </div>

        <div className="serverActions">
          <h2>Server</h2>
          <button onClick={() => void checkHealth()}>Check health</button>
          <button onClick={() => void refreshServerEvents()}>Load decoded</button>
        </div>
      </section>

      <section>
        <div className="sectionTitle">
          <h2>Scenarios</h2>
          <button className="primary" onClick={() => void flush()}>
            Flush queue
          </button>
        </div>
        <div className="scenarioGrid">
          {scenarios.map((scenario) => (
            <button className="scenario" key={scenario.id} onClick={() => record(scenario)}>
              <span>{scenario.eventType}</span>
              <strong>{scenario.title}</strong>
              <small>{scenario.description}</small>
              <i>reward {scenario.reward}</i>
            </button>
          ))}
        </div>
      </section>

      <section className="split">
        <Panel title="Transport payload" detail={status}>
          <pre>{lastBatch ? JSON.stringify(lastBatch, null, 2) : "No batch sent yet. Queue a scenario and flush."}</pre>
        </Panel>

        <Panel title="Server decoded events" detail={serverStatus}>
          <div className="eventList">
            {latestEvents.length === 0 ? <p>No decoded events loaded.</p> : null}
            {latestEvents.map((event) => (
              <article key={`${event.timestamp}-${event.type}-${event.sessionId}`}>
                <div>
                  <strong>{event.type}</strong>
                  <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                </div>
                <code>{JSON.stringify(event.payload)}</code>
              </article>
            ))}
          </div>
        </Panel>
      </section>

      <footer>
        <a href="http://localhost:5174" target="_blank" rel="noreferrer">
          Open dashboard
        </a>
        <a href="http://localhost:8787/v1/stats" target="_blank" rel="noreferrer">
          Open stats JSON
        </a>
      </footer>
    </main>
  );
}

function Metric(props: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function Panel(props: { title: string; detail: string; children: ReactNode }) {
  return (
    <div className="panel">
      <div className="panelTitle">
        <h2>{props.title}</h2>
        <span>{props.detail}</span>
      </div>
      {props.children}
    </div>
  );
}

function getBatchCount(batch: EncodedBatch): number {
  return "events" in batch ? batch.events.length : batch.e.length;
}

createRoot(document.getElementById("root")!).render(<ExampleApp />);
