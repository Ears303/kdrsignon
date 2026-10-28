// FILE LOCATION IN GITHUB: app/course-track/page.tsx
// Self-contained demo course track. No imports, no CSS file, no Supabase yet.

import type { CSSProperties } from "react";

const checkpoints = [
  "START",
  "CP1",
  "CP2",
  "CP3",
  "CP4",
  "CP5",
  "CP6",
  "CP7",
  "CP8",
  "CP9",
  "CP10",
  "CP11",
];

const units = [
  { code: "SW1", label: "Sweep Rider", position: "CP1 → CP2", left: "14%", top: 30, colour: "#7446aa" },
  { code: "SW2", label: "Sweep Rider", position: "CP2 → CP3", left: "24%", top: 30, colour: "#7446aa" },
  { code: "CC1", label: "Course Car", position: "CP2 → CP4", left: "32%", top: 110, colour: "#1769aa" },
];

const recoveries = [
  { number: "47", type: "BIKE", location: "CP3", status: "Recovery Required", left: "27%", colour: "#d53434" },
  { number: "118", type: "BIKE", location: "CP6", status: "Assigned", left: "53%", colour: "#d88900" },
];

function checkpointColour(index: number) {
  if (index < 3) return "#16834a";
  if (index === 3) return "#e39b12";
  return "#aeb9c2";
}

function segmentColour(index: number) {
  if (index < 2) return "#16834a";
  if (index === 2) return "#e39b12";
  return "#cbd4da";
}

function segmentText(index: number) {
  if (index < 2) return "CLEARED";
  if (index === 2) return "SWEEPING";
  return "PENDING";
}

export default function CourseTrackPage() {
  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>COURSE OPERATIONS</div>
          <h1 style={styles.title}>KDR 2026</h1>
          <div style={styles.subtitle}>Final Bike Sweep</div>
        </div>

        <div style={styles.live}>
          <span style={styles.liveDot} />
          DEMO
        </div>
      </header>

      <section style={styles.summary}>
        <Card title="ACTIVE PHASE" value="Final Bike Sweep" />
        <Card title="SECTIONS CLEARED" value="3 / 11" />
        <Card title="OPEN RECOVERIES" value={String(recoveries.length)} alert />
        <Card title="ACTIVE UNITS" value={String(units.length)} />
      </section>

      <section style={styles.panel}>
        <div style={styles.eyebrow}>POSITION BOARD</div>
        <h2 style={styles.panelTitle}>Course Track</h2>
        <p style={styles.note}>
          Course unit positions are operational locations, not GPS positions.
        </p>

        <div style={styles.scrollArea}>
          <div style={styles.trackArea}>
            {units.map((unit) => (
              <div
                key={unit.code}
                style={{
                  ...styles.unit,
                  left: unit.left,
                  top: unit.top,
                  borderColor: unit.colour,
                }}
              >
                <div style={{ ...styles.unitBadge, background: unit.colour }}>
                  {unit.code.startsWith("SW") ? "SW" : "CC"}
                </div>
                <div style={{ fontWeight: 900 }}>{unit.code}</div>
                <div style={{ color: unit.colour, fontSize: 10, fontWeight: 700 }}>
                  {unit.position}
                </div>
              </div>
            ))}

            <div style={styles.trackLine}>
              {checkpoints.map((checkpoint, index) => (
                <div
                  key={checkpoint}
                  style={{
                    ...styles.checkpointGroup,
                    flex: index === checkpoints.length - 1 ? "0 0 62px" : "1 1 0",
                  }}
                >
                  <div style={styles.checkpoint}>
                    <div style={{ ...styles.dot, background: checkpointColour(index) }} />
                    <strong style={styles.cpText}>{checkpoint}</strong>
                  </div>

                  {index < checkpoints.length - 1 && (
                    <div style={{ ...styles.segment, background: segmentColour(index) }}>
                      <span style={styles.segmentLabel}>{segmentText(index)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {recoveries.map((item) => (
              <div
                key={item.number}
                style={{ ...styles.recovery, left: item.left, borderColor: item.colour }}
              >
                <div style={{ ...styles.warning, background: item.colour }}>!</div>
                <div>
                  <div style={{ fontWeight: 900 }}>
                    #{item.number} {item.type}
                  </div>
                  <div style={styles.rowSub}>{item.location}</div>
                  <div style={{ color: item.colour, fontSize: 10, fontWeight: 800 }}>
                    {item.status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.legend}>
          <Legend colour="#16834a" text="Cleared" />
          <Legend colour="#e39b12" text="In progress" />
          <Legend colour="#d53434" text="Recovery / issue" />
          <Legend colour="#cbd4da" text="Pending" />
        </div>
      </section>

      <section style={styles.lowerGrid}>
        <div style={styles.panel}>
          <div style={styles.eyebrow}>FIELD RESOURCES</div>
          <h2 style={styles.panelTitle}>Course Units</h2>

          {units.map((unit) => (
            <div key={unit.code} style={styles.row}>
              <div style={styles.unitBox}>{unit.code.startsWith("SW") ? "SW" : "CC"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}>{unit.code}</div>
                <div style={styles.rowSub}>
                  {unit.label} · {unit.position}
                </div>
              </div>
              <span style={styles.status}>IN TRANSIT</span>
            </div>
          ))}
        </div>

        <div style={styles.panel}>
          <div style={{ ...styles.eyebrow, color: "#d53434" }}>EXCEPTIONS</div>
          <h2 style={styles.panelTitle}>Open Recovery Items</h2>

          {recoveries.map((item) => (
            <div key={item.number} style={styles.row}>
              <div style={{ width: 7, height: 44, borderRadius: 5, background: item.colour }} />
              <div>
                <div style={{ fontWeight: 800 }}>
                  #{item.number} {item.type}
                </div>
                <div style={styles.rowSub}>{item.location}</div>
                <div style={{ color: item.colour, fontSize: 10, fontWeight: 800 }}>
                  {item.status}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

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

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#eef2f5",
    padding: 24,
    fontFamily: "Arial, Helvetica, sans-serif",
    color: "#17212b",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  eyebrow: {
    color: "#1769aa",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1.3,
  },
  title: {
    margin: "5px 0",
    fontSize: 38,
  },
  subtitle: {
    color: "#667582",
    fontSize: 18,
    fontWeight: 600,
  },
  live: {
    display: "flex",
    gap: 7,
    alignItems: "center",
    padding: "8px 13px",
    background: "#ffffff",
    border: "1px solid #cfdae2",
    borderRadius: 20,
    color: "#138447",
    fontSize: 12,
    fontWeight: 800,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: "50%",
    background: "#16a05d",
  },
  summary: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 18,
    overflowX: "auto",
  },
  card: {
    background: "#ffffff",
    border: "1px solid #d5dee5",
    borderRadius: 12,
    padding: 16,
  },
  cardTitle: {
    color: "#6b7883",
    fontSize: 10,
    fontWeight: 800,
  },
  cardValue: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: 800,
  },
  panel: {
    background: "#ffffff",
    border: "1px solid #d5dee5",
    borderRadius: 15,
    padding: 18,
    boxShadow: "0 7px 22px rgba(20,40,60,0.05)",
  },
  panelTitle: {
    margin: "4px 0 8px",
  },
  note: {
    margin: "0 0 14px",
    color: "#75828c",
    fontSize: 12,
  },
  scrollArea: {
    overflowX: "auto",
    border: "1px solid #e1e7eb",
    borderRadius: 12,
    background: "#f9fbfc",
  },
  trackArea: {
    position: "relative",
    minWidth: 1650,
    height: 430,
  },
  unit: {
    position: "absolute",
    transform: "translateX(-50%)",
    minWidth: 125,
    padding: 9,
    background: "#ffffff",
    border: "2px solid",
    borderRadius: 10,
    textAlign: "center",
    boxShadow: "0 6px 15px rgba(20,40,60,0.14)",
    zIndex: 5,
  },
  unitBadge: {
    display: "inline-block",
    padding: "3px 6px",
    marginBottom: 3,
    borderRadius: 5,
    color: "#ffffff",
    fontSize: 9,
    fontWeight: 900,
  },
  trackLine: {
    position: "absolute",
    left: 45,
    right: 45,
    top: 235,
    display: "flex",
    alignItems: "flex-start",
  },
  checkpointGroup: {
    display: "flex",
    alignItems: "flex-start",
  },
  checkpoint: {
    width: 62,
    flexShrink: 0,
    textAlign: "center",
    position: "relative",
    zIndex: 2,
  },
  dot: {
    width: 23,
    height: 23,
    margin: "0 auto",
    border: "4px solid white",
    borderRadius: "50%",
    boxShadow: "0 0 0 2px #52616f",
  },
  cpText: {
    display: "block",
    marginTop: 9,
    fontSize: 10,
  },
  segment: {
    position: "relative",
    flex: 1,
    height: 8,
    marginTop: 8,
    marginLeft: -18,
    marginRight: -18,
    borderRadius: 10,
  },
  segmentLabel: {
    position: "absolute",
    top: 17,
    left: "50%",
    transform: "translateX(-50%)",
    color: "#778590",
    fontSize: 9,
    fontWeight: 700,
    whiteSpace: "nowrap",
  },
  recovery: {
    position: "absolute",
    top: 320,
    transform: "translateX(-50%)",
    display: "flex",
    gap: 8,
    alignItems: "center",
    minWidth: 175,
    padding: 9,
    background: "#ffffff",
    border: "2px solid",
    borderRadius: 10,
    boxShadow: "0 5px 14px rgba(20,40,60,0.12)",
  },
  warning: {
    display: "grid",
    placeItems: "center",
    width: 28,
    height: 28,
    flexShrink: 0,
    borderRadius: "50%",
    color: "white",
    fontWeight: 900,
  },
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 18,
    marginTop: 14,
    color: "#65737e",
    fontSize: 11,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  lowerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: 16,
    marginTop: 18,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "11px 0",
    borderTop: "1px solid #e4e9ed",
  },
  unitBox: {
    display: "grid",
    placeItems: "center",
    width: 38,
    height: 38,
    borderRadius: 8,
    background: "#eaf2f9",
    color: "#1769aa",
    fontSize: 10,
    fontWeight: 900,
  },
  rowSub: {
    color: "#687681",
    fontSize: 11,
  },
  status: {
    padding: "5px 8px",
    background: "#fff0c8",
    color: "#795000",
    borderRadius: 12,
    fontSize: 9,
    fontWeight: 800,
  },
};
// END OF FILE
