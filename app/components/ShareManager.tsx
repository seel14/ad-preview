"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ShareChange {
  area: "structure" | "ad";
  action: "added" | "removed" | "renamed" | "updated" | "moved";
  path: string;
  field?: string;
  from?: string;
  to?: string;
}
interface ShareSummary {
  token: string;
  projectId: string;
  projectName: string;
  scope: "both" | "preview" | "structure" | "none";
  includeTarget: boolean;
  includeTimeline: boolean;
  createdAt: number;
  updatedAt: number;
  status: "idle" | "pending";
  clientName: string;
  changes: ShareChange[];
}

const scopeLabel = (scope: string, target: boolean, timeline: boolean) => {
  const parts = [
    ...(scope === "both" || scope === "preview" ? ["Ad Preview"] : []),
    ...(scope === "both" || scope === "structure" ? ["Ad Structure"] : []),
    ...(target ? ["Target"] : []),
    ...(timeline ? ["Timeline"] : []),
  ];
  return parts.join(" + ") || "-";
};
const ACTION_STYLE: Record<ShareChange["action"], { label: string; bg: string; fg: string }> = {
  added: { label: "เพิ่ม", bg: "#dcfce7", fg: "#166534" },
  removed: { label: "ลบ", bg: "#fee2e2", fg: "#991b1b" },
  renamed: { label: "เปลี่ยนชื่อ", bg: "#fef9c3", fg: "#854d0e" },
  updated: { label: "แก้ไข", bg: "#dbeafe", fg: "#1e40af" },
  moved: { label: "ย้าย", bg: "#ede9fe", fg: "#5b21b6" },
};

type Seg = { t: "eq" | "add" | "del"; v: string };

// Character-level diff (Thai has no word spaces), with tiny coincidental matches folded into the change.
function diffText(a: string, b: string): Seg[] {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const A = a.slice(pre, a.length - suf);
  const B = b.slice(pre, b.length - suf);
  const segs: Seg[] = [];
  if (pre) segs.push({ t: "eq", v: a.slice(0, pre) });

  if (A.length * B.length > 6_000_000) {
    if (A) segs.push({ t: "del", v: A });
    if (B) segs.push({ t: "add", v: B });
  } else {
    const n = A.length, m = B.length, w = m + 1;
    const dp = new Uint16Array((n + 1) * w);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = A[i] === B[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
    const ops: Seg[] = [];
    const push = (t: Seg["t"], c: string) => { const l = ops[ops.length - 1]; if (l && l.t === t) l.v += c; else ops.push({ t, v: c }); };
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { push("eq", A[i]); i++; j++; }
      else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) { push("del", A[i]); i++; }
      else { push("add", B[j]); j++; }
    }
    while (i < n) push("del", A[i++]);
    while (j < m) push("add", B[j++]);
    // fold short equal runs sandwiched between changes into del+add so the highlight reads as one edit
    const out: Seg[] = [];
    for (let k = 0; k < ops.length; k++) {
      const o = ops[k];
      if (o.t === "eq" && o.v.length < 3 && k > 0 && k < ops.length - 1) { out.push({ t: "del", v: o.v }, { t: "add", v: o.v }); }
      else out.push(o);
    }
    // regroup: within each run of non-eq segments, put all deletions first then additions
    let buf: Seg[] = [];
    const flush = () => {
      if (!buf.length) return;
      const d = buf.filter(x => x.t === "del").map(x => x.v).join("");
      const ad = buf.filter(x => x.t === "add").map(x => x.v).join("");
      if (d) segs.push({ t: "del", v: d });
      if (ad) segs.push({ t: "add", v: ad });
      buf = [];
    };
    for (const o of out) { if (o.t === "eq") { flush(); segs.push(o); } else buf.push(o); }
    flush();
  }
  if (suf) segs.push({ t: "eq", v: a.slice(a.length - suf) });
  return segs;
}

function TextDiff({ from, to }: { from: string; to: string }) {
  const [mode, setMode] = useState<"diff" | "new">("diff");
  const [copied, setCopied] = useState(false);
  const segs = mode === "diff" ? diffText(from, to) : [];
  const box: React.CSSProperties = { whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12, lineHeight: 1.6, color: "#1e293b", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", marginTop: 4, maxHeight: 320, overflowY: "auto" };
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        {(["diff", "new"] as const).map(m => (
          <button key={m} onClick={() => setMode(m)} className="cursor-pointer"
            style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 9999, border: mode === m ? "1.5px solid #2563eb" : "1.5px solid #e2e8f0", background: mode === m ? "#eff6ff" : "#fff", color: mode === m ? "#1e40af" : "#64748b" }}>
            {m === "diff" ? "เทียบการแก้ไข" : "ข้อความใหม่"}
          </button>
        ))}
        <button onClick={async () => { await navigator.clipboard.writeText(to).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="cursor-pointer" style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 9999, border: "1.5px solid #e2e8f0", background: "#fff", color: "#2563eb", marginLeft: "auto" }}>
          {copied ? "คัดลอกแล้ว" : "คัดลอกข้อความใหม่"}
        </button>
      </div>
      {mode === "diff" && (
        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
          <span style={{ background: "#bbf7d0", color: "#14532d", padding: "0 4px", borderRadius: 3 }}>เพิ่ม</span>{" "}
          <span style={{ background: "#fecaca", color: "#7f1d1d", padding: "0 4px", borderRadius: 3, textDecoration: "line-through" }}>ลบ</span>
        </div>
      )}
      <div style={box}>
        {mode === "new" ? (to || "(ว่าง)") : segs.map((g, i) =>
          g.t === "eq" ? <span key={i}>{g.v}</span>
          : g.t === "add" ? <span key={i} style={{ background: "#bbf7d0", color: "#14532d", borderRadius: 3 }}>{g.v}</span>
          : <span key={i} style={{ background: "#fecaca", color: "#7f1d1d", textDecoration: "line-through", borderRadius: 3 }}>{g.v}</span>
        )}
      </div>
    </div>
  );
}

function ChangeLine({ c }: { c: ShareChange }) {
  const st = ACTION_STYLE[c.action];
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#334155", padding: "5px 0" }}>
      <span style={{ background: st.bg, color: st.fg, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 9999, flexShrink: 0, marginTop: 1 }}>{st.label}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{c.path}{c.field ? ` · ${c.field}` : ""}</div>
        {c.area === "ad" && c.action === "updated" ? (
          <TextDiff from={c.from ?? ""} to={c.to ?? ""} />
        ) : (c.action === "renamed" || c.action === "updated" || c.action === "moved") && (
          <div style={{ color: "#64748b", wordBreak: "break-word" }}>
            <span style={{ textDecoration: "line-through" }}>{c.from || "(ว่าง)"}</span> → <b style={{ color: "#0f172a" }}>{c.to || "(ว่าง)"}</b>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ShareManager({ project, ads, structure, targets, timelineCount, onApplied }: {
  timelineCount: number;
  project: { id: string; name: string } | null;
  ads: unknown[];
  structure: unknown[];
  targets: unknown[];
  onApplied: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [partPreview, setPartPreview] = useState(true);
  const [partStructure, setPartStructure] = useState(true);
  const [partTarget, setPartTarget] = useState(false);
  const [partTimeline, setPartTimeline] = useState(false);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [copied, setCopied] = useState("");
  const seen = useRef<Map<string, number> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/shares");
      if (!r.ok) return;
      const list: ShareSummary[] = await r.json();
      setShares(list);
      const prev = seen.current;
      const next = new Map<string, number>();
      for (const s of list) if (s.status === "pending") next.set(s.token, s.updatedAt);
      if (prev) {
        const fresh = list.filter(s => s.status === "pending" && (prev.get(s.token) ?? 0) < s.updatedAt);
        if (fresh.length) {
          const s = fresh[0];
          setToast(`ลูกค้า${s.clientName ? ` (${s.clientName})` : ""}แก้ไข "${s.projectName}" — ${s.changes.length} รายการ`);
          setTimeout(() => setToast(""), 12000);
        }
      }
      seen.current = next;
    } catch { /* offline — try again next tick */ }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  const pendingCount = shares.filter(s => s.status === "pending").length;
  const urlFor = (token: string) => `${window.location.origin}/share/${token}`;

  async function create() {
    if (!project) return;
    setBusy("create");
    try {
      const r = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          scope: partPreview && partStructure ? "both" : partPreview ? "preview" : partStructure ? "structure" : "none",
          includeTarget: partTarget,
          includeTimeline: partTimeline,
          ads,
          targets: partTarget ? targets : undefined,
        }),
      });
      if (!r.ok) throw new Error();
      const { token } = await r.json();
      await navigator.clipboard.writeText(urlFor(token)).catch(() => {});
      setCopied(token);
      await refresh();
    } catch {
      alert("สร้างลิงก์ไม่สำเร็จ");
    } finally {
      setBusy("");
    }
  }

  async function act(token: string, action: "accept" | "dismiss") {
    if (action === "accept" && !confirm("นำการแก้ไขของลูกค้าไปใช้กับ Project จริง?")) return;
    setBusy(token);
    await fetch(`/api/shares/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (action === "accept") await onApplied();
    await refresh();
    setBusy("");
  }

  async function revoke(token: string) {
    if (!confirm("ยกเลิกลิงก์นี้? ลูกค้าจะเปิดลิงก์เดิมไม่ได้อีก")) return;
    setBusy(token);
    await fetch(`/api/shares/${token}`, { method: "DELETE" });
    await refresh();
    setBusy("");
  }

  const mine = shares.filter(s => s.projectId === project?.id);
  const others = shares.filter(s => s.projectId !== project?.id && s.status === "pending");

  const card = (s: ShareSummary) => (
    <div key={s.token} style={{ border: s.status === "pending" ? "1.5px solid #f59e0b" : "1px solid #e2e8f0", background: s.status === "pending" ? "#fffbeb" : "#fff", borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{s.projectName} <span style={{ fontWeight: 500, color: "#64748b" }}>· {scopeLabel(s.scope, s.includeTarget, s.includeTimeline)}</span></div>
          <div style={{ fontSize: 10, color: "#94a3b8" }}>สร้าง {new Date(s.createdAt).toLocaleString("th-TH")}{s.clientName ? ` · แก้ไขโดย ${s.clientName}` : ""}</div>
        </div>
        {s.status === "pending" && <span style={{ background: "#f59e0b", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 9999, flexShrink: 0 }}>รอตรวจสอบ</span>}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input readOnly value={urlFor(s.token)} onFocus={e => e.currentTarget.select()}
          style={{ flex: 1, minWidth: 0, fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 8px", background: "#f8fafc", color: "#475569" }} />
        <button onClick={async () => { await navigator.clipboard.writeText(urlFor(s.token)).catch(() => {}); setCopied(s.token); setTimeout(() => setCopied(""), 2000); }}
          className="cursor-pointer" style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", color: "#2563eb" }}>
          {copied === s.token ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
        <button onClick={() => revoke(s.token)} disabled={busy === s.token} className="cursor-pointer" style={{ fontSize: 11, padding: "5px 10px", borderRadius: 6, border: "1px solid #fecaca", background: "#fff", color: "#dc2626" }}>ยกเลิกลิงก์</button>
      </div>
      {s.status === "pending" && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 2 }}>ลูกค้าแก้ไข {s.changes.length} รายการ · {new Date(s.updatedAt).toLocaleString("th-TH")}</div>
          {(["ad", "structure"] as const).map(area => {
            const list = s.changes.filter(c => c.area === area);
            if (!list.length) return null;
            return (
              <div key={area} style={{ marginTop: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{area === "ad" ? "Ad Preview" : "Ad Structure"}</div>
                {list.map((c, i) => <ChangeLine key={i} c={c} />)}
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => act(s.token, "accept")} disabled={busy === s.token} className="cursor-pointer font-semibold" style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff" }}>นำไปใช้</button>
            <button onClick={() => act(s.token, "dismiss")} disabled={busy === s.token} className="cursor-pointer" style={{ fontSize: 12, padding: "6px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b" }}>ไม่นำไปใช้</button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer whitespace-nowrap flex-shrink-0"
        style={{ color: "#1e40af", background: "#eff6ff", border: "1px solid #bfdbfe", position: "relative" }}
        title="ส่งลิงก์ให้ลูกค้าดู/แก้ไข">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
        แชร์ลูกค้า
        {pendingCount > 0 && (
          <span style={{ position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, borderRadius: 9, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{pendingCount}</span>
        )}
      </button>

      {toast && (
        <div onClick={() => { setOpen(true); setToast(""); }}
          style={{ position: "fixed", right: 20, bottom: 20, zIndex: 120, maxWidth: 340, background: "#0f172a", color: "#fff", fontSize: 13, padding: "12px 16px", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.3)", cursor: "pointer" }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>มีการแก้ไขจากลูกค้า</div>
          {toast}
          <div style={{ fontSize: 11, color: "#93c5fd", marginTop: 4 }}>คลิกเพื่อดูรายละเอียด</div>
        </div>
      )}

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: "94vw", maxHeight: "88vh", overflowY: "auto", background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>แชร์ให้ลูกค้า</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 14 }}>ลูกค้าเปิดลิงก์ได้โดยไม่ต้องล็อกอิน แก้ไขแล้วกดบันทึก จะแจ้งเตือนที่นี่ และยังไม่กระทบข้อมูลจริงจนกว่าคุณจะกด "นำไปใช้"</div>

            {project ? (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 8 }}>สร้างลิงก์ใหม่สำหรับ "{project.name}"</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                  {([
                    ["Ad Preview", partPreview, setPartPreview, "แก้ข้อความได้"],
                    ["Ad Structure", partStructure, setPartStructure, "แก้ไขได้"],
                    ["Target", partTarget, setPartTarget, "ดูอย่างเดียว"],
                    ["Timeline", partTimeline, setPartTimeline, "ดูอย่างเดียว"],
                  ] as const).map(([label, on, set, note]) => (
                    <button key={label} onClick={() => set(!on)} className="cursor-pointer"
                      style={{ fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 8, border: on ? "1.5px solid #2563eb" : "1.5px solid #e2e8f0", background: on ? "#eff6ff" : "#fff", color: on ? "#1e40af" : "#64748b" }}>
                      {on ? "✓ " : ""}{label} <span style={{ fontWeight: 500, opacity: 0.7 }}>({note})</span>
                    </button>
                  ))}
                </div>
                {partPreview && ads.length === 0 && <div style={{ fontSize: 11, color: "#b45309", marginBottom: 8 }}>ยังไม่ได้โหลด Ads — โหลดที่แท็บ Ad Preview ก่อน ลูกค้าจะได้เห็นโฆษณา</div>}
                {partStructure && structure.length === 0 && <div style={{ fontSize: 11, color: "#b45309", marginBottom: 8 }}>Project นี้ยังไม่มี Ad Structure</div>}
                {partTimeline && timelineCount === 0 && <div style={{ fontSize: 11, color: "#b45309", marginBottom: 8 }}>ยังไม่มีเหตุการณ์ใน Timeline</div>}
                {partTarget && targets.length === 0 && <div style={{ fontSize: 11, color: "#b45309", marginBottom: 8 }}>ยังไม่ได้ดึง Target — ไปที่แท็บ Target ก่อน</div>}
                <button onClick={create} disabled={busy === "create" || (!partPreview && !partStructure && !partTarget && !partTimeline)} className="cursor-pointer font-semibold"
                  style={{ fontSize: 12, padding: "7px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff" }}>
                  {busy === "create" ? "กำลังสร้าง..." : "สร้างลิงก์และคัดลอก"}
                </button>
                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>ลิงก์จะเก็บข้อมูล ณ ตอนนี้ไว้ (snapshot) ถ้าแก้ Structure/โหลด Ads ใหม่ทีหลัง ให้สร้างลิงก์ใหม่</div>
              </div>
            ) : <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>เลือก Project ก่อนสร้างลิงก์</div>}

            {others.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>การแก้ไขใน Project อื่น</div>
                {others.map(card)}
              </>
            )}
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 6 }}>ลิงก์ของ Project นี้ ({mine.length})</div>
            {mine.length === 0 ? <div style={{ fontSize: 12, color: "#94a3b8" }}>ยังไม่มีลิงก์</div> : mine.map(card)}

            <div style={{ textAlign: "right", marginTop: 8 }}>
              <button onClick={() => setOpen(false)} className="cursor-pointer" style={{ fontSize: 12, padding: "7px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b" }}>ปิด</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
