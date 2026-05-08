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
  const [typeFilter, setTypeFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");
  const [taskFilter, setTaskFilter] = useState("");
  const [minReward, setMinReward] = useState("");
  const [maxReward, setMaxReward] = useState("");
  const [limit, setLimit] = useState("100");

  async function refresh() {
    setStatus("Refreshing");
    const query = buildQuery();
    const [statsResponse, eventsResponse] = await Promise.all([
      fetch(`${api}/v1/stats`),
      fetch(`${api}/v1/events${query}`)
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
  const exportQuery = buildQuery();

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>SignalKit</h1>
          <p>Feedback, outcome, and reward signals decoded from compact SDK batches.</p>
        </div>
        <div className="headerActions">
          <a href={`${api}/v1/export.json${exportQuery}`} download>
            Export JSON
          </a>
          <a href={`${api}/v1/export.jsonl${exportQuery}`} download>
            Export JSONL
          </a>
          <a href={`${api}/v1/export.jsonl.gz${exportQuery}`} download>
            Export Gzip
          </a>
          <button onClick={() => void refresh()}>Refresh</button>
        </div>
      </header>

      <section className="filters">
        <label>
          <span>Type</span>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="">All</option>
            {typeRows.map(([type]) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Session</span>
          <input value={sessionFilter} onChange={(event) => setSessionFilter(event.target.value)} placeholder="s_..." />
        </label>
        <label>
          <span>Task</span>
          <input value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)} placeholder="task_..." />
        </label>
        <label>
          <span>Min reward</span>
          <input value={minReward} onChange={(event) => setMinReward(event.target.value)} placeholder="0" />
        </label>
        <label>
          <span>Max reward</span>
          <input value={maxReward} onChange={(event) => setMaxReward(event.target.value)} placeholder="1" />
        </label>
        <label>
          <span>Limit</span>
          <input value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="100" />
        </label>
        <button onClick={() => void refresh()}>Apply filters</button>
      </section>

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
          <code>{"fb -> feedback, as -> agent_step, oc -> outcome, ga/gl/gi -> game summaries"}</code>
          <div className="exportBox">
            <h2>Developer-owned export</h2>
            <p>
              JSON is convenient for app scripts and inspection. JSONL is better for datasets,
              warehouse imports, eval pipelines, and fine-tuning preparation.
            </p>
            <div className="exportLinks">
              <a href={`${api}/v1/export.json${exportQuery}`} download>
                Download JSON
              </a>
              <a href={`${api}/v1/export.jsonl${exportQuery}`} download>
                Download JSONL
              </a>
              <a href={`${api}/v1/export.jsonl.gz${exportQuery}`} download>
                JSONL Gzip
              </a>
              <a href={`${api}/v1/export.compact.jsonl`} download>
                Full Compact Archive
              </a>
              <a href={`${api}/v1/export.compact.jsonl.gz`} download>
                Full Compact Gzip
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );

  function buildQuery(): string {
    const params = new URLSearchParams();
    if (typeFilter) params.set("type", typeFilter);
    if (sessionFilter.trim()) params.set("sessionId", sessionFilter.trim());
    if (taskFilter.trim()) params.set("taskId", taskFilter.trim());
    if (minReward.trim()) params.set("minReward", minReward.trim());
    if (maxReward.trim()) params.set("maxReward", maxReward.trim());
    if (limit.trim()) params.set("limit", limit.trim());
    const query = params.toString();
    return query ? `?${query}` : "";
  }
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
