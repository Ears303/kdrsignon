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

export default function CourseTrackPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#eef2f5",
        padding: "24px",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#17212b",
      }}
    >
      {/* HEADER */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "20px",
          marginBottom: "20px",
        }}
      >
        <div>
          <div
            style={{
              color: "#1769aa",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "1.4px",
            }}
          >
            COURSE OPERATIONS
          </div>

          <h1
            style={{
              margin: "5px 0",
              fontSize: "38px",
            }}
          >
            KDR 2026
          </h1>

          <div
            style={{
              color: "#667582",
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            Final Bike Sweep
          </div>
        </div>

        <div
          style={{
            textAlign: "right",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              padding: "8px 13px",
              background: "#ffffff",
              border: "1px solid #cfdae2",
              borderRadius: "20px",
              color: "#138447",
              fontSize: "12px",
              fontWeight: 800,
            }}
          >
            <span
              style={{
                width: "9px",
                height: "9px",
                borderRadius: "50%",
                background: "#16a05d",
              }}
            />
            DEMO
          </div>

          <div
            style={{
              marginTop: "5px",
              color: "#78858f",
              fontSize: "11px",
            }}
          >
            Visual layout only
          </div>
        </div>
      </header>

      {/* SUMMARY */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(150px, 1fr))",
          gap: "12px",
          marginBottom: "18px",
          overflowX: "auto",
        }}
      >
        <SummaryCard title="ACTIVE PHASE" value="Final Bike Sweep" />
        <SummaryCard title="SECTIONS CLEARED" value="3 / 11" />
        <SummaryCard title="OPEN RECOVERIES" value="2" red />
        <SummaryCard title="ACTIVE UNITS" value="3" />
      </section>

      {/* COURSE TRACK CARD */}
      <section
        style={{
          background: "#ffffff",
          border: "1px solid #d5dee5",
          borderRadius: "16px",
          boxShadow: "0 8px 25px rgba(20,40,60,0.06)",
          padding: "20px",
        }}
      >
        <div
          style={{
            color: "#1769aa",
            fontSize: "11px",
            fontWeight: 800,
            letterSpacing: "1.3px",
          }}
        >
          LIVE POSITION BOARD
        </div>

        <h2
          style={{
            margin: "4px 0 5px",
          }}
        >
          Course Track
        </h2>

        <p
          style={{
            margin: "0 0 15px",
            color: "#75828c",
            fontSize: 
