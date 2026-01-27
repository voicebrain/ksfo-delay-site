import { useMemo, useState } from "react";
import daily from "./data/daily_delay_summary.json";
import stats from "./data/statistics.json";

function fmt(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(1).replace(/\.0$/, "") : "";
  return String(v);
}

function kpiValue(metricName) {
  const row = stats.find((r) => String(r.Metric).toLowerCase() === metricName.toLowerCase());
  return row ? row.Value : "";
}

function classificationDotColor(cls) {
  const s = String(cls || "").toLowerCase();
  if (s.includes("early")) return "#3b82f6";
  if (s.includes("late")) return "#ef4444";
  if (s.includes("error")) return "#f59e0b";
  return "#6b7280";
}

export default function App() {
  const [q, setQ] = useState("");
  const [airline, setAirline] = useState("All");
  const [classification, setClassification] = useState("All");
  const [minConfidence, setMinConfidence] = useState(0);
  const [expanded, setExpanded] = useState(() => new Set());

  const airlineOptions = useMemo(() => {
    const set = new Set();
    for (const r of daily) {
      const f = String(r.Flight || "");
      // Airline inferred from leading letters, e.g., UA662 -> UA
      const m = f.match(/^[A-Za-z]+/);
      if (m) set.add(m[0].toUpperCase());
    }
    return ["All", ...Array.from(set).sort()];
  }, []);

  const classificationOptions = useMemo(() => {
    const set = new Set(daily.map((r) => String(r.VB_Delay_Classification || "").trim()).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, []);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return daily.filter((r) => {
      const f = String(r.Flight || "");
      const m = f.match(/^[A-Za-z]+/);
      const a = m ? m[0].toUpperCase() : "";
      if (airline !== "All" && a !== airline) return false;

      const cls = String(r.VB_Delay_Classification || "");
      if (classification !== "All" && cls !== classification) return false;

      const conf = Number(r.VB_Confidence_Percent ?? 0);
      if (conf < minConfidence) return false;

      if (!qq) return true;
      // free-text match across a few useful fields
      const hay = [
        r.Date, r.Flight, r.Flight_IATA, r.Flight_ICAO,
        r.Scheduled_Arrival_UTC, r.Actual_Landing_UTC, r.Gate_Arrival_UTC,
        r.Taxi_Delay_Minutes, r.Schedule_Variance_Minutes,
        r.Schedule_Status, r.VB_Delay_Classification, r.Analysis_Quality, r.Flight_ID
      ].map((x) => String(x ?? "")).join(" ").toLowerCase();
      return hay.includes(qq);
    });
  }, [q, airline, classification, minConfidence]);

  const avgTaxiDelay = kpiValue("Average Taxi Delay (min)");
  const maxTaxiDelay = kpiValue("Max Taxi Delay (min)");
  const totalDelayed = kpiValue("Total Delayed Flights");
  const analysisDate = kpiValue("Analysis Date");
  const coverage = kpiValue("Flights with Schedule Data");

  function toggleRow(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="container">
      <div>
        <div className="h1">KSFO Taxi Delays</div>
        <div className="subtle">Public summary for {fmt(analysisDate)} · Data rows: {filtered.length} / {daily.length}</div>
      </div>

      <div className="grid">
        <div className="card">
          <div className="k">Total delayed flights</div>
          <div className="v">{fmt(totalDelayed)}</div>
        </div>
        <div className="card">
          <div className="k">Average taxi delay (min)</div>
          <div className="v">{fmt(avgTaxiDelay)}</div>
        </div>
        <div className="card">
          <div className="k">Max taxi delay (min)</div>
          <div className="v">{fmt(maxTaxiDelay)}</div>
        </div>
        <div className="card">
          <div className="k">Schedule data coverage</div>
          <div className="v" style={{ fontSize: 18 }}>{fmt(coverage)}</div>
        </div>
      </div>

      <div className="toolbar">
        <input
          className="input"
          style={{ minWidth: 260 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search flight, times, delay type, etc."
        />
        <select className="select" value={airline} onChange={(e) => setAirline(e.target.value)}>
          {airlineOptions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select className="select" value={classification} onChange={(e) => setClassification(e.target.value)}>
          {classificationOptions.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="subtle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Min confidence
          <input
            type="range"
            min="0"
            max="100"
            value={minConfidence}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
          />
          <span style={{ width: 34, textAlign: "right" }}>{minConfidence}%</span>
        </label>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Flight</th>
              <th>Scheduled arrival (UTC)</th>
              <th>Actual landing (UTC)</th>
              <th>Gate arrival (UTC)</th>
              <th>Taxi delay (min)</th>
              <th>Schedule variance (min)</th>
              <th>Delay classification</th>
              <th>Confidence</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const id = String(r.Flight_ID || `${r.Flight}-${r.Date}`);
              const isOpen = expanded.has(id);
              const cls = r.VB_Delay_Classification;
              const conf = Number(r.VB_Confidence_Percent ?? 0);

              return (
                <>
                  <tr key={id}>
                    <td>{fmt(r.Date)}</td>
                    <td>{fmt(r.Flight)}</td>
                    <td>{fmt(r.Scheduled_Arrival_UTC)}</td>
                    <td>{fmt(r.Actual_Landing_UTC)}</td>
                    <td>{fmt(r.Gate_Arrival_UTC)}</td>
                    <td>{fmt(r.Taxi_Delay_Minutes)}</td>
                    <td>{fmt(r.Schedule_Variance_Minutes)}</td>
                    <td>
                      <span className="badge">
                        <span className="dot" style={{ background: classificationDotColor(cls) }} />
                        {fmt(cls)}
                      </span>
                    </td>
                    <td>{Number.isFinite(conf) ? `${conf}%` : ""}</td>
                    <td>
                      <button className="rowBtn" onClick={() => toggleRow(id)}>
                        {isOpen ? "Hide" : "Show"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={id + "_details"}>
                      <td className="details" colSpan={10}>
                        <div className="subtle" style={{ marginBottom: 6 }}>
                          Flight ID: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{id}</span>
                        </div>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                          <div><span className="subtle">ATC messages found:</span> <b>{fmt(r.ATC_Messages_Found)}</b></div>
                          <div><span className="subtle">Evidence items:</span> <b>{fmt(r.Evidence_Items)}</b></div>
                          <div><span className="subtle">Analysis quality:</span> <b>{fmt(r.Analysis_Quality)}</b></div>
                          <div><span className="subtle">Hour of day:</span> <b>{fmt(r.Hour_of_Day)}</b></div>
                        </div>
                        <pre className="evidence">{fmt(r.Key_Evidence)}</pre>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="subtle" style={{ marginTop: 14, fontSize: 12 }}>
        Source: KSFO_Taxi_Delays_Summary_2026-01-25.xlsx · Sheet: Daily_Delay_Summary + Statistics
      </div>
    </div>
  );
}
