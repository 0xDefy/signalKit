import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type Stats = {
  totalEvents: number;
  eventsByType: Record<string, number>;
  avgRewardByType: Record<string, number>;
  recentSessions: string[];
};

type EventRow = {
  type: string;
  timestamp: number;
  sessionId: string;
  appId?: string;
  payload: Record<string, unknown>;
  receivedAt: number;
};

const api = "http://localhost:8787";

function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selected, setSelected] = useState<EventRow | null>(null);
  const [status, setStatus] = useState("Ready");

  async function refresh() {
    setStatus("Refreshing");
    const [statsResponse, eventsResponse] = await Promise.all([
      fetch(`${api}/v1/stats`),
      fetch(`${api}/v1/events`)
    ]);
    const nextStats = (await statsResponse.json()) as Stats;
    const nextEvents = ((await eventsResponse.json()) as { events: EventRow[] }).events;
    setStats(nextStats);
    setEvents(nextEvents);
    setSelected((current) => current ?? nextEvents[0] ?? null);
    setStatus(`Updated ${new Date().toLocaleTimeString()}`);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const typeRows = useMemo(() => Object.entries(stats?.eventsByType ?? {}), [stats]);

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>SignalKit</h1>
          <p>Feedback, outcome, and reward signals decoded from compact SDK batches.</p>
        </div>
        <button onClick={() => void refresh()}>Refresh</button>
      </header>

      <section className="metrics">
        <Metric label="Total events" value={stats?.totalEvents ?? 0} />
        <Metric label="Event types" value={typeRows.length} />
        <Metric label="Recent sessions" value={stats?.recentSessions.length ?? 0} />
      </section>

      <section className="split">
        <div className="panel">
          <div className="panelTitle">
            <h2>Events by type</h2>
            <span>{status}</span>
          </div>
          <div className="bars">
            {typeRows.length === 0 ? <p className="empty">No events yet.</p> : null}
            {typeRows.map(([type, count]) => (
              <div className="barRow" key={type}>
                <span>{type}</span>
                <div>
                  <i style={{ width: `${Math.max(8, count * 18)}px` }} />
                </div>
                <strong>{count}</strong>
              </div>
            ))}
          </div>
          <h2>Average reward</h2>
          <div className="rewardGrid">
            {Object.entries(stats?.avgRewardByType ?? {}).map(([type, reward]) => (
              <div className="reward" key={type}>
                <span>{type}</span>
                <strong>{reward.toFixed(3)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Latest events</h2>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Reward</th>
                  <th>Session</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    className={selected === event ? "selected" : ""}
                    key={`${event.timestamp}-${event.type}-${event.sessionId}`}
                    onClick={() => setSelected(event)}
                  >
                    <td>{event.type}</td>
                    <td>{String(event.payload.reward ?? "-")}</td>
                    <td>{event.sessionId}</td>
                    <td>{new Date(event.timestamp).toLocaleTimeString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="split bottom">
        <div className="panel">
          <h2>Decoded payload</h2>
          <pre>{selected ? JSON.stringify(selected, null, 2) : "Select an event"}</pre>
        </div>
        <div className="panel">
          <h2>Compact decoding</h2>
          <p>
            The SDK sends short event codes, arrays, and scaled reward integers. The server expands
            each batch with its dictionary so dashboards, evaluation exports, and developer-owned
            analytics can read normal JSON again.
          </p>
          <code>{"fb -> feedback, as -> agent_step, oc -> outcome"}</code>
        </div>
      </section>
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

createRoot(document.getElementById("root")!).render(<Dashboard />);
