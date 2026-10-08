"use client";

import { useEffect, useMemo, useState } from "react";
import type { StructureNode } from "./AdsStructure";

interface Account { id: string; name: string }
interface Campaign { id: string; name: string; status: string; objective: string }

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  ACTIVE: { bg: "#dcfce7", fg: "#166534" },
  PAUSED: { bg: "#fef3c7", fg: "#92400e" },
};

export default function FbStructureImportModal({ accounts, accountId, onAccountChange, connectionId, onImport, onClose }: {
  accounts: Account[];
  accountId: string;
  onAccountChange: (id: string) => void;
  connectionId: string;
  onImport: (nodes: StructureNode[], mode: "merge" | "replace") => void;
  onClose: () => void;
}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accountId) { setCampaigns([]); return; }
    setLoading(true); setError(""); setSelected(new Set());
    fetch("/api/facebook/structure", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "campaigns", accountId, ...(connectionId ? { connectionId } : {}) }),
    })
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d?.error ?? "โหลดรายการ Campaign ไม่สำเร็จ"); return d as Campaign[]; })
      .then(setCampaigns)
      .catch(e => setError(e instanceof Error ? e.message : "โหลดรายการ Campaign ไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [accountId, connectionId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return campaigns.filter(c => (!activeOnly || c.status === "ACTIVE") && (!q || c.name.toLowerCase().includes(q) || c.id.includes(q)));
  }, [campaigns, query, activeOnly]);
  const allVisibleOn = visible.length > 0 && visible.every(c => selected.has(c.id));

  async function doImport() {
    setImporting(true); setError("");
    try {
      const r = await fetch("/api/facebook/structure", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "structure", accountId, campaignIds: [...selected], ...(connectionId ? { connectionId } : {}) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "ดึง Structure ไม่สำเร็จ");
      onImport(d as StructureNode[], mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ดึง Structure ไม่สำเร็จ");
      setImporting(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 640, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 14, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>นำเข้า Structure จาก Facebook</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>เลือก Campaign แล้วระบบจะดึงชื่อ Campaign, Ad Set, Ad (และงบ) มาสร้างเป็น Ads Structure ให้</div>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="cursor-pointer" style={{ fontSize: 16, lineHeight: 1, padding: "3px 9px", borderRadius: 8, border: "none", background: "#f1f5f9", color: "#64748b", alignSelf: "flex-start" }}>✕</button>
        </div>

        <div style={{ padding: "12px 20px 0", display: "flex", flexDirection: "column", gap: 8 }}>
          <select value={accountId} onChange={e => onAccountChange(e.target.value)}
            style={{ fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", background: "#fff" }}>
            <option value="">เลือก Ad Account...</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาชื่อ Campaign / ID"
              style={{ flex: 1, minWidth: 180, fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 10px" }} />
            <label style={{ fontSize: 11, color: "#475569", display: "flex", gap: 4, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} /> เฉพาะ Active
            </label>
            <button disabled={visible.length === 0} className="cursor-pointer" style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none" }}
              onClick={() => setSelected(prev => { const n = new Set(prev); visible.forEach(c => allVisibleOn ? n.delete(c.id) : n.add(c.id)); return n; })}>
              {allVisibleOn ? "ยกเลิกที่เห็น" : `เลือกทั้งหมดที่เห็น (${visible.length})`}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 160, overflowY: "auto", padding: "8px 20px" }}>
          {loading && <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 24 }}>กำลังโหลด Campaign...</div>}
          {!loading && !accountId && <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 24 }}>เลือก Ad Account ก่อน</div>}
          {!loading && accountId && visible.length === 0 && !error && <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 24 }}>ไม่พบ Campaign</div>}
          {visible.map(c => {
            const st = STATUS_COLOR[c.status] ?? { bg: "#e2e8f0", fg: "#475569" };
            return (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderBottom: "1px solid #f8fafc", cursor: "pointer", background: selected.has(c.id) ? "#f0f7ff" : "#fff", borderRadius: 6 }}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => setSelected(prev => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#0f172a", wordBreak: "break-word" }}>{c.name}</span>
                  {c.objective && <span style={{ display: "block", fontSize: 10, color: "#94a3b8" }}>{c.objective}</span>}
                </span>
                {c.status && <span style={{ background: st.bg, color: st.fg, fontSize: 9, fontWeight: 800, padding: "1px 8px", borderRadius: 9999 }}>{c.status}</span>}
              </label>
            );
          })}
          {error && <div style={{ fontSize: 12, color: "#991b1b", background: "#fee2e2", borderRadius: 8, padding: "8px 12px", marginTop: 8 }}>{error}</div>}
        </div>

        <div style={{ padding: "12px 20px 16px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", borderRadius: "0 0 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: "#475569" }}>
            <label style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
              <input type="radio" checked={mode === "merge"} onChange={() => setMode("merge")} /> เพิ่ม/อัปเดตเข้ากับ Facebook Ads เดิม
            </label>
            <label style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
              <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> แทนที่ Facebook Ads ทั้งหมด
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={onClose} className="cursor-pointer" style={{ fontSize: 12, color: "#64748b", background: "none", border: "none", padding: "6px 10px" }}>ยกเลิก</button>
            <button onClick={doImport} disabled={selected.size === 0 || importing} className="cursor-pointer font-semibold"
              style={{ fontSize: 12, color: "#fff", background: selected.size === 0 || importing ? "#94a3b8" : "#16a34a", border: "none", borderRadius: 8, padding: "7px 18px" }}>
              {importing ? "กำลังดึง Structure..." : `นำเข้า ${selected.size || ""} Campaign`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
