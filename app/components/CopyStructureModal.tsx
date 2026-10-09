"use client";

import { useState } from "react";
import type { StructureNode } from "./AdsStructure";

interface ProjectLite { id: string; name: string; structure?: StructureNode[] }

const count = (nodes: StructureNode[]): { campaigns: number; adsets: number; ads: number } => {
  let campaigns = 0, adsets = 0, ads = 0;
  const walk = (list: StructureNode[]) => list.forEach(n => {
    if (n.type === "campaign") campaigns++; else if (n.type === "adset") adsets++; else if (n.type === "ad") ads++;
    walk(n.children ?? []);
  });
  walk(nodes);
  return { campaigns, adsets, ads };
};

export default function CopyStructureModal({ currentName, currentStructure, activePlatformId, others, onCopyTo, onCopyFrom, onClose }: {
  currentName: string;
  currentStructure: StructureNode[];
  activePlatformId: string;
  others: ProjectLite[];
  onCopyTo: (targetId: string, platforms: StructureNode[], mode: "append" | "replace") => Promise<void>;
  onCopyFrom: (platforms: StructureNode[], mode: "append" | "replace") => Promise<void>;
  onClose: () => void;
}) {
  const [direction, setDirection] = useState<"to" | "from">("to");
  const [otherId, setOtherId] = useState(others[0]?.id ?? "");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [picked, setPicked] = useState<Set<string>>(new Set(activePlatformId ? [activePlatformId] : currentStructure.map(p => p.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const other = others.find(p => p.id === otherId);
  const source = direction === "to" ? currentStructure : other?.structure ?? [];
  // switching direction/project changes which tabs can be picked
  const pickable = source.filter(p => picked.has(p.id));

  function switchDirection(d: "to" | "from") {
    setDirection(d);
    setPicked(new Set(d === "to" ? (activePlatformId ? [activePlatformId] : currentStructure.map(p => p.id)) : (others.find(p => p.id === otherId)?.structure ?? []).map(p => p.id)));
  }
  function switchOther(id: string) {
    setOtherId(id);
    if (direction === "from") setPicked(new Set((others.find(p => p.id === id)?.structure ?? []).map(p => p.id)));
  }

  async function run() {
    setBusy(true); setError("");
    try {
      if (direction === "to") await onCopyTo(otherId, pickable, mode);
      else await onCopyFrom(pickable, mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "คัดลอกไม่สำเร็จ");
      setBusy(false);
    }
  }

  const seg = (on: boolean) => ({ fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8, cursor: "pointer", border: on ? "1.5px solid #2563eb" : "1.5px solid #e2e8f0", background: on ? "#eff6ff" : "#fff", color: on ? "#1e40af" : "#64748b" }) as const;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 14, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>คัดลอก Ads Structure ข้าม Project</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>ทำสำเนา ไม่กระทบต้นฉบับ (กล่อง Campaign, Ad Set, Ad, งบ, Keyword, Context Hint และรูปย่อ)</div>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="cursor-pointer" style={{ fontSize: 16, lineHeight: 1, padding: "3px 9px", borderRadius: 8, border: "none", background: "#f1f5f9", color: "#64748b", alignSelf: "flex-start" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => switchDirection("to")} style={seg(direction === "to")}>ส่งจาก "{currentName}" ไป Project อื่น</button>
            <button onClick={() => switchDirection("from")} style={seg(direction === "from")}>ดึงจาก Project อื่นมาที่นี่</button>
          </div>

          {others.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94a3b8", padding: 16, textAlign: "center" }}>ยังไม่มี Project อื่น</div>
          ) : (
            <>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>{direction === "to" ? "Project ปลายทาง" : "Project ต้นทาง"}
                <select value={otherId} onChange={e => switchOther(e.target.value)} style={{ display: "block", width: "100%", marginTop: 4, fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", background: "#fff" }}>
                  {others.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>เลือกแท็บ (Platform) ที่จะคัดลอก</div>
                {source.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8" }}>{direction === "from" ? "Project นี้ยังไม่มี Ads Structure" : "ยังไม่มี Ads Structure ให้คัดลอก"}</div>}
                {source.map((p, i) => {
                  const c = count(p.children ?? []);
                  return (
                    <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 6, cursor: "pointer", background: picked.has(p.id) ? "#f0f7ff" : "#fff" }}>
                      <input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>แท็บที่ {i + 1}: {p.name}</span>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>{c.campaigns} Campaign · {c.adsets} Ad Set · {c.ads} Ad</span>
                    </label>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#475569" }}>
                <label style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" checked={mode === "append"} onChange={() => setMode("append")} /> เพิ่มเป็นแท็บใหม่ (ไม่แตะของเดิม)
                </label>
                <label style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> แทนที่ Structure ทั้งหมดของ{direction === "to" ? "ปลายทาง" : "Project นี้"}
                </label>
              </div>
              {mode === "replace" && (
                <div style={{ fontSize: 11, color: "#991b1b", background: "#fee2e2", borderRadius: 8, padding: "6px 10px" }}>
                  ระวัง: Ads Structure เดิมของ{direction === "to" ? ` "${other?.name ?? ""}"` : " Project นี้"} จะถูกลบและแทนที่ด้วยสำเนา
                </div>
              )}
              {error && <div style={{ fontSize: 12, color: "#991b1b", background: "#fee2e2", borderRadius: 8, padding: "8px 12px" }}>{error}</div>}
            </>
          )}
        </div>

        <div style={{ padding: "12px 20px 16px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", borderRadius: "0 0 14px 14px", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} className="cursor-pointer" style={{ fontSize: 12, color: "#64748b", background: "none", border: "none", padding: "6px 10px" }}>ยกเลิก</button>
          <button onClick={run} disabled={busy || pickable.length === 0 || !otherId} className="cursor-pointer font-semibold"
            style={{ fontSize: 12, color: "#fff", background: busy || pickable.length === 0 ? "#94a3b8" : "#2563eb", border: "none", borderRadius: 8, padding: "7px 18px" }}>
            {busy ? "กำลังคัดลอก..." : `คัดลอก ${pickable.length || ""} แท็บ`}
          </button>
        </div>
      </div>
    </div>
  );
}
