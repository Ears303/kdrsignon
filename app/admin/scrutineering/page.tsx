"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./review.module.css";

type Row = {
  id: string;
  submittedAt: string;
  riderName: string;
  competitionNumber: string;
  className: string | null;
  vehicleDescription: string | null;
  status: string;
  isJunior: boolean;
  passCount: number;
  failCount: number;
  naCount: number;
};

type Check = {
  result: "pass" | "fail" | "na";
  comment: string | null;
  itemName: string;
  section: string;
  requirement: string | null;
  code: string;
};

const STATUS_LABEL: Record<string, string> = {
  submitted: "Submitted",
  requires_review: "Requires review",
  accepted: "Accepted",
  rejected: "Rejected",
};

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ScrutineeringReviewPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [notes, setNotes] = useState("");

  async function loadList() {
    setError("");
    const r = await fetch("/api/admin/scrutineering", { cache: "no-store" });
    if (r.status === 401) {
      setSignedIn(false);
      return;
    }
    const j = await r.json();
    if (!r.ok) {
      setError(j.error);
      setSignedIn(true);
      return;
    }
    setRows(j.submissions);
    setSignedIn(true);
  }

  useEffect(() => {
    loadList();
  }, []);

  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch("/api/admin/scrutineering/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      setError(j.error);
      return;
    }
    setPassword("");
    loadList();
  }

  async function logout() {
    await fetch("/api/admin/scrutineering/logout", { method: "POST" });
    setSignedIn(false);
    setRows([]);
    setSelectedId(null);
  }

  async function openDetail(id: string) {
    setSelectedId(id);
    setDetail(null);
    setChecks([]);
    setError("");
    const r = await fetch(`/api/admin/scrutineering/${id}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) {
      setError(j.error);
      return;
    }
    setDetail(j.submission);
    setChecks(j.checks);
    setNotes(j.submission.review_notes ?? "");
    window.scrollTo(0, 0);
  }

  async function setStatus(status: string) {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    const r = await fetch(`/api/admin/scrutineering/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reviewNotes: notes }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) {
      setError(j.error);
      return;
    }
    setDetail((d: any) => ({ ...d, status, review_notes: notes }));
    loadList();
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    rows.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (!s ||
          r.riderName?.toLowerCase().includes(s) ||
          String(r.competitionNumber).toLowerCase().includes(s))
    );
  }, [rows, filter, search]);

  // ---------- LOADING ----------
  if (signedIn === null) {
    return <main className={styles.page}><p>Loading…</p></main>;
  }

  // ---------- LOGIN ----------
  if (!signedIn) {
    return (
      <main className={styles.page}>
        <form className={styles.loginCard} onSubmit={login}>
          <h1>Scrutineering Review</h1>
          <p>Officials only</p>
          {error && <div className={styles.error}>{error}</div>}
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <button className={styles.primary} disabled={busy}>
            {busy ? "Checking…" : "Sign in"}
          </button>
        </form>
      </main>
    );
  }

  // ---------- DETAIL ----------
  if (selectedId) {
    const sections = Array.from(new Set(checks.map((c) => c.section)));
    return (
      <main className={styles.page}>
        <div className={styles.wrap}>
          <button className={styles.back} onClick={() => setSelectedId(null)}>
            ← Back to list
          </button>

          {error && <div className={styles.error}>{error}</div>}
          {!detail ? (
            <p>Loading…</p>
          ) : (
            <>
              <section className={styles.card}>
                <div className={styles.detailHead}>
                  <h1>
                    #{detail.competition_number} {detail.rider_name}
                  </h1>
                  <span className={`${styles.badge} ${styles[detail.status]}`}>
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </span>
                </div>
                <p><b>Class:</b> {detail.class_name || "—"}</p>
                <p><b>Machine:</b> {detail.vehicle_description || "—"}</p>
                {detail.registration_number && (
                  <p><b>Registration:</b> {detail.registration_number}</p>
                )}
                <p><b>Submitted:</b> {fmt(detail.submitted_at)}</p>
                <p><b>Rider signed:</b> {detail.rider_printed_name} ({fmt(detail.rider_signed_at)})</p>
                {detail.is_junior && (
                  <p>
                    <b>Junior — parent/guardian:</b> {detail.parent_guardian_printed_name || "MISSING"}
                  </p>
                )}
              </section>

              {sections.map((section) => (
                <section className={styles.card} key={section}>
                  <h2>{section}</h2>
                  {checks
                    .filter((c) => c.section === section)
                    .map((c, i) => (
                      <div
                        key={i}
                        className={`${styles.checkRow} ${
                          c.result === "fail" ? styles.failRow : ""
                        }`}
                      >
                        <div>
                          <div className={styles.checkName}>{c.itemName}</div>
                          {c.comment && (
                            <div className={styles.comment}>💬 {c.comment}</div>
                          )}
                        </div>
                        <span className={`${styles.result} ${styles["r_" + c.result]}`}>
                          {c.result === "na" ? "N/A" : c.result.toUpperCase()}
                        </span>
                      </div>
                    ))}
                </section>
              ))}

              <section className={styles.card}>
                <h2>Official review</h2>
                <label>Review notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Rear brake rechecked at sign-on – OK"
                />
                <div className={styles.actions}>
                  <button className={styles.accept} disabled={busy} onClick={() => setStatus("accepted")}>
                    ✓ Accept
                  </button>
                  <button className={styles.review} disabled={busy} onClick={() => setStatus("requires_review")}>
                    ! Requires review
                  </button>
                  <button className={styles.reject} disabled={busy} onClick={() => setStatus("rejected")}>
                    ✕ Reject
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    );
  }

  // ---------- LIST ----------
  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.topBar}>
          <h1>Scrutineering Review</h1>
          <div>
            <button className={styles.secondary} onClick={loadList}>Refresh</button>{" "}
            <button className={styles.secondary} onClick={logout}>Sign out</button>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.tabs}>
          {["all", "requires_review", "submitted", "accepted", "rejected"].map((s) => (
            <button
              key={s}
              className={filter === s ? styles.tabOn : styles.tab}
              onClick={() => setFilter(s)}
            >
              {s === "all" ? "All" : STATUS_LABEL[s]} ({counts[s] ?? 0})
            </button>
          ))}
        </div>

        <input
          className={styles.search}
          placeholder="Search name or number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {shown.length === 0 ? (
          <p className={styles.empty}>No submissions.</p>
        ) : (
          shown.map((r) => (
            <button key={r.id} className={styles.rowCard} onClick={() => openDetail(r.id)}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}>
                  #{r.competitionNumber} {r.riderName}
                  {r.isJunior && <span className={styles.junior}>JUNIOR</span>}
                </div>
                <div className={styles.rowSub}>
                  {r.className || "—"} · {r.vehicleDescription || "—"} · {fmt(r.submittedAt)}
                </div>
                <div className={styles.rowSub}>
                  ✓ {r.passCount} &nbsp; ✕ {r.failCount} &nbsp; N/A {r.naCount}
                </div>
              </div>
              <span className={`${styles.badge} ${styles[r.status]}`}>
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
            </button>
          ))
        )}
      </div>
    </main>
  );
}
