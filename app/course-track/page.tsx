"use client";

// FILE LOCATION IN GITHUB: app/course-track/page.tsx
// Live course track - reads the course_* tables from Supabase.
// Refreshes automatically every 10 seconds.
// Default event = KDR test event. Override with /course-track?event=EVENT_UUID

import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

const DEFAULT_EVENT_ID = "84416171-e055-4014-a002-21110af8eff1";
const REFRESH_SECONDS = 10;

// Next.js only exposes variables starting NEXT_PUBLIC_ to the browser.
// Several common names are tried so this matches the existing app settings.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL ??
  "";
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_KEY ??
  "";
const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/* ------------------------------------------------------------
   TYPES
   ------------------------------------------------------------ */

type Checkpoint = { id: string; code: string; name: string; sequence_no: number };

type Phase = {
  id: string;
  name: string;
  phase_type: string;
  sequence_no: number;
  status: string;
};

type Unit = {
  id: string;
  unit_code: string;
  display_name: string;
  unit_type: string;
  status: string;
};

type Position = {
  course_unit_id: string;
  position_type: string;
  last_checkpoint_id: string | null;
  destination_checkpoint_id: string | null;
};

type Section = {
  id: string;
  from_checkpoint_id: string;
  to_checkpoint_id: string;
  sequence_no: number;
  bike_sweep_status: string;
  car_readiness_status: string;
  notes: string | null;
};

type Entrant = {
  id: string;
  entrant_type: string | null;
  competition_number: string | null;
  primary_name: string | null;
};

type Recovery = {
  id: string;
  entrant_id: string;
  checkpoint_id: string | null;
  location_notes: string | null;
  accountability_status: string;
  recovery_status: string;
  assigned_unit_id: string | null;
  priority: string;
};

type TrackData = {
  eventName: string;
  checkpoints: Checkpoint[];
  phases: Phase[];
  units: Unit[];
  positions: Position[];
  sections: Section[];
  recoveries: Recovery[];
  entrants: Entrant[];
};

const EMPTY: TrackData = {
  eventName: "",
  checkpoints: [],
  phases: [],
  units: [],
  positions: [],
  sections: [],
  recoveries: [],
  entrants: [],
};

/* ------------------------------------------------------------
   HELPERS
   ------------------------------------------------------------ */

function label(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function isCarPhase(phase: Phase | undefined) {
  if (!phase) return false;
  return ["COURSE_PREP", "CAR_RACING", "CAR_FINAL_CLEARANCE"].includes(phase.phase_type);
}

function sectionColour(status: string) {
  if (status === "COMPLETE" || status === "READY") return "#16834a";
  if (status === "IN_PROGRESS" || status === "CHECKING") return "#e39b12";
  if (status === "ISSUE") return "#d53434";
  return "#cbd4da";
}

function recoveryColour(status: string) {
  if (status === "REQUIRED") return "#d53434";
  if (status === "ASSIGNED" || status === "LOCATED") return "#d88900";
  if (status === "RECOVERING") return "#7446aa";
  return "#16834a";
}

function unitColour(type: string) {
  return type === "SWEEP_RIDER" ? "#7446aa" : "#1769aa";
}

function timeText(d: Date | null) {
  if (!d) return "-";
  return d.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* ------------------------------------------------------------
   PAGE
   ------------------------------------------------------------ */

export default function CourseTrackPage() {
  const [eventId, setEventId] = useState<string | null>(null);
  const [data, setData] = useState<TrackData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Read ?event= from the address bar (falls back to the test event)
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("event");
    setEventId(fromUrl || DEFAULT_EVENT_ID);
  }, []);

  const load = useCallback(async () => {
    if (!eventId) return;

    if (!supabase) {
      setError(
        `Supabase settings missing in the browser. URL found: ${supabaseUrl ? "yes" : "no"}. Key found: ${supabaseKey ? "yes" : "no"}. Check the variable names in Vercel start with NEXT_PUBLIC_ and redeploy.`
      );
      setLoading(false);
      return;
    }

    try {
      const [ev, cps, phs, uns, pos, secs, recs] = await Promise.all([
        supabase.from("events").select("id,name").eq("id", eventId).maybeSingle(),
        supabase.from("course_checkpoints").select("id,code,name,sequence_no")
          .eq("event_id", eventId).eq("active", true).order("sequence_no"),
        supabase.from("event_phases").select("id,name,phase_type,sequence_no,status")
          .eq("event_id", eventId).order("sequence_no"),
        supabase.from("course_units").select("id,unit_code,display_name,unit_type,status")
          .eq("event_id", eventId).eq("active", true).order("unit_code"),
        supabase.from("course_unit_positions")
          .select("course_unit_id,position_type,last_checkpoint_id,destination_checkpoint_id")
          .eq("event_id", eventId),
        supabase.from("course_sections")
          .select("id,from_checkpoint_id,to_checkpoint_id,sequence_no,bike_sweep_status,car_readiness_status,notes")
          .eq("event_id", eventId).order("sequence_no"),
        supabase.from("course_recoveries")
          .select("id,entrant_id,checkpoint_id,location_notes,accountability_status,recovery_status,assigned_unit_id,priority")
          .eq("event_id", eventId).neq("recovery_status", "CLOSED").order("reported_at"),
      ]);

      const firstError =
        ev.error || cps.error || phs.error || uns.error || pos.error || secs.error || recs.error;
      if (firstError) throw new Error(firstError.message);

      const recoveries = (recs.data ?? []) as Recovery[];

      // Look up entrant numbers/names for the open recoveries
      let entrants: Entrant[] = [];
      const entrantIds = recoveries.map((r) => r.entrant_id);
      if (entrantIds.length > 0) {
        const ent = await supabase
          .from("entrants")
          .select("id,entrant_type,competition_number,primary_name")
          .in("id", entrantIds);
        if (!ent.error) entrants = (ent.data ?? []) as Entrant[];
      }

      setData({
        eventName: (ev.data as { name?: string } | null)?.name ?? "Event not found",
        checkpoints: (cps.data ?? []) as Checkpoint[],
        phases: (phs.data ?? []) as Phase[],
        units: (uns.data ?? []) as Unit[],
        positions: (pos.data ?? []) as Position[],
        sections: (secs.data ?? []) as Section[],
        recoveries,
        entrants,
      });
      setError(null);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load course data.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // Initial load + auto refresh
  useEffect(() => {
    if (!eventId) return;
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [eventId, load]);

  /* ---------- derived values ---------- */

  const activePhase = data.phases.find((p) => p.status === "ACTIVE");
  const carMode = isCarPhase(activePhase);
  const lastIndex = Math.max(data.checkpoints.length - 1, 1);

  const cpIndex = useMemo(
    () => new Map(data.checkpoints.map((c, i) => [c.id, i])),
    [data.checkpoints]
  );
  const cpById = useMemo(
    () => new Map(data.checkpoints.map((c) => [c.id, c])),
    [data.checkpoints]
  );
  const unitById = useMemo(() => new Map(data.units.map((u) => [u.id, u])), [data.units]);
  const entrantById = useMemo(
    () => new Map(data.entrants.map((e) => [e.id, e])),
    [data.entrants]
  );

  const pct = (index: number) => (index / lastIndex) * 100;

  const unitMarkers = data.units.map((unit, i) => {
    const pos = data.positions.find((p) => p.course_unit_id === unit.id);
    const from = pos?.last_checkpoint_id ? cpIndex.get(pos.last_checkpoint_id) : undefined;
    const to = pos?.destination_checkpoint_id ? cpIndex.get(pos.destination_checkpoint_id) : undefined;

    let left = 0;
    let text = "Position unknown";

    if (pos?.position_type === "IN_TRANSIT" && from !== undefined && to !== undefined) {
      left = pct((from + to) / 2);
      text = `${cpById.get(pos.last_checkpoint_id ?? "")?.code} → ${cpById.get(pos.destination_checkpoint_id ?? "")?.code}`;
    } else if (pos?.position_type === "CHECKPOINT" && from !== undefined) {
      left = pct(from);
      text = `At ${cpById.get(pos.last_checkpoint_id ?? "")?.code}`;
    }

    return { unit, left, text, row: i % 3 };
  });

  const clearedCount = data.sections.filter((s) =>
    carMode ? s.car_readiness_status === "READY" : s.bike_sweep_status === "COMPLETE"
  ).length;

  /* ---------- render ---------- */

  if (loading) {
    return (
      <main style={styles.page}>
        <h2>Loading course status…</h2>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>COURSE OPERATIONS</div>
          <h1 style={styles.title}>{data.eventName}</h1>
          <div style={styles.subtitle}>
            {activePhase ? activePhase.name : "No active phase"}
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ ...styles.live, color: error ? "#d88900" : "#138447" }}>
            <span style={{ ...styles.liveDot, background: error ? "#e39b12" : "#16a05d" }} />
            {error ? "RECONNECTING" : "LIVE"}
          </div>
          <div style={styles.small}>Updated {timeText(lastUpdated)} · every {REFRESH_SECONDS}s</div>
          <button style={styles.button} onClick={() => void load()}>
            Refresh now
          </button>
        </div>
      </header>

      {error && <div style={styles.errorBox}>{error}</div>}

      <section style={styles.summary}>
        <Card title="ACTIVE PHASE" value={activePhase ? activePhase.name : "Not set"} />
        <Card
          title={carMode ? "SECTIONS READY" : "SECTIONS SWEPT"}
          value={`${clearedCount} / ${data.sections.length}`}
        />
        <Card title="OPEN RECOVERIES" value={String(data.recoveries.length)} alert={data.recoveries.length > 0} />
        <Card title="ACTIVE UNITS" value={String(data.units.length)} />
      </section>

      <section style={styles.panel}>
        <div style={styles.eyebrow}>POSITION BOARD</div>
        <h2 style={styles.panelTitle}>Course Track</h2>
        <p style={styles.note}>Positions are operational (last checkpoint → destination), not GPS.</p>

        {data.checkpoints.length < 2 ? (
          <div style={styles.empty}>No checkpoints configured for this event.</div>
        ) : (
          <div style={styles.scrollArea}>
            <div style={styles.trackArea}>
              <div style={styles.inner}>
                {/* SECTIONS */}
                {data.sections.map((s) => {
                  const a = cpIndex.get(s.from_checkpoint_id);
                  const b = cpIndex.get(s.to_checkpoint_id);
                  if (a === undefined || b === undefined) return null;
                  const status = carMode ? s.car_readiness_status : s.bike_sweep_status;
                  return (
                    <div
                      key={s.id}
                      title={s.notes ?? ""}
                      style={{
                        ...styles.segment,
                        left: `${pct(a)}%`,
                        width: `${pct(b) - pct(a)}%`,
                        background: sectionColour(status),
                      }}
                    >
                      <span style={styles.segmentLabel}>{label(status)}</span>
                    </div>
                  );
                })}

                {/* CHECKPOINTS */}
                {data.checkpoints.map((c, i) => (
                  <div key={c.id} style={{ ...styles.checkpoint, left: `${pct(i)}%` }}>
                    <div style={styles.dot} />
                    <strong style={styles.cpText}>{c.code}</strong>
                  </div>
                ))}

                {/* UNITS */}
                {unitMarkers.map((m) => (
                  <div
                    key={m.unit.id}
                    style={{
                      ...styles.unit,
                      left: `${m.left}%`,
                      top: 10 + m.row * 62,
                      borderColor: unitColour(m.unit.unit_type),
                    }}
                  >
                    <span style={{ ...styles.unitBadge, background: unitColour(m.unit.unit_type) }}>
                      {m.unit.unit_type === "SWEEP_RIDER" ? "SW" : "CC"}
                    </span>{" "}
                    <strong>{m.unit.unit_code}</strong>
                    <div style={{ color: unitColour(m.unit.unit_type), fontSize: 10, fontWeight: 700 }}>
                      {m.text}
                    </div>
                  </div>
                ))}

                {/* RECOVERIES */}
                {data.recoveries.map((r, i) => {
                  const idx = r.checkpoint_id ? cpIndex.get(r.checkpoint_id) : undefined;
                  const ent = entrantById.get(r.entrant_id);
                  const colour = recoveryColour(r.recovery_status);
                  return (
                    <div
                      key={r.id}
                      style={{
                        ...styles.recovery,
                        left: `${pct(idx ?? 0)}%`,
                        top: 300 + (i % 2) * 62,
                        borderColor: colour,
                      }}
                    >
                      <span style={{ ...styles.warning, background: colour }}>!</span>
                      <div>
                        <strong>#{ent?.competition_number ?? "?"}</strong>{" "}
                        <span style={styles.small}>{label(ent?.entrant_type)}</span>
                        <div style={{ color: colour, fontSize: 10, fontWeight: 800 }}>
                          {label(r.recovery_status)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div style={styles.legend}>
          <Legend colour="#16834a" text={carMode ? "Ready" : "Swept"} />
          <Legend colour="#e39b12" text="In progress" />
          <Legend colour="#d53434" text="Issue" />
          <Legend colour="#cbd4da" text="Pending" />
        </div>
      </section>

      <section style={styles.lowerGrid}>
        <div style={styles.panel}>
          <div style={styles.eyebrow}>FIELD RESOURCES</div>
          <h2 style={styles.panelTitle}>Course Units</h2>
          {unitMarkers.length === 0 && <div style={styles.empty}>No units configured.</div>}
          {unitMarkers.map((m) => (
            <div key={m.unit.id} style={styles.row}>
              <div style={{ ...styles.unitBox, color: unitColour(m.unit.unit_type) }}>
                {m.unit.unit_type === "SWEEP_RIDER" ? "SW" : "CC"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}>{m.unit.display_name}</div>
                <div style={styles.small}>{m.text}</div>
              </div>
              <span style={styles.status}>{label(m.unit.status)}</span>
            </div>
          ))}
        </div>

        <div style={styles.panel}>
          <div style={{ ...styles.eyebrow, color: "#d53434" }}>EXCEPTIONS</div>
          <h2 style={styles.panelTitle}>Open Recovery Items</h2>
          {data.recoveries.length === 0 && (
            <div style={{ ...styles.empty, color: "#16834a" }}>✓ No open recovery items</div>
          )}
          {data.recoveries.map((r) => {
            const ent = entrantById.get(r.entrant_id);
            const colour = recoveryColour(r.recovery_status);
            const cp = r.checkpoint_id ? cpById.get(r.checkpoint_id) : undefined;
            const assigned = r.assigned_unit_id ? unitById.get(r.assigned_unit_id) : undefined;
            return (
              <div key={r.id} style={styles.row}>
                <div style={{ width: 7, height: 48, borderRadius: 5, background: colour }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>
                    #{ent?.competition_number ?? "?"} {ent?.primary_name ?? ""}
                  </div>
                  <div style={styles.small}>
                    {cp?.code ?? r.location_notes ?? "Location unknown"} · Rider: {label(r.accountability_status)}
                  </div>
                  <div style={{ color: colour, fontSize: 11, fontWeight: 800 }}>
                    {label(r.recovery_status)} · {assigned ? `Assigned ${assigned.unit_code}` : "Not assigned"}
                  </div>
                </div>
                <span style={styles.status}>{label(r.priority)}</span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

/* ------------------------------------------------------------
   SMALL COMPONENTS
   ------------------------------------------------------------ */

function Card({ title, value, alert = false }: { title: string; value: string; alert?: boolean }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={{ ...styles.cardValue, color: alert ? "#d53434" : "#17212b" }}>{value}</div>
    </div>
  );
}

function Legend({ colour, text }: { colour: string; text: string }) {
  return (
    <span style={styles.legendItem}>
      <span style={{ width: 18, height: 7, borderRadius: 10, background: colour }} />
      {text}
    </span>
  );
}

/* ------------------------------------------------------------
   STYLES
   ------------------------------------------------------------ */

const styles: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#eef2f5", padding: 24, fontFamily: "Arial, Helvetica, sans-serif", color: "#17212b" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18 },
  eyebrow: { color: "#1769aa", fontSize: 11, fontWeight: 800, letterSpacing: 1.3 },
  title: { margin: "5px 0", fontSize: 34 },
  subtitle: { color: "#667582", fontSize: 18, fontWeight: 600 },
  live: { display: "inline-flex", gap: 7, alignItems: "center", padding: "7px 12px", background: "#fff", border: "1px solid #cfdae2", borderRadius: 20, fontSize: 12, fontWeight: 800 },
  liveDot: { width: 9, height: 9, borderRadius: "50%" },
  small: { color: "#6b7883", fontSize: 11, marginTop: 4 },
  button: { marginTop: 6, padding: "6px 10px", border: "1px solid #b8c8d8", borderRadius: 8, background: "#f7fafc", cursor: "pointer", fontSize: 12 },
  errorBox: { marginBottom: 14, padding: 12, border: "1px solid #efd193", borderRadius: 10, background: "#fff7e4", color: "#704b00", fontSize: 13 },
  summary: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 18 },
  card: { background: "#fff", border: "1px solid #d5dee5", borderRadius: 12, padding: 16 },
  cardTitle: { color: "#6b7883", fontSize: 10, fontWeight: 800 },
  cardValue: { marginTop: 8, fontSize: 20, fontWeight: 800 },
  panel: { background: "#fff", border: "1px solid #d5dee5", borderRadius: 15, padding: 18, boxShadow: "0 7px 22px rgba(20,40,60,0.05)" },
  panelTitle: { margin: "4px 0 8px" },
  note: { margin: "0 0 12px", color: "#75828c", fontSize: 12 },
  empty: { padding: 18, color: "#6b7883", fontSize: 13 },
  scrollArea: { overflowX: "auto", border: "1px solid #e1e7eb", borderRadius: 12, background: "#f9fbfc" },
  trackArea: { position: "relative", minWidth: 1500, height: 440 },
  inner: { position: "absolute", left: 80, right: 80, top: 0, bottom: 0 },
  segment: { position: "absolute", top: 236, height: 8, borderRadius: 10 },
  segmentLabel: { position: "absolute", top: 30, left: "50%", transform: "translateX(-50%)", color: "#778590", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" },
  checkpoint: { position: "absolute", top: 226, width: 60, marginLeft: -30, textAlign: "center", zIndex: 2 },
  dot: { width: 22, height: 22, margin: "0 auto", background: "#1b2c3a", border: "4px solid #fff", borderRadius: "50%", boxShadow: "0 0 0 2px #52616f" },
  cpText: { display: "block", marginTop: 6, fontSize: 10 },
  unit: { position: "absolute", transform: "translateX(-50%)", minWidth: 110, padding: "6px 9px", background: "#fff", border: "2px solid", borderRadius: 10, textAlign: "center", boxShadow: "0 5px 14px rgba(20,40,60,0.14)", zIndex: 5, fontSize: 13 },
  unitBadge: { padding: "2px 5px", borderRadius: 4, color: "#fff", fontSize: 9, fontWeight: 900 },
  recovery: { position: "absolute", transform: "translateX(-50%)", display: "flex", gap: 8, alignItems: "center", minWidth: 150, padding: 8, background: "#fff", border: "2px solid", borderRadius: 10, boxShadow: "0 5px 14px rgba(20,40,60,0.12)", zIndex: 4 },
  warning: { display: "grid", placeItems: "center", width: 26, height: 26, flexShrink: 0, borderRadius: "50%", color: "#fff", fontWeight: 900 },
  legend: { display: "flex", flexWrap: "wrap", gap: 18, marginTop: 12, color: "#65737e", fontSize: 11 },
  legendItem: { display: "flex", alignItems: "center", gap: 6 },
  lowerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginTop: 18 },
  row: { display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderTop: "1px solid #e4e9ed" },
  unitBox: { display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 8, background: "#eef2f7", fontSize: 11, fontWeight: 900 },
  status: { padding: "5px 8px", background: "#eef2f7", color: "#3b4b59", borderRadius: 12, fontSize: 9, fontWeight: 800, whiteSpace: "nowrap" },
};
// END OF FILE
