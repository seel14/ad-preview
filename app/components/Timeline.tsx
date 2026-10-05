"use client";

import { useState } from "react";

export interface TimelineImage { src: string; name?: string; adId?: string }

export interface TimelineEntry {
  id: string;
  date: string; // "YYYY-MM-DD"
  channel?: string; // e.g. "Facebook", "Google", "TikTok"
  title: string;
  description?: string;
  campaign?: string; // campaign name picked from Ads Structure
  images?: TimelineImage[]; // ad creatives shown on the card (Facebook / TikTok)
  details?: Record<string, string>; // channel-specific fields, e.g. { Objective: "...", Target: "..." }
  createdAt: number;
}

const CHANNEL_PRESETS = ["Facebook", "Google", "TikTok", "LINE", "Other"];
const CHANNEL_COLORS: Record<string, { bg: string; text: string }> = {
  Facebook: { bg: "#e7f0fe", text: "#1877F2" },
  Google: { bg: "#fce8e6", text: "#ea4335" },
  TikTok: { bg: "#e8e8e8", text: "#000000" },
  LINE: { bg: "#e6f7e6", text: "#06c755" },
};
function channelColor(channel: string) {
  return CHANNEL_COLORS[channel] ?? { bg: "#f1f5f9", text: "#475569" };
}

// Small brand marks shown next to the channel badge on the timeline itself.
function ChannelIcon({ channel, size = 12 }: { channel: string; size?: number }) {
  if (channel === "Facebook") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="#1877F2" style={{ flexShrink: 0 }}>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    );
  }
  if (channel === "Google") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    );
  }
  if (channel === "TikTok") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="#000" style={{ flexShrink: 0 }}>
        <path d="M16.5 2h-3v13.2a2.8 2.8 0 11-2-2.68V9.4a5.9 5.9 0 105 5.85V8.2a6.9 6.9 0 004 1.28V6.4a3.9 3.9 0 01-4-3.9V2z" />
      </svg>
    );
  }
  if (channel === "LINE") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="#06c755" style={{ flexShrink: 0 }}>
        <path d="M12 2C6.48 2 2 5.69 2 10.24c0 4.09 3.6 7.52 8.46 8.16.33.07.78.22.89.5.1.26.07.66.03.92l-.14.87c-.04.26-.2 1 .87.55s5.77-3.4 7.87-5.83C21.4 13.62 22 12 22 10.24 22 5.69 17.52 2 12 2z" />
      </svg>
    );
  }
  return null;
}

// Which detail fields to show per channel, in order — customize here as new needs come up.
const CHANNEL_FIELDS: Record<string, string[]> = {
  Facebook: ["Target", "Budget", "Objective", "Ads"],
  Google: ["Budget", "Bidding", "Keyword", "Text Ads"],
  TikTok: ["Target", "Budget", "Objective", "Ads"],
  LINE: ["Target", "Budget", "Objective", "Ads"],
};
function fieldsForChannel(channel: string): string[] {
  return CHANNEL_FIELDS[channel] ?? [];
}

function DetailsList({ details, campaign, channel, align = "left" }: { details?: Record<string, string>; campaign?: string; channel?: string; align?: "left" | "center" }) {
  const entries = Object.entries(details ?? {}).filter(([, v]) => v);
  if (!entries.length && !campaign) return null;
  const color = channelColor(channel ?? "");
  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2, alignItems: align === "center" ? "center" : "stretch" }}>
      {campaign && (
        <div style={{ marginBottom: 2 }}>
          <span style={{ display: "inline-block", fontSize: 12, fontWeight: 800, padding: "2px 10px", borderRadius: 6, background: color.bg, color: color.text, lineHeight: 1.5 }}>
            {campaign}
          </span>
        </div>
      )}
      {entries.map(([k, v]) => (
        <div key={k} style={{ fontSize: 11, color: "#475569" }}>
          <span style={{ fontWeight: 600 }}>{k}:</span> {v}
        </div>
      ))}
    </div>
  );
}

const IMAGE_CHANNELS = ["Facebook", "TikTok"];

// Shrinks an image (file or remote URL, fetched through the same-origin proxy) to a small JPEG data URL so it
// can be stored with the event and never expires like Facebook CDN links do.
async function toThumbDataUrl(source: File | string, maxSide = 360): Promise<string> {
  const blob = typeof source === "string"
    ? await (await fetch(`/api/proxy?url=${encodeURIComponent(source)}`)).blob()
    : source;
  const bitmap = await createImageBitmap(blob);
  const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function ImageStrip({ images, align }: { images?: TimelineImage[]; align: "left" | "center" }) {
  if (!images?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, justifyContent: align === "center" ? "center" : "flex-start" }}>
      {images.map((im, i) => (
        <div key={i} style={{ width: 76 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={im.src} alt={im.name ?? ""} style={{ width: 76, height: 76, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0", display: "block", background: "#f1f5f9" }} />
          {im.name && <div style={{ fontSize: 9, color: "#64748b", marginTop: 2, lineHeight: 1.25, textAlign: "center", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-all" }}>{im.name}</div>}
        </div>
      ))}
    </div>
  );
}

function groupByChannel(entries: TimelineEntry[]): { channel: string; entries: TimelineEntry[] }[] {
  const groups: { channel: string; entries: TimelineEntry[] }[] = [];
  for (const entry of entries) {
    const key = entry.channel ?? "";
    const existing = groups.find(g => g.channel === key);
    if (existing) existing.entries.push(entry);
    else groups.push({ channel: key, entries: [entry] });
  }
  // keep entries of the same campaign next to each other inside a channel card
  for (const g of groups) {
    const order = [...new Set(g.entries.map(e => e.campaign ?? ""))];
    g.entries.sort((a, b) => order.indexOf(a.campaign ?? "") - order.indexOf(b.campaign ?? ""));
  }
  return groups;
}

// One card per channel on a date: badge, then each entry (campaign shown once for consecutive same-campaign entries).
function ChannelGroupCard({ channel, entries, align, onEdit, onRemove, width }: {
  channel: string; entries: TimelineEntry[]; align: "left" | "center";
  onEdit: (e: TimelineEntry) => void; onRemove: (id: string) => void; width: number | string;
}) {
  return (
    <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 10, background: "#f8fafc", padding: "10px 12px 8px", textAlign: align, width, boxSizing: "border-box" }}>
      {channel && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 9999, background: channelColor(channel).bg, color: channelColor(channel).text }}>
          <ChannelIcon channel={channel} />
          {channel}
        </span>
      )}
      {entries.map((entry, ei) => {
        const sameCampaignAsPrev = ei > 0 && !!entry.campaign && entries[ei - 1].campaign === entry.campaign;
        return (
          <div key={entry.id} className="group">
            {ei > 0 && !sameCampaignAsPrev && <div style={{ height: 1, background: "#e2e8f0", margin: "8px 0" }} />}
            {entry.title && <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginTop: 4 }}>{entry.title}</div>}
            {entry.description && (
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-line" }}>{entry.description}</div>
            )}
            <DetailsList details={entry.details} campaign={sameCampaignAsPrev ? undefined : entry.campaign} channel={entry.channel} align={align} />
            <ImageStrip images={entry.images} align={align} />
            <div className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ display: "flex", gap: 8, justifyContent: align === "center" ? "center" : "flex-start", marginTop: 6 }}>
              <button onClick={() => onEdit(entry)} style={{ color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontSize: 11 }}
                onMouseEnter={e => (e.currentTarget.style.color = "#475569")} onMouseLeave={e => (e.currentTarget.style.color = "#94a3b8")}>
                แก้ไข
              </button>
              <button onClick={() => onRemove(entry.id)} style={{ color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontSize: 11 }}
                onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={e => (e.currentTarget.style.color = "#94a3b8")}>
                ลบ
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

// Escapes a value for a CSV cell (wraps in quotes, doubles internal quotes) per RFC 4180
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// Flattens the per-channel detail fields into one readable cell, e.g. "Objective: Leads; Target: 25-34"
function formatDetails(details?: Record<string, string>): string {
  if (!details) return "";
  return Object.entries(details).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ");
}

function exportTimelineCsv(entries: TimelineEntry[], projectName: string) {
  const header = ["Date", "Channel", "Campaign", "Title", "Description", "Details"].map(csvCell).join(",");
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => [e.date, e.channel ?? "", e.campaign ?? "", e.title, e.description ?? "", formatDetails(e.details)].map(csvCell).join(","));
  // Prefix with a UTF-8 BOM so Thai text opens correctly in Excel
  const csv = "﻿" + [header, ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${projectName || "timeline"}-events.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Timeline({ entries, onChange, projectName, campaigns = [], adOptions = [] }: {
  entries: TimelineEntry[]; onChange: (entries: TimelineEntry[]) => void; projectName?: string;
  campaigns?: { id: string; name: string; platform: string }[];
  adOptions?: { id: string; name: string; image: string }[];
}) {
  const [adding, setAdding] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const [campaignOther, setCampaignOther] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ date: "", channel: "", campaign: "", title: "", description: "", details: {} as Record<string, string>, images: [] as TimelineImage[] });
  const [layout, setLayout] = useState<"vertical" | "horizontal">("horizontal");
  const [filterFrom, setFilterFrom] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [filterTo, setFilterTo] = useState(() => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  });

  const filtered = entries.filter(e =>
    (!filterFrom || e.date >= filterFrom) && (!filterTo || e.date <= filterTo)
  );
  const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
  const hasFilter = !!filterFrom || !!filterTo;
  const HORIZONTAL_COLS = 6;

  // Horizontal layout groups same-date events into one column, stacked downward,
  // instead of giving each event its own slot on the timeline.
  const dateGroups: { date: string; entries: TimelineEntry[] }[] = [];
  for (const entry of sorted) {
    const last = dateGroups[dateGroups.length - 1];
    if (last && last.date === entry.date) last.entries.push(entry);
    else dateGroups.push({ date: entry.date, entries: [entry] });
  }

  function startAdd() {
    setForm({ date: new Date().toISOString().slice(0, 10), channel: "", campaign: "", title: "", description: "", details: {}, images: [] });
    setEditingId(null);
    setOtherOpen(false);
    setCampaignOther(false);
    setAdding(true);
  }

  function startEdit(entry: TimelineEntry) {
    setForm({ date: entry.date, channel: entry.channel ?? "", campaign: entry.campaign ?? "", title: entry.title, description: entry.description ?? "", details: entry.details ?? {}, images: entry.images ?? [] });
    setEditingId(entry.id);
    setOtherOpen(false);
    setCampaignOther(false);
    setAdding(true);
  }

  function cancelForm() {
    setAdding(false);
    setEditingId(null);
  }

  const canSave = !!form.date && (!!form.title.trim() || !!form.channel.trim() || !!form.campaign || Object.values(form.details).some(v => v.trim()) || form.images.length > 0);

  function saveForm() {
    if (!canSave) return;
    // Only fields the user explicitly added (via the dropdown) are kept, so an untouched
    // field never gets saved as an empty value.
    const details: Record<string, string> = {};
    for (const [field, value] of Object.entries(form.details)) {
      const v = value.trim();
      if (v) details[field] = v;
    }
    const detailsOrUndefined = Object.keys(details).length ? details : undefined;
    const imagesOrUndefined = IMAGE_CHANNELS.includes(form.channel.trim()) && form.images.length ? form.images : undefined;

    if (editingId) {
      onChange(entries.map(e => e.id === editingId
        ? { ...e, date: form.date, channel: form.channel.trim() || undefined, campaign: form.campaign || undefined, title: form.title.trim(), description: form.description.trim() || undefined, details: detailsOrUndefined, images: imagesOrUndefined }
        : e));
    } else {
      onChange([...entries, {
        id: uid(), date: form.date, channel: form.channel.trim() || undefined, campaign: form.campaign || undefined, title: form.title.trim(),
        description: form.description.trim() || undefined, details: detailsOrUndefined, images: imagesOrUndefined, createdAt: Date.now(),
      }]);
    }
    cancelForm();
  }

  function removeEntry(id: string) {
    onChange(entries.filter(e => e.id !== id));
  }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>
        <button onClick={startAdd}
          style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          + เพิ่มเหตุการณ์
        </button>
        <button onClick={() => exportTimelineCsv(filtered, projectName ?? "")} disabled={filtered.length === 0}
          style={{ background: "#fff", color: filtered.length === 0 ? "#cbd5e1" : "#374151", border: "1px solid #e2e8f0", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: filtered.length === 0 ? "default" : "pointer" }}>
          Export CSV
        </button>

        <div style={{ width: 1, height: 20, background: "#e5e7eb", margin: "0 4px" }} />

        <label style={{ fontSize: 11, color: "#64748b" }}>จาก</label>
        <input type="date" value={filterFrom} max={filterTo || undefined} onChange={e => setFilterFrom(e.target.value)}
          style={{ fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 8px" }} />
        <label style={{ fontSize: 11, color: "#64748b" }}>ถึง</label>
        <input type="date" value={filterTo} min={filterFrom || undefined} onChange={e => setFilterTo(e.target.value)}
          style={{ fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 8px" }} />
        {hasFilter && (
          <button onClick={() => { setFilterFrom(""); setFilterTo(""); }}
            style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={e => (e.currentTarget.style.color = "#94a3b8")}>
            ล้างช่วงเวลา
          </button>
        )}

        <div style={{ flex: 1 }} />
        <button onClick={() => setLayout(l => l === "vertical" ? "horizontal" : "vertical")}
          title={layout === "vertical" ? "เปลี่ยนเป็นแนวนอน" : "เปลี่ยนเป็นแนวตั้ง"}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", color: "#374151", border: "1px solid #e2e8f0", borderRadius: 6, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          {layout === "vertical" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M5 12l4-4M5 12l4 4M19 12l-4-4M19 12l-4 4" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M12 5l-4 4M12 5l4 4M12 19l-4-4M12 19l4-4" /></svg>
          )}
          {layout === "vertical" ? "แนวนอน" : "แนวตั้ง"}
        </button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 40, background: "#f9fafb" }}>
        {adding && (
          <div style={{ maxWidth: 480, margin: "0 auto 24px", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{editingId ? "แก้ไขเหตุการณ์" : "เพิ่มเหตุการณ์ใหม่"}</div>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              style={{ fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 10px" }} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {CHANNEL_PRESETS.map(c => {
                const preset = c !== "Other";
                const on = preset ? form.channel === c && !otherOpen : (otherOpen || (!!form.channel && !CHANNEL_PRESETS.includes(form.channel)));
                return (
                  <button key={c} type="button"
                    onClick={() => {
                      if (preset) { setOtherOpen(false); setForm(f => ({ ...f, channel: f.channel === c ? "" : c, details: f.channel === c ? f.details : {} })); }
                      else { setOtherOpen(true); setForm(f => CHANNEL_PRESETS.includes(f.channel) ? { ...f, channel: "", details: {} } : f); }
                    }}
                    style={{ fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                      border: on ? "1.5px solid #2563eb" : "1.5px solid #e2e8f0", background: on ? "#eff6ff" : "#fff", color: on ? "#1e40af" : "#64748b" }}>
                    {c === "Other" ? "อื่นๆ" : c}
                  </button>
                );
              })}
            </div>
            {(otherOpen || (!!form.channel && !CHANNEL_PRESETS.includes(form.channel))) && (
              <input type="text" value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}
                placeholder="พิมพ์ชื่อ Channel"
                style={{ fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 10px" }} />
            )}
            {(() => {
              const ch = form.channel.trim().toLowerCase();
              const matching = ch ? campaigns.filter(c => c.platform.toLowerCase().includes(ch)) : [];
              const list = matching.length ? matching : campaigns;
              const platforms = [...new Set(list.map(c => c.platform))];
              const known = list.some(c => c.name === form.campaign);
              const custom = campaignOther || (!!form.campaign && !known);
              const inputStyle = { fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 10px" } as const;
              return (
                <>
                  {list.length > 0 && (
                    <select value={custom ? "__other" : form.campaign}
                      onChange={e => {
                        if (e.target.value === "__other") { setCampaignOther(true); if (known) setForm(f => ({ ...f, campaign: "" })); }
                        else { setCampaignOther(false); setForm(f => ({ ...f, campaign: e.target.value })); }
                      }}
                      style={{ ...inputStyle, color: form.campaign || custom ? "#0f172a" : "#64748b", background: "#fff" }}>
                      <option value="">Campaign ที่แก้ไข (เลือกจาก Ads Structure, ไม่บังคับ)</option>
                      {platforms.map(pl => (
                        <optgroup key={pl} label={pl}>
                          {list.filter(c => c.platform === pl).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </optgroup>
                      ))}
                      <option value="__other">อื่นๆ (พิมพ์เอง)</option>
                    </select>
                  )}
                  {(custom || list.length === 0) && (
                    <input type="text" value={form.campaign} onChange={e => setForm(f => ({ ...f, campaign: e.target.value }))}
                      placeholder="พิมพ์ชื่อ Campaign" style={inputStyle} />
                  )}
                </>
              );
            })()}

            {/* Sub-topics per channel — toggle the ones that changed, then fill in what changed */}
            {fieldsForChannel(form.channel.trim()).length > 0 && (() => {
              const availableFields = fieldsForChannel(form.channel.trim());
              const addedFields = availableFields.filter(f => f in form.details);
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, background: "#f8fafc", borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.3 }}>
                    แก้ไขอะไรใน {form.channel.trim()}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {availableFields.map(field => {
                      const on = field in form.details;
                      return (
                        <button key={field} type="button"
                          onClick={() => setForm(f => {
                            const next = { ...f.details };
                            if (field in next) delete next[field]; else next[field] = "";
                            return { ...f, details: next };
                          })}
                          style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 9999, cursor: "pointer",
                            border: on ? "1.5px solid #2563eb" : "1.5px solid #e2e8f0", background: on ? "#eff6ff" : "#fff", color: on ? "#1e40af" : "#64748b" }}>
                          {on ? "✓ " : "+ "}{field}
                        </button>
                      );
                    })}
                  </div>
                  {addedFields.map(field => (
                    <div key={field} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#64748b" }}>{field}</span>
                      <input type="text" value={form.details[field] ?? ""}
                        onChange={e => setForm(f => ({ ...f, details: { ...f.details, [field]: e.target.value } }))}
                        placeholder={`${field} เปลี่ยนเป็นอะไร`}
                        style={{ fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 10px", background: "#fff" }} />
                    </div>
                  ))}
                </div>
              );
            })()}
            {IMAGE_CHANNELS.includes(form.channel.trim()) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, background: "#f8fafc", borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.3 }}>รูป Ads ({form.images.length})</div>
                {form.images.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {form.images.map((im, i) => (
                      <div key={i} style={{ position: "relative", width: 64 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={im.src} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0", display: "block" }} />
                        <button onClick={() => setForm(f => ({ ...f, images: f.images.filter((_, j) => j !== i) }))}
                          style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#ef4444", color: "#fff", border: "2px solid #fff", fontSize: 10, cursor: "pointer", lineHeight: 1 }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {adOptions.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4 }}>เลือกจาก Ads ที่โหลดไว้</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: 6, maxHeight: 170, overflowY: "auto" }}>
                      {adOptions.map(ad => {
                        const picked = form.images.some(im => im.adId === ad.id);
                        return (
                          <button key={ad.id} type="button" disabled={!ad.image || imgBusy}
                            title={ad.name}
                            onClick={async () => {
                              if (picked) { setForm(f => ({ ...f, images: f.images.filter(im => im.adId !== ad.id) })); return; }
                              setImgBusy(true);
                              try {
                                const src = await toThumbDataUrl(ad.image);
                                setForm(f => ({ ...f, images: [...f.images, { src, name: ad.name, adId: ad.id }] }));
                              } catch { alert("โหลดรูปนี้ไม่สำเร็จ ลองอัปโหลดรูปเองแทน"); }
                              finally { setImgBusy(false); }
                            }}
                            style={{ padding: 0, border: picked ? "2px solid #2563eb" : "2px solid transparent", borderRadius: 8, background: "none", cursor: ad.image ? "pointer" : "default", opacity: ad.image ? 1 : 0.4, textAlign: "left" }}>
                            {ad.image
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={ad.image} alt="" referrerPolicy="no-referrer" style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 6, display: "block" }} />
                              : <div style={{ width: "100%", aspectRatio: "1 / 1", background: "#e2e8f0", borderRadius: 6 }} />}
                            <div style={{ fontSize: 8, color: "#64748b", lineHeight: 1.2, padding: "2px 2px 0", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", wordBreak: "break-all" }}>{ad.name}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <label className="cursor-pointer" style={{ fontSize: 11, color: "#2563eb", fontWeight: 600 }}>
                  {imgBusy ? "กำลังประมวลผลรูป..." : "+ อัปโหลดรูปเอง"}
                  <input type="file" accept="image/*" multiple style={{ display: "none" }} disabled={imgBusy}
                    onChange={async e => {
                      const files = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      if (!files.length) return;
                      setImgBusy(true);
                      try {
                        const added: TimelineImage[] = [];
                        for (const f of files) added.push({ src: await toThumbDataUrl(f), name: f.name.replace(/\.[^.]+$/, "") });
                        setForm(fm => ({ ...fm, images: [...fm.images, ...added] }));
                      } catch { alert("อ่านไฟล์รูปไม่สำเร็จ"); }
                      finally { setImgBusy(false); }
                    }} />
                </label>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={cancelForm} style={{ fontSize: 12, color: "#64748b", background: "none", border: "none", cursor: "pointer", padding: "6px 10px" }}>ยกเลิก</button>
              <button onClick={saveForm} disabled={!canSave}
                style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: !canSave ? "#94a3b8" : "#2563eb", border: "none", borderRadius: 6, padding: "6px 14px", cursor: !canSave ? "default" : "pointer" }}>
                บันทึก
              </button>
            </div>
          </div>
        )}

        {sorted.length === 0 ? (
          <div id="timeline-chart" style={{ maxWidth: 560, margin: "0 auto", padding: 24, background: "#fff", borderRadius: 12 }}>
            <div style={{ textAlign: "center", color: "#9ca3af", padding: 60, fontSize: 14 }}>
              {hasFilter
                ? "ไม่มีเหตุการณ์ในช่วงเวลาที่เลือก"
                : <>ยังไม่มีเหตุการณ์ — กด <strong>+ เพิ่มเหตุการณ์</strong> เพื่อเริ่มบันทึก Timeline</>}
            </div>
          </div>
        ) : layout === "vertical" ? (
          <div id="timeline-chart" style={{ maxWidth: 1100, margin: "0 auto", padding: 24, background: "#fff", borderRadius: 12 }}>
            {dateGroups.map((group, i) => (
              <div key={group.date} style={{ display: "flex", gap: 16 }}>
                {/* Connector column */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 16, flexShrink: 0 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#2563eb", marginTop: 4, flexShrink: 0 }} />
                  {i < dateGroups.length - 1 && <div style={{ width: 2, flex: 1, background: "#e2e8f0", marginTop: 2 }} />}
                </div>
                {/* Date + same-day events flowing to the right */}
                <div style={{ flex: 1, paddingBottom: 24, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", letterSpacing: 0.3, marginBottom: 8 }}>{formatDate(group.date)}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
                    {groupByChannel(group.entries).map(cg => (
                      <ChannelGroupCard key={cg.channel + cg.entries[0].id} channel={cg.channel} entries={cg.entries} align="left"
                        onEdit={startEdit} onRemove={removeEntry} width={240} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: "auto", padding: "8px 24px 24px" }}>
            <div id="timeline-chart" style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(HORIZONTAL_COLS, dateGroups.length)}, 220px)`,
              alignItems: "start",
              minWidth: "100%", padding: 24, background: "#fff", borderRadius: 12,
            }}>
              {dateGroups.map((group, i) => {
                // Wrap to a new row every HORIZONTAL_COLS date-columns — connector segments
                // only span within the same row, not across the wrap.
                const isFirstInRow = i % HORIZONTAL_COLS === 0;
                const isLastInRow = i % HORIZONTAL_COLS === HORIZONTAL_COLS - 1 || i === dateGroups.length - 1;
                return (
                <div key={group.date} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", padding: "0 6px" }}>
                  {/* Connector row */}
                  <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                    <div style={{ flex: 1, height: 2, background: isFirstInRow ? "transparent" : "#e2e8f0" }} />
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#2563eb", flexShrink: 0 }} />
                    <div style={{ flex: 1, height: 2, background: isLastInRow ? "transparent" : "#e2e8f0" }} />
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", letterSpacing: 0.3, marginTop: 10, marginBottom: 8 }}>{formatDate(group.date)}</div>

                  {/* Same-date events grouped by channel — same channel → one card */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
                    {groupByChannel(group.entries).map(cg => (
                      <ChannelGroupCard key={cg.channel + cg.entries[0].id} channel={cg.channel} entries={cg.entries} align="center"
                        onEdit={startEdit} onRemove={removeEntry} width="100%" />
                    ))}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
