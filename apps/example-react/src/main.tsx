import { SignalKit, type SignalKitClient } from "@signalkit/core";
import { agentPlugin, type AgentApi } from "@signalkit/plugin-agent";
import { feedbackPlugin, type FeedbackApi } from "@signalkit/plugin-feedback";
import { outcomePlugin, type OutcomeApi } from "@signalkit/plugin-outcome";
import { fetchTransport } from "@signalkit/transport-fetch";
import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Signal = SignalKitClient & FeedbackApi & AgentApi & OutcomeApi;

function createSignal(onStatus: (status: string) => void): Signal {
  const transport = fetchTransport({
    endpoint: "http://localhost:8787/v1/ingest"
  });

  return SignalKit.init({
    appId: "demo-app",
    publicKey: "dev_public_key",
    privacy: "metadata_only",
    schemaMode: "compact",
    flushIntervalMs: 5000,
    maxBatchSize: 50,
    plugins: [feedbackPlugin(), agentPlugin(), outcomePlugin()],
    transport: {
      async send(batch) {
        onStatus(`Sending compact batch: ${JSON.stringify(batch).slice(0, 120)}...`);
        await transport.send(batch);
        onStatus(`Last sent ${new Date().toLocaleTimeString()}`);
      }
    },
    debug: true
  }) as Signal;
}

function ExampleApp() {
  const [status, setStatus] = useState("Ready");
  const [queueSize, setQueueSize] = useState(0);
  const signal = useMemo(() => createSignal(setStatus), []);

  function updateQueue() {
    setQueueSize(signal.getQueueSize());
  }

  function record(label: string, action: () => void) {
    action();
    updateQueue();
    setStatus(`Queued ${label}`);
  }

  async function flush() {
    setStatus("Flushing");
    await signal.flush();
    updateQueue();
  }

  return (
    <main>
      <header>
        <div>
          <h1>SignalKit Example</h1>
          <p>Send compact feedback, agent-step, and outcome events to the local Fastify server.</p>
        </div>
        <div className="queue">
          <span>Queue</span>
          <strong>{queueSize}</strong>
        </div>
      </header>

      <section>
        <h2>Feedback</h2>
        <div className="grid">
          <Button
            label="Accepted feedback"
            onClick={() =>
              record("accepted feedback", () =>
                signal.feedback.record({
                  task: "generate_email_reply",
                  outputId: "out_123",
                  action: "accepted",
                  reward: 1,
                  metadata: { timeToDecisionMs: 4200, language: "en" }
                })
              )
            }
          />
          <Button
            label="Rejected feedback"
            onClick={() =>
              record("rejected feedback", () =>
                signal.feedback.record({
                  task: "summarize_contract",
                  outputId: "out_124",
                  action: "rejected",
                  reward: 0,
                  metadata: { timeToDecisionMs: 1800, language: "en" }
                })
              )
            }
          />
          <Button
            label="Edited then accepted"
            onClick={() =>
              record("edited feedback", () =>
                signal.feedback.record({
                  task: "generate_email_reply",
                  outputId: "out_125",
                  action: "edited_then_accepted",
                  reward: 0.82,
                  metadata: { timeToDecisionMs: 14000, editDistance: 0.24, language: "en" }
                })
              )
            }
          />
        </div>
      </section>

      <section>
        <h2>Agent steps</h2>
        <div className="grid">
          <Button
            label="Agent step success"
            onClick={() =>
              record("agent success", () =>
                signal.agent.step({
                  taskId: "task_123",
                  step: "search_docs",
                  tool: "vector_search",
                  status: "success",
                  reward: 0.9
                })
              )
            }
          />
          <Button
            label="Agent step failure"
            onClick={() =>
              record("agent failure", () =>
                signal.agent.step({
                  taskId: "task_123",
                  step: "call_crm",
                  tool: "http",
                  status: "failure",
                  reward: 0.1,
                  metadata: { retryable: true }
                })
              )
            }
          />
        </div>
      </section>

      <section>
        <h2>Outcomes</h2>
        <div className="grid">
          <Button
            label="Completed outcome"
            onClick={() =>
              record("completed outcome", () =>
                signal.outcome.record({
                  taskId: "task_123",
                  outcome: "completed",
                  reward: 1,
                  metadata: { durationMs: 43000 }
                })
              )
            }
          />
          <Button
            label="Abandoned outcome"
            onClick={() =>
              record("abandoned outcome", () =>
                signal.outcome.record({
                  taskId: "task_124",
                  outcome: "abandoned",
                  reward: 0,
                  metadata: { durationMs: 8000 }
                })
              )
            }
          />
        </div>
      </section>

      <footer>
        <button className="primary" onClick={() => void flush()}>
          Manual flush
        </button>
        <p>{status}</p>
      </footer>
    </main>
  );
}

function Button(props: { label: string; onClick: () => void }) {
  return <button onClick={props.onClick}>{props.label}</button>;
}

createRoot(document.getElementById("root")!).render(<ExampleApp />);
