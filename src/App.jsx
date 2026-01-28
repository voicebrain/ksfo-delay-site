import { useMemo, useState, useCallback } from "react";
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
  if (s.includes("congestion")) return "#8b5cf6";
  return "#6b7280";
}

// Parse Key_Evidence from pipe-separated format to array of bullets
function parseEvidence(evidence) {
  if (!evidence) return [];
  return evidence
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^[•\-]\s*/, "").trim());
}

// Classification options for dropdown
const CLASSIFICATION_OPTIONS = [
  "Early Arrival",
  "Late Arrival",
  "Late Tow Off",
  "Taxiway/Alleyway Congestion",
  "Gate Occupancy",
  "Ramp Congestion",
  "Weather",
  "ATC Ground Stop",
  "Mechanical Issue",
  "Error - No Delay Occurred",
  "Unknown",
];

export default function App() {
  const [q, setQ] = useState("");
  const [airline, setAirline] = useState("All");
  const [classification, setClassification] = useState("All");
  const [expanded, setExpanded] = useState(() => new Set());

  // User preferences
  const [callsignFormat, setCallsignFormat] = useState("IATA"); // "IATA" or "ICAO"
  const [timezone, setTimezone] = useState("PT"); // "UTC" or "PT"

  // Feedback tracking - stores user-selected classifications
  const [labelFeedback, setLabelFeedback] = useState(() => ({}));

  const airlineOptions = useMemo(() => {
    const set = new Set();
    for (const r of daily) {
      const f = String(r.Flight || "");
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

      if (!qq) return true;
      const hay = [
        r.Date, r.Flight, r.Flight_IATA, r.Flight_ICAO,
        r.Scheduled_Arrival_UTC, r.Actual_Landing_UTC, r.Gate_Arrival_UTC,
        r.Taxi_Delay_Minutes, r.Schedule_Variance_Minutes,
        r.Schedule_Status, r.VB_Delay_Classification, r.Analysis_Quality, r.Flight_ID
      ].map((x) => String(x ?? "")).join(" ").toLowerCase();
      return hay.includes(qq);
    });
  }, [q, airline, classification]);

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

  // Get flight number based on user preference
  function getFlightNumber(r) {
    return callsignFormat === "ICAO" ? fmt(r.Flight_ICAO) : fmt(r.Flight_IATA);
  }

  // Convert UTC time string (HH:MM) to PT (UTC-8)
  function utcToPT(utcTime) {
    if (!utcTime) return "";
    const [hours, minutes] = utcTime.split(":").map(Number);
    let ptHours = hours - 8;
    if (ptHours < 0) ptHours += 24;
    return `${String(ptHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  // Get time based on user preference
  function getScheduledArrival(r) {
    if (timezone === "PT") {
      return fmt(utcToPT(r.Scheduled_Arrival_UTC));
    }
    return fmt(r.Scheduled_Arrival_UTC);
  }

  function getActualLanding(r) {
    return timezone === "PT" ? fmt(r.Actual_Landing_PT) : fmt(r.Actual_Landing_UTC);
  }

  function getGateArrival(r) {
    return timezone === "PT" ? fmt(r.Gate_Arrival_PT) : fmt(r.Gate_Arrival_UTC);
  }

  // Handle classification feedback
  function handleLabelChange(flightId, newLabel) {
    setLabelFeedback((prev) => ({
      ...prev,
      [flightId]: newLabel,
    }));
  }

  // Get current label (user feedback or original)
  function getCurrentLabel(r) {
    const id = String(r.Flight_ID || `${r.Flight}-${r.Date}`);
    return labelFeedback[id] || r.VB_Delay_Classification;
  }

  // Export to Excel (CSV format that Excel can open)
  const exportToExcel = useCallback(() => {
    const headers = [
      "Date",
      "Flight",
      "Flight_IATA",
      "Flight_ICAO",
      "Origin",
      "Aircraft_Type",
      "Gate",
      "Scheduled_Arrival_UTC",
      "Actual_Landing_UTC",
      "Gate_Arrival_UTC",
      "Actual_Landing_PT",
      "Gate_Arrival_PT",
      "Taxi_Delay_Minutes",
      "Schedule_Variance_Minutes",
      "Schedule_Status",
      "Original_Classification",
      "User_Classification",
      "ATC_Messages_Found",
      "Evidence_Items",
      "Analysis_Quality",
      "Key_Evidence",
      "Flight_ID",
    ];

    const rows = filtered.map((r) => {
      const id = String(r.Flight_ID || `${r.Flight}-${r.Date}`);
      const userLabel = labelFeedback[id] || "";
      return [
        r.Date,
        r.Flight,
        r.Flight_IATA,
        r.Flight_ICAO,
        r.Origin,
        r.Aircraft_Type,
        r.Gate,
        r.Scheduled_Arrival_UTC,
        r.Actual_Landing_UTC,
        r.Gate_Arrival_UTC,
        r.Actual_Landing_PT,
        r.Gate_Arrival_PT,
        r.Taxi_Delay_Minutes,
        r.Schedule_Variance_Minutes,
        r.Schedule_Status,
        r.VB_Delay_Classification,
        userLabel,
        r.ATC_Messages_Found,
        r.Evidence_Items,
        r.Analysis_Quality,
        r.Key_Evidence,
        r.Flight_ID,
      ].map((val) => {
        // Escape quotes and wrap in quotes if contains comma or quote
        const str = String(val ?? "");
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
    });

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `KSFO_Taxi_Delays_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filtered, labelFeedback]);

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
      </div>

      <div className="preferences">
        <label className="pref-label">
          <span className="subtle">Callsign:</span>
          <select className="select small" value={callsignFormat} onChange={(e) => setCallsignFormat(e.target.value)}>
            <option value="IATA">IATA (AA1476)</option>
            <option value="ICAO">ICAO (AAL1476)</option>
          </select>
        </label>
        <label className="pref-label">
          <span className="subtle">Timezone:</span>
          <select className="select small" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            <option value="UTC">UTC</option>
            <option value="PT">Pacific Time</option>
          </select>
        </label>
        <button className="exportBtn" onClick={exportToExcel}>
          Export to Excel
        </button>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Flight</th>
              <th>Scheduled<br />arrival ({timezone})</th>
              <th>Actual<br />landing ({timezone})</th>
              <th>Gate<br />arrival ({timezone})</th>
              <th>Taxi<br />delay (min)</th>
              <th>Schedule<br />variance (min)</th>
              <th>Delay<br />classification</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const id = String(r.Flight_ID || `${r.Flight}-${r.Date}`);
              const isOpen = expanded.has(id);
              const currentLabel = getCurrentLabel(r);
              const evidenceBullets = parseEvidence(r.Key_Evidence);

              return (
                <>
                  <tr key={id}>
                    <td>{getFlightNumber(r)}</td>
                    <td>{getScheduledArrival(r)}</td>
                    <td>{getActualLanding(r)}</td>
                    <td>{getGateArrival(r)}</td>
                    <td>{fmt(r.Taxi_Delay_Minutes)}</td>
                    <td>{fmt(r.Schedule_Variance_Minutes)}</td>
                    <td>
                      <span className="badge">
                        <span className="dot" style={{ background: classificationDotColor(currentLabel) }} />
                        {fmt(currentLabel)}
                      </span>
                    </td>
                    <td>
                      <button className="rowBtn" onClick={() => toggleRow(id)}>
                        {isOpen ? "Hide" : "Show"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={id + "_details"}>
                      <td className="details" colSpan={8}>
                        <div className="details-header">
                          <div className="subtle">
                            Flight ID: <span className="mono">{id}</span>
                          </div>
                        </div>

                        <div className="details-grid">
                          <div className="details-section">
                            <div className="section-title">Flight Information</div>
                            <div className="info-row"><span className="subtle">Gate:</span> <b>{fmt(r.Gate) || "Unknown"}</b></div>
                            <div className="info-row"><span className="subtle">Aircraft:</span> <b>{fmt(r.Aircraft_Type)}</b></div>
                            <div className="info-row"><span className="subtle">Origin:</span> <b>{fmt(r.Origin)}</b></div>
                            {r.Prior_Flight_At_Gate && (
                              <div className="info-row" style={{ marginTop: 8 }}>
                                <span className="subtle">Prior plane at gate:</span> <b>{fmt(r.Prior_Flight_At_Gate)}</b>
                                {r.Prior_Flight_Departure_Status && (
                                  <span className="subtle" style={{ marginLeft: 8, fontSize: 12 }}>({r.Prior_Flight_Departure_Status})</span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="details-section">
                            <div className="section-title">Analysis</div>
                            <div className="info-row"><span className="subtle">ATC messages found:</span> <b>{fmt(r.ATC_Messages_Found)}</b></div>
                            <div className="info-row"><span className="subtle">Evidence items:</span> <b>{fmt(r.Evidence_Items)}</b></div>
                            <div className="info-row"><span className="subtle">Analysis quality:</span> <b>{fmt(r.Analysis_Quality)}</b></div>
                          </div>

                          <div className="details-section">
                            <div className="section-title">Classification Feedback</div>
                            <div className="info-row">
                              <span className="subtle">Model suggested:</span> <b>{fmt(r.VB_Delay_Classification)}</b>
                            </div>
                            <label className="feedback-label">
                              <span className="subtle">Your classification:</span>
                              <select
                                className="select feedback-select"
                                value={labelFeedback[id] || ""}
                                onChange={(e) => handleLabelChange(id, e.target.value)}
                              >
                                <option value="">-- Select to provide feedback --</option>
                                {CLASSIFICATION_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>

                        <div className="evidence-section">
                          <div className="section-title">Key Evidence</div>
                          {r.Evidence_Details && r.Evidence_Details.length > 0 ? (
                            <ul className="evidence-list">
                              {r.Evidence_Details.map((ev, idx) => (
                                <li key={idx}>
                                  <span className="evidence-time">{ev.time}</span>
                                  <span className="evidence-channel">[{ev.channel}]</span>
                                  <span className="evidence-message">{ev.message}</span>
                                  {ev.relevance && <div className="evidence-relevance">{ev.relevance}</div>}
                                </li>
                              ))}
                            </ul>
                          ) : evidenceBullets.length > 0 ? (
                            <ul className="evidence-list">
                              {evidenceBullets.map((bullet, idx) => (
                                <li key={idx}>{bullet}</li>
                              ))}
                            </ul>
                          ) : (
                            <div className="subtle">No evidence available</div>
                          )}
                        </div>

                        <div className="atc-section">
                          <div className="section-title">ATC Messages</div>
                          {r.ATC_Messages && r.ATC_Messages.length > 0 ? (
                            <ul className="atc-list">
                              {r.ATC_Messages.map((msg, idx) => (
                                <li key={idx}>
                                  <span className="atc-time">{msg.time}</span>
                                  <span className="atc-channel">[{msg.channel}]</span>
                                  <span className="atc-message">{msg.message}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="subtle atc-note">
                              {r.ATC_Messages_Found} ATC messages were analyzed for this flight.
                              No specific messages available.
                            </div>
                          )}
                        </div>
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
