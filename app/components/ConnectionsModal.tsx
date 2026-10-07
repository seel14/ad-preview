"use client";

import { useState } from "react";

export interface ConnectionInfo { id: string; name: string; last4: string; identity: string; createdAt: number; updatedAt: number }

export default function ConnectionsModal({ connections, onChange, onClose, usage }: {
  connections: ConnectionInfo[];
  onChange: (next: ConnectionInfo[]) => void;
  onClose: () => void;
  usage: Record<string, string[]>; // connection id → project names using it
}) {
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editToken, setEditToken] = useState("");
  const [editName, setEditName] = useState("");

  const input = { fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", width: "100%" } as const;

  async function add() {
    setBusy("add"); setError("");
    try {
      const r = await fetch("/api/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, token }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "บันทึกไม่สำเร็จ");
      onChange([...connections, d]);
      setName(""); setToken("");
    } catch (e) { setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(""); }
  }

  async function saveEdit(id: string) {
    setBusy(id); setError("");
    try {
      const r = await fetch(`/api/connections/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editName, token: editToken || undefined }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? "บันทึกไม่สำเร็จ");
      onChange(connections.map(c => c.id === id ? d : c));
      setEditing(null); setEditToken("");
    } catch (e) { setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(""); }
  }

  async function remove(c: ConnectionInfo) {
    const used = usage[c.id] ?? [];
    if (!confirm(`ลบ Connection "${c.name}"?${used.length ? `\n\nมี ${used.length} Project ใช้อยู่ (${used.slice(0, 5).join(", ")}) Project เหล่านั้นจะโหลดข้อมูลไม่ได้จนกว่าจะเลือก Connection ใหม่` : ""}`)) return;
    setBusy(c.id);
    await fetch(`/api/connections/${c.id}`, { method: "DELETE" });
    onChange(connections.filter(x => x.id !== c.id));
    setBusy("");
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 660, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 14, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Connections</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>เก็บ Facebook Token (เช่น System User ของแต่ละ Business Manager) ไว้ที่เดียว แล้วให้แต่ละ Project เลือกใช้ — Token ถูกเข้ารหัสไว้ที่เซิร์ฟเวอร์ ไม่แสดงในหน้าเว็บ</div>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="cursor-pointer" style={{ fontSize: 16, lineHeight: 1, padding: "3px 9px", borderRadius: 8, border: "none", background: "#f1f5f9", color: "#64748b", alignSelf: "flex-start" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          {connections.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 16 }}>ยังไม่มี Connection</div>}
          {connections.map(c => {
            const used = usage[c.id] ?? [];
            const isEditing = editing === c.id;
            return (
              <div key={c.id} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                {isEditing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="ชื่อ Connection" style={input} />
                    <input value={editToken} onChange={e => setEditToken(e.target.value)} type="password" placeholder="Token ใหม่ (เว้นว่างถ้าไม่เปลี่ยน)" style={input} />
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => { setEditing(null); setEditToken(""); setError(""); }} className="cursor-pointer" style={{ fontSize: 12, color: "#64748b", background: "none", border: "none" }}>ยกเลิก</button>
                      <button onClick={() => saveEdit(c.id)} disabled={busy === c.id} className="cursor-pointer font-semibold" style={{ fontSize: 12, color: "#fff", background: "#2563eb", border: "none", borderRadius: 8, padding: "6px 16px" }}>{busy === c.id ? "กำลังตรวจ Token..." : "บันทึก"}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{c.identity} · Token ••••{c.last4}</div>
                      <div style={{ fontSize: 10, color: used.length ? "#2563eb" : "#94a3b8", marginTop: 3 }}>
                        {used.length ? `ใช้อยู่ ${used.length} Project: ${used.slice(0, 4).join(", ")}${used.length > 4 ? "…" : ""}` : "ยังไม่มี Project ใช้"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => { setEditing(c.id); setEditName(c.name); setEditToken(""); setError(""); }} className="cursor-pointer" style={{ fontSize: 11, color: "#2563eb", background: "none", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 10px" }}>แก้ไข / เปลี่ยน Token</button>
                      <button onClick={() => remove(c)} disabled={busy === c.id} className="cursor-pointer" style={{ fontSize: 11, color: "#dc2626", background: "none", border: "1px solid #fecaca", borderRadius: 6, padding: "3px 10px" }}>ลบ</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {error && <div style={{ fontSize: 12, color: "#991b1b", background: "#fee2e2", borderRadius: 8, padding: "8px 12px", marginTop: 4 }}>{error}</div>}
        </div>

        <div style={{ padding: "12px 20px 16px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", borderRadius: "0 0 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.6, textTransform: "uppercase" }}>เพิ่ม Connection</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อ เช่น BM Agency, BM แบรนด์ A" style={input} />
          <div style={{ position: "relative" }}>
            <input value={token} onChange={e => setToken(e.target.value)} type={show ? "text" : "password"} placeholder="Facebook Access Token (System User token)" style={{ ...input, paddingRight: 60 }} />
            <button onClick={() => setShow(s => !s)} type="button" className="cursor-pointer" style={{ position: "absolute", right: 8, top: 7, fontSize: 11, color: "#64748b", background: "none", border: "none" }}>{show ? "ซ่อน" : "แสดง"}</button>
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.5 }}>
            สร้าง Token: Business Settings → Users → System users → เลือก System User → Add Assets (ผูกบัญชีโฆษณา) → Generate token (เลือกแอป และสิทธิ์ <b>ads_read</b>)
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button onClick={add} disabled={!name.trim() || !token.trim() || busy === "add"} className="cursor-pointer font-semibold"
              style={{ fontSize: 12, color: "#fff", background: !name.trim() || !token.trim() || busy === "add" ? "#94a3b8" : "#2563eb", border: "none", borderRadius: 8, padding: "7px 18px" }}>
              {busy === "add" ? "กำลังตรวจ Token..." : "ตรวจสอบและบันทึก"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
