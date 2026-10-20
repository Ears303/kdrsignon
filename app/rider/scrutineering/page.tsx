"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./scrutineering.module.css";

// ------------------------------------------------------------------
// LANDING PAGE TEXT - edit the wording here.
// ------------------------------------------------------------------
const INTRO_TITLE = "Technical Self-Scrutineering";

const INTRO_TEXT =
  "All items below are to be completed prior to the closing date for this form to be accepted. Missing or incomplete items will see your machine needing to be presented to the Scrutineer for inspection.";

const NOTES_TITLE = "NOTE:";

const NOTES: string[] = [
  "Random scrutineering will be conducted on machines and rider safety gear across all classes throughout the event.",
  "Incomplete forms will not be accepted. Please check your email for notification of any errors.",
  "One scrutineering sheet must be completed per machine.",
  "For juniors, both the rider and parent or guardian must sign this form for it to be considered complete.",
  "Please ensure you provide your correct MA Competition Licence Number, now known as your RidernetID. This is a 6 digit number.",
];

// Links shown under the notes
const MA_RULES_URL = "https://www.ma.org.au/licences-rules/rules/";
const MOMS_URL =
  "https://drive.google.com/file/d/1Gz-T_HGwlGmNXAv9k3MtjVjAAoAi599i/view?usp=sharing";

const BEFORE_YOU_START_TITLE = "Before you start, have ready:";

const BEFORE_YOU_START: string[] = [
  "Your RidernetID (6 digits)",
  "Your machine's VIN",
  "A 2 litre water container or CamelBak-type hydration system",
  "Body armour which complies",
];

type Entrant = {
  id: string;
  eventId: string;
  riderName: string;
  competitionNumber: string;
  className: string | null;
  vehicleDescription: string | null;
  registrationNumber: string | null;
};

type Item = {
  id: string;
  code: string;
  section: string;
  item_name: string;
  requirement: string | null;
  display_order: number;
  is_required: boolean;
};

type Result = "pass" | "fail" | "na";
type Answer = { result?: Result; comment: string };

// Items that are highlighted and must be PASS to submit
const MUST_PASS: Record<string, string> = {
  HYDRATION: "You must have a 2 litre water container or CamelBak-type system to ride.",
  BODY_ARMOUR: "You must have body armour which complies to ride.",
};

export default function ScrutineeringPage() {
  const [ridernetId, setRidernetId] = useState("");
  const [entrant, setEntrant] = useState<Entrant | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [vin, setVin] = useState("");
  const [isJunior, setIsJunior] = useState(false);
  const [riderName, setRiderName] = useState("");
  const [parentName, setParentName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/rider/scrutineering/checklist")
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        setItems(j.checklist ?? []);
      })
      .catch(() => setError("Checklist could not be loaded."));
  }, []);

  const sections = useMemo(
    () => Array.from(new Set(items.map((i) => i.section))),
    [items]
  );

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/rider/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ridernetId }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error);
        return;
      }
           const first = j.entrants?.[0];
      if (!first) {
        setError("Entry not found. Check your RidernetID and try again.");
        return;
      }
      setEntrant(first);
      setRiderName(first.riderName ?? "");
    } catch {
      setError("Unable to check the entry.");
    } finally {
      setBusy(false);
    }
  }

  function setResult(id: string, result: Result) {
    setAnswers((a) => ({ ...a, [id]: { result, comment: a[id]?.comment ?? "" } }));
  }

  function setComment(id: string, comment: string) {
    setAnswers((a) => ({ ...a, [id]: { result: a[id]?.result, comment } }));
  }

  function startAgain() {
    setRidernetId("");
    setEntrant(null);
    setAnswers({});
    setVin("");
    setIsJunior(false);
    setRiderName("");
    setParentName("");
    setAccepted(false);
    setError("");
    setDone(false);
    window.scrollTo(0, 0);
  }

  function closeForm() {
    window.close();
    // Phones usually block close(), so fall back to the home page
    setTimeout(() => {
      window.location.href = "/";
    }, 300);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!entrant) return;

    if (!vin.trim()) {
      setError("Please enter the VIN.");
      document.getElementById("vin-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const missing = items.find((i) => i.is_required && !answers[i.id]?.result);
    if (missing) {
      setError(`Please complete: ${missing.item_name}`);
      document.getElementById(missing.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    for (const item of items) {
      const message = MUST_PASS[item.code];
      if (message && answers[item.id]?.result !== "pass") {
        setError(message);
        document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }

    if (!accepted) return setError("Please accept the declaration.");
    if (!riderName.trim()) return setError("Please enter the rider printed name.");
    if (isJunior && !parentName.trim()) return setError("Please enter the parent or guardian name.");

    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/rider/scrutineering/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ridernetId,
          entrantId: entrant.id,
          vin: vin.trim(),
          isJunior,
          declarationAccepted: accepted,
          riderPrintedName: riderName,
          parentGuardianPrintedName: parentName,
          answers: items.map((i) => ({
            checklistId: i.id,
            result: answers[i.id]?.result,
            comment: answers[i.id]?.comment ?? "",
          })),
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error);
        return;
      }
      setDone(true);
      window.scrollTo(0, 0);
    } catch {
      setError("Submission failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className={styles.page}>
        <section className={styles.success}>
          <div className={styles.tick}>✓</div>
          <h1>Submission received</h1>
          <p>
            {entrant?.riderName} — #{entrant?.competitionNumber}
          </p>
          <p>Your technical self-scrutineering has been recorded.</p>

          <div className={styles.doneButtons}>
            <button type="button" className={styles.primary} onClick={startAgain}>
              Submit another form
            </button>
            <button type="button" className={styles.secondary} onClick={closeForm}>
              Close
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <img
  src="/logo.png"
  alt="Event logo"
  style={{ display: "block", maxWidth: "220px", width: "100%", height: "auto", margin: "0 auto 16px" }}
/>
        <h1>Technical Self-Scrutineering</h1>

        {!entrant && (
          <section
            style={{
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: "12px",
              padding: "18px 20px",
              margin: "16px 0",
              color: "#1e3a8a",
              lineHeight: 1.5,
            }}
          >
            <h2 style={{ margin: "0 0 10px", fontSize: "19px" }}>{INTRO_TITLE}</h2>

            <p style={{ margin: "8px 0" }}>{INTRO_TEXT}</p>

            <p style={{ margin: "14px 0 6px", fontWeight: 700 }}>{NOTES_TITLE}</p>
            <ol style={{ margin: 0, paddingLeft: "22px" }}>
              {NOTES.map((line, i) => (
                <li key={i} style={{ margin: "6px 0" }}>
                  {line}
                </li>
              ))}
            </ol>

            <p style={{ margin: "14px 0 4px" }}>
              Motorcycling Australia Rules can be reviewed at the link below:
            </p>
            <p style={{ margin: "0 0 10px", wordBreak: "break-all" }}>
              <a
                href={MA_RULES_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline" }}
              >
                {MA_RULES_URL}
              </a>
            </p>

            <p style={{ margin: "10px 0" }}>
              Manual of Motorcycle Sport (MOMS):{" "}
              <a
                href={MOMS_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#1d4ed8", fontWeight: 700, textDecoration: "underline" }}
              >
                Open the MOMS
              </a>
            </p>

            {BEFORE_YOU_START.length > 0 && (
              <>
                <p style={{ margin: "14px 0 6px", fontWeight: 700 }}>{BEFORE_YOU_START_TITLE}</p>
                <ul style={{ margin: 0, paddingLeft: "22px" }}>
                  {BEFORE_YOU_START.map((line, i) => (
                    <li key={i} style={{ margin: "4px 0" }}>
                      {line}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {entrant && <p>Complete one form for each machine.</p>}

        {error && <div className={styles.error}>{error}</div>}

        {!entrant ? (
          <form className={styles.card} onSubmit={lookup}>
            <h2>Find your entry</h2>
            <label>RidernetID</label>
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              title="Your RidernetID is a 6 digit number"
              value={ridernetId}
              onChange={(e) => setRidernetId(e.target.value.trim())}
            />
            <button className={styles.primary} disabled={busy}>
              {busy ? "Checking..." : "Find my entry"}
            </button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <section className={styles.card}>
              <h2>Entry confirmed</h2>
              <p><b>Rider:</b> {entrant.riderName}</p>
              <p><b>Competition #:</b> {entrant.competitionNumber}</p>
              <p><b>Class:</b> {entrant.className || "—"}</p>
              <p><b>Machine:</b> {entrant.vehicleDescription || "—"}</p>
              {entrant.registrationNumber && (
                <p><b>Registration:</b> {entrant.registrationNumber}</p>
              )}
              <button type="button" className={styles.secondary} onClick={() => setEntrant(null)}>
                Not me — go back
              </button>
            </section>

            <section className={styles.card} id="vin-box">
              <h2>Machine VIN</h2>
              <label>
                VIN <span className={styles.req}>*</span>
              </label>
              <input
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={40}
              />
            </section>

            {sections.map((section) => (
              <section className={styles.card} key={section}>
                <h2>{section}</h2>
                {items
                  .filter((i) => i.section === section)
                  .map((i) => (
                    <div
                      id={i.id}
                      key={i.id}
                      className={MUST_PASS[i.code] ? styles.hydration : styles.item}
                    >
                      <h3>
                        {i.item_name}
                        {i.is_required && <span className={styles.req}> *</span>}
                      </h3>
                      {i.requirement && <p>{i.requirement}</p>}
                      <div className={styles.choices}>
                        {(["pass", "fail", "na"] as const).map((v) => (
                          <button
                            type="button"
                            key={v}
                            className={answers[i.id]?.result === v ? styles[v] : ""}
                            onClick={() => setResult(i.id, v)}
                          >
                            {v === "na" ? "N/A" : v.toUpperCase()}
                          </button>
                        ))}
                      </div>
                      <textarea
                        placeholder="Comment if required"
                        value={answers[i.id]?.comment ?? ""}
                        onChange={(e) => setComment(i.id, e.target.value)}
                      />
                    </div>
                  ))}
              </section>
            ))}

            <section className={styles.card}>
              <h2>Declaration</h2>
              <p>
                I acknowledge the importance of my protective clothing, equipment and machine
                being in good condition and fit for the purpose of taking part in this event, and
                that I alone am responsible for them being and remaining fit for purpose
                throughout the event.
              </p>
              <label className={styles.check}>
                <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
                I accept the declaration *
              </label>
              <label>Rider printed name *</label>
              <input value={riderName} onChange={(e) => setRiderName(e.target.value)} />
              <label className={styles.check}>
                <input type="checkbox" checked={isJunior} onChange={(e) => setIsJunior(e.target.checked)} />
                Junior rider
              </label>
              {isJunior && (
                <>
                  <label>Parent / guardian printed name *</label>
                  <input value={parentName} onChange={(e) => setParentName(e.target.value)} />
                </>
              )}
            </section>

            <button className={styles.submit} disabled={busy}>
              {busy ? "Submitting..." : "Submit self-scrutineering"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
