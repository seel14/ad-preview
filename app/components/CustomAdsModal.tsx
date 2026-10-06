"use client";

import { useState } from "react";
import { toThumbDataUrl } from "@/lib/imageUtil";

export interface CustomAd {
  id: string;
  name: string;
  image: string; // small JPEG data URL
  caption?: string;
  headline?: string;
  link?: string;
  createdAt: number;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export default function CustomAdsModal({ ads, onChange, onClose }: {
  ads: CustomAd[]; onChange: (next: CustomAd[]) => void; onClose: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ src: string; name: string }[]>([]);
  const [caption, setCaption] = useState("");
  const [headline, setHeadline] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setEditingId(null); setPending([]); setCaption(""); setHeadline(""); setLink(""); };
  const inputStyle = { fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", width: "100%" } as const;
  const canSave = pending.length > 0 && pending.every(p => p.name.trim());

  async function pickFiles(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    try {
      const added: { src: string; name: string }[] = [];
      for (const f of files) added.push({ src: await toThumbDataUrl(f, 720), name: f.name.replace(/\.[^.]+$/, "") });
      if (editingId) setPending(added.slice(0, 1));
      else setPending(prev => [...prev, ...added]);
    } catch {
      alert("อ่านไฟล์รูปไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (!canSave) return;
    const extra = { caption: caption.trim() || undefined, headline: headline.trim() || undefined, link: link.trim() || undefined };
    if (editingId) {
      const p = pending[0];
      onChange(ads.map(a => a.id === editingId ? { ...a, name: p.name.trim(), image: p.src, ...extra } : a));
    } else {
      onChange([...ads, ...pending.map(p => ({ id: uid(), name: p.name.trim(), image: p.src, ...extra, createdAt: Date.now() }))]);
    }
    reset();
  }

  function startEdit(a: CustomAd) {
    setEditingId(a.id);
    setPending([{ src: a.image, name: a.name }]);
    setCaption(a.caption ?? "");
    setHeadline(a.headline ?? "");
    setLink(a.link ?? "");
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 640, maxWidth: "94vw", maxHeight: "90vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 14, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Ads เพิ่มเอง</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>สำหรับช่องทางที่ยังดึงจาก API ไม่ได้ เช่น Google, TikTok, LINE — อัปโหลดรูปและตั้งชื่อเอง</div>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="cursor-pointer" style={{ fontSize: 16, lineHeight: 1, padding: "3px 9px", borderRadius: 8, border: "none", background: "#f1f5f9", color: "#64748b", alignSelf: "flex-start" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{editingId ? "แก้ไข Ad" : "เพิ่ม Ad ใหม่"}</div>

            {pending.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0", flexShrink: 0 }} />
                <input value={p.name} onChange={e => setPending(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  placeholder="ชื่อ Ad" style={inputStyle} />
                {!editingId && <button onClick={() => setPending(prev => prev.filter((_, j) => j !== i))} className="cursor-pointer" style={{ color: "#94a3b8", fontSize: 16, background: "none", border: "none" }}>×</button>}
              </div>
            ))}

            <label className="cursor-pointer" style={{ fontSize: 12, fontWeight: 600, color: "#2563eb" }}>
              {busy ? "กำลังประมวลผลรูป..." : pending.length ? (editingId ? "+ เปลี่ยนรูป" : "+ เพิ่มรูปอีก") : "+ เลือกรูป (เลือกได้หลายรูป ระบบจะสร้าง 1 Ad ต่อ 1 รูป)"}
              <input type="file" accept="image/*" multiple={!editingId} disabled={busy} style={{ display: "none" }}
                onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ""; void pickFiles(f); }} />
            </label>

            <input value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Headline (ไม่บังคับ)" style={inputStyle} />
            <textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="Caption / Primary text (ไม่บังคับ)" rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            <input value={link} onChange={e => setLink(e.target.value)} placeholder="ลิงก์ Preview / ลิงก์ Ad (ไม่บังคับ — จะแสดงใต้รูปตอน Export)" style={inputStyle} />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {(editingId || pending.length > 0) && <button onClick={reset} className="cursor-pointer" style={{ fontSize: 12, color: "#64748b", background: "none", border: "none", padding: "6px 10px" }}>ยกเลิก</button>}
              <button onClick={save} disabled={!canSave} className="cursor-pointer font-semibold"
                style={{ fontSize: 12, color: "#fff", background: canSave ? "#2563eb" : "#94a3b8", border: "none", borderRadius: 8, padding: "7px 18px" }}>
                {editingId ? "บันทึก" : `เพิ่ม ${pending.length > 1 ? `${pending.length} Ads` : "Ad"}`}
              </button>
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.6, textTransform: "uppercase", margin: "16px 0 8px" }}>Ads ที่เพิ่มไว้ ({ads.length})</div>
          {ads.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: 16 }}>ยังไม่มี Ad ที่เพิ่มเอง</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {ads.map(a => (
              <div key={a.id} style={{ border: editingId === a.id ? "2px solid #2563eb" : "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.image} alt="" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block", background: "#f1f5f9" }} />
                <div style={{ padding: "6px 8px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#0f172a", wordBreak: "break-word", lineHeight: 1.3 }}>{a.name}</div>
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <button onClick={() => startEdit(a)} className="cursor-pointer" style={{ fontSize: 10, color: "#2563eb", background: "none", border: "none", padding: 0 }}>แก้ไข</button>
                    <button onClick={() => { if (confirm(`ลบ "${a.name}"?`)) onChange(ads.filter(x => x.id !== a.id)); }} className="cursor-pointer" style={{ fontSize: 10, color: "#dc2626", background: "none", border: "none", padding: 0 }}>ลบ</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
