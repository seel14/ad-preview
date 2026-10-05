"use client";

import { useState } from "react";
import type { AdsetOption, AdsetTarget, GeoPoint, TargetGroup } from "@/lib/targets";

export type { AdsetTarget, AdsetOption };

const SLIDE_W = 960;
const SLIDE_H = Math.round(SLIDE_W * (210 / 297));

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  ACTIVE: { bg: "#dcfce7", fg: "#166534" },
  PAUSED: { bg: "#fef3c7", fg: "#92400e" },
};

function Chip({ text, tone = "blue" }: { text: string; tone?: "blue" | "red" | "slate" | "violet" }) {
  const c = {
    blue: { bg: "#dbeafe", fg: "#1e3a8a" },
    red: { bg: "#fee2e2", fg: "#991b1b" },
    slate: { bg: "#f1f5f9", fg: "#334155" },
    violet: { bg: "#ede9fe", fg: "#5b21b6" },
  }[tone];
  return <span style={{ background: c.bg, color: c.fg, fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 9999, lineHeight: 1.5 }}>{text}</span>;
}

function Section({ title, children, grow }: { title: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", flex: grow ? 1 : undefined, minHeight: 0, overflow: "hidden" }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

const Chips = ({ items, tone, max = 40 }: { items: string[]; tone?: "blue" | "red" | "slate" | "violet"; max?: number }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
    {items.slice(0, max).map((x, i) => <Chip key={i} text={x} tone={tone} />)}
    {items.length > max && <Chip text={`+${items.length - max} more`} tone="slate" />}
  </div>
);

const Row = ({ k, v }: { k: string; v: string }) => v ? (
  <div style={{ display: "flex", gap: 8, fontSize: 12, padding: "2px 0" }}>
    <span style={{ color: "#64748b", width: 92, flexShrink: 0 }}>{k}</span>
    <span style={{ color: "#0f172a", fontWeight: 600, wordBreak: "break-word" }}>{v}</span>
  </div>
) : null;

const Empty = () => <span style={{ fontSize: 12, color: "#94a3b8" }}>ไม่ได้กำหนด</span>;

function Groups({ groups, tone }: { groups: TargetGroup[]; tone: "blue" | "red" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {groups.map(g => (
        <div key={g.label}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", marginBottom: 2 }}>{g.label}</div>
          <Chips items={g.items} tone={tone} />
        </div>
      ))}
    </div>
  );
}

const TILE = 256;
const R_EARTH_PX0 = 156543.03392; // metres per pixel at zoom 0, equator

function project(lat: number, lng: number, z: number) {
  const n = 2 ** z * TILE;
  const x = ((lng + 180) / 360) * n;
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * n;
  return { x, y };
}

// Static OpenStreetMap tiles + SVG circles (no map library, so html2canvas captures it reliably for PDF).
function LocationMap({ points, width, height }: { points: GeoPoint[]; width: number; height: number }) {
  if (!points.length) return null;
  // bounding box of every circle (default ~3 km halo for points without a radius)
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const p of points) {
    const r = (p.radiusKm ?? 3) * 1.15;
    const dLat = r / 111.32;
    const dLng = r / (111.32 * Math.max(0.2, Math.cos((p.lat * Math.PI) / 180)));
    minLat = Math.min(minLat, p.lat - dLat); maxLat = Math.max(maxLat, p.lat + dLat);
    minLng = Math.min(minLng, p.lng - dLng); maxLng = Math.max(maxLng, p.lng + dLng);
  }
  let z = 16;
  for (; z > 1; z--) {
    const a = project(maxLat, minLng, z), b = project(minLat, maxLng, z);
    if (b.x - a.x <= width && b.y - a.y <= height) break;
  }
  const c = project((minLat + maxLat) / 2, (minLng + maxLng) / 2, z);
  const left = c.x - width / 2, top = c.y - height / 2;
  const n = 2 ** z;
  const tiles: { key: string; src: string; x: number; y: number }[] = [];
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + width) / TILE); tx++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n;
      tiles.push({ key: `${tx}/${ty}`, src: `https://tile.openstreetmap.org/${z}/${wx}/${ty}.png`, x: tx * TILE - left, y: ty * TILE - top });
    }
  }
  return (
    <div style={{ position: "relative", width, height, overflow: "hidden", borderRadius: 8, border: "1px solid #e2e8f0", background: "#e5e7eb", marginTop: 8 }}>
      {tiles.map(t => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={t.key} src={t.src} alt="" crossOrigin="anonymous" draggable={false}
          style={{ position: "absolute", left: t.x, top: t.y, width: TILE, height: TILE }} />
      ))}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        {points.map((p, i) => {
          const pos = project(p.lat, p.lng, z);
          const mpp = (R_EARTH_PX0 * Math.cos((p.lat * Math.PI) / 180)) / 2 ** z;
          const rpx = p.radiusKm ? Math.max(5, (p.radiusKm * 1000) / mpp) : 0;
          const color = p.excluded ? "#dc2626" : "#2563eb";
          const cx = pos.x - left, cy = pos.y - top;
          return (
            <g key={i}>
              {rpx > 0 && <circle cx={cx} cy={cy} r={rpx} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={2} />}
              <circle cx={cx} cy={cy} r={4} fill={color} stroke="#fff" strokeWidth={1.5} />
            </g>
          );
        })}
      </svg>
      <div style={{ position: "absolute", right: 3, bottom: 2, fontSize: 8, color: "#334155", background: "rgba(255,255,255,0.75)", padding: "0 3px", borderRadius: 3 }}>© OpenStreetMap contributors</div>
    </div>
  );
}

export function TargetSlide({ item, adNames }: { item: AdsetTarget; adNames: Record<string, string> }) {
  const st = STATUS_COLOR[item.status] ?? { bg: "#e2e8f0", fg: "#475569" };
  const names = item.adIds.map(id => adNames[id]).filter(Boolean);
  return (
    <div id="export-target-slide" style={{ width: SLIDE_W, minWidth: SLIDE_W, height: SLIDE_H, minHeight: SLIDE_H, flexShrink: 0, boxSizing: "border-box", background: "#f8fafc", display: "flex", flexDirection: "column", fontFamily: "Helvetica, Arial, sans-serif", overflow: "hidden", border: "1px solid #e5e7eb", borderRadius: 8 }}>
      <div style={{ padding: "22px 28px 14px", background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.8, color: "#2563eb", textTransform: "uppercase" }}>Ad Set Targeting</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", lineHeight: 1.25, marginTop: 2, wordBreak: "break-word" }}>{item.adsetName}</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            {item.campaignName}{item.objective ? <> · <b style={{ color: "#334155" }}>{item.objective}</b></> : null}
          </div>
        </div>
        <span style={{ background: st.bg, color: st.fg, fontSize: 11, fontWeight: 800, padding: "3px 12px", borderRadius: 9999, flexShrink: 0 }}>{item.status || "-"}</span>
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: 18, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <Section title="Locations" grow>
            {item.locations.length ? <Chips items={item.locations} /> : item.locationTypes.length ? <span style={{ fontSize: 12, color: "#94a3b8" }}>Facebook ไม่ได้ส่งรายชื่อพื้นที่มา (ตรวจใน Ads Manager)</span> : <Empty />}
            {item.locationTypes.length > 0 && <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>{item.locationTypes.join(" · ")}</div>}
            <LocationMap points={item.geoPoints ?? []} width={264} height={150} />
            {(item.geoPoints ?? []).length > 0 && (
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, display: "flex", flexWrap: "wrap", gap: "2px 10px" }}>
                {item.geoPoints.map((p, i) => (
                  <span key={i}><b style={{ color: p.excluded ? "#dc2626" : "#2563eb" }}>●</b> {p.label}{p.radiusKm ? ` · รัศมี ${Number(p.radiusKm.toFixed(1))} กม.` : ""}</span>
                ))}
              </div>
            )}
            {item.excludedLocations.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#b91c1c", marginBottom: 2 }}>ยกเว้นพื้นที่</div>
                <Chips items={item.excludedLocations} tone="red" />
              </div>
            )}
          </Section>
          <Section title="Age & Gender">
            <Row k="อายุ" v={item.age} />
            <Row k="เพศ" v={item.genders} />
            {item.advantage.length > 0 && <div style={{ marginTop: 6 }}><Chips items={item.advantage} tone="violet" /></div>}
          </Section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <Section title="Detailed Targeting" grow>
            {item.detailed.length ? <Groups groups={item.detailed} tone="blue" /> : <Empty />}
            {item.excludedDetailed.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#b91c1c", marginBottom: 2 }}>ยกเว้น</div>
                <Groups groups={item.excludedDetailed} tone="red" />
              </div>
            )}
          </Section>
          <Section title="Custom Audiences">
            {item.customAudiences.length ? <Chips items={item.customAudiences} tone="violet" /> : <Empty />}
            {item.excludedAudiences.length > 0 && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#b91c1c", marginBottom: 2 }}>ยกเว้น</div>
                <Chips items={item.excludedAudiences} tone="red" />
              </div>
            )}
          </Section>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <Section title="Delivery">
            <Row k="Optimization" v={item.optimizationGoal} />
            <Row k="Budget" v={item.budget} />
            <Row k="Bid" v={item.bidStrategy} />
            <Row k="ช่วงเวลา" v={item.schedule} />
          </Section>
          <Section title="Placements">
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {item.placements.map((p, i) => <div key={i} style={{ fontSize: 11, color: "#0f172a" }}>{p}</div>)}
              {item.devices.length > 0 && <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>อุปกรณ์: {item.devices.join(", ")}</div>}
            </div>
          </Section>
          <Section title={`Ads (${item.adIds.length})`} grow>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {(names.length ? names : item.adIds).slice(0, 8).map((n, i) => <div key={i} style={{ fontSize: 11, color: "#334155", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>• {n}</div>)}
              {item.adIds.length > 8 && <div style={{ fontSize: 11, color: "#94a3b8" }}>+{item.adIds.length - 8} more</div>}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

export interface PickerProps {
  source: "loaded" | "account";
  onSourceChange: (s: "loaded" | "account") => void;
  loadedCount: number;
  accountLabel: string; // "" when no Facebook account is selected
  canLoadLoaded: boolean;
  options: AdsetOption[];
  selected: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
  onLoadList: () => void;
  listLoading: boolean;
  onFetch: () => void;
  fetching: boolean;
}

function AdsetPicker({ p, startOpen }: { p: PickerProps; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const q = query.trim().toLowerCase();
  const visible = p.options.filter(o =>
    (!status || o.status === status) &&
    (!q || o.name.toLowerCase().includes(q) || o.campaignName.toLowerCase().includes(q) || o.id.includes(q)));
  const statuses = [...new Set(p.options.map(o => o.status).filter(Boolean))];
  const allVisibleOn = visible.length > 0 && visible.every(o => p.selected.has(o.id));
  const toggle = (id: string) => { const n = new Set(p.selected); if (n.has(id)) n.delete(id); else n.add(id); p.onSelectedChange(n); };
  const canLoad = p.source === "account" ? !!p.accountLabel : p.canLoadLoaded;

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, maxWidth: SLIDE_W, margin: "0 auto 14px", overflow: "hidden" }}>
      <button onClick={() => setOpen(o => !o)} className="cursor-pointer"
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "none", border: "none", textAlign: "left" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
          เลือก Ad Set ที่ต้องการดึง Target
          {p.selected.size > 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: "#1e40af", background: "#dbeafe", borderRadius: 9999, padding: "1px 9px" }}>เลือกแล้ว {p.selected.size}</span>}
        </span>
        <span style={{ color: "#94a3b8", fontSize: 12 }}>{open ? "ซ่อน ▲" : "แสดง ▼"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {([["loaded", `Ads ที่โหลดไว้ (${p.loadedCount})`, p.canLoadLoaded], ["account", p.accountLabel ? `ทั้งบัญชี: ${p.accountLabel}` : "ทั้งบัญชี Facebook (ยังไม่ได้เลือกบัญชี)", !!p.accountLabel]] as const).map(([k, label, ok]) => (
              <button key={k} onClick={() => p.onSourceChange(k)} className="cursor-pointer"
                style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 8, border: p.source === k ? "1.5px solid #2563eb" : "1.5px solid #e2e8f0", background: p.source === k ? "#eff6ff" : "#fff", color: p.source === k ? "#1e40af" : ok ? "#64748b" : "#cbd5e1" }}>
                {label}
              </button>
            ))}
            <button onClick={p.onLoadList} disabled={!canLoad || p.listLoading} className="cursor-pointer"
              style={{ fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8, border: "none", color: "#fff", background: !canLoad || p.listLoading ? "#94a3b8" : "#2563eb" }}>
              {p.listLoading ? "กำลังโหลดรายการ..." : p.options.length ? "โหลดรายการใหม่" : "โหลดรายการ Ad Set"}
            </button>
          </div>
          {!canLoad && (
            <div style={{ fontSize: 11, color: "#b45309" }}>
              {p.source === "account" ? "เชื่อมต่อ Facebook แล้วเลือกบัญชีโฆษณาที่แผงด้านขวา" : "ต้องมี Token และโหลด Ads (Ad ID) ที่แท็บ Ad Preview ก่อน"}
            </div>
          )}

          {p.options.length > 0 && (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาชื่อ Ad Set / Campaign / ID"
                  style={{ flex: 1, minWidth: 200, fontSize: 12, padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 8 }} />
                {statuses.length > 1 && (
                  <select value={status} onChange={e => setStatus(e.target.value)} style={{ fontSize: 12, padding: "7px 8px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}>
                    <option value="">ทุกสถานะ</option>
                    {statuses.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                )}
                <button onClick={() => { const n = new Set(p.selected); visible.forEach(o => allVisibleOn ? n.delete(o.id) : n.add(o.id)); p.onSelectedChange(n); }}
                  className="cursor-pointer" style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none" }}>
                  {allVisibleOn ? "ยกเลิกที่เห็น" : `เลือกทั้งหมดที่เห็น (${visible.length})`}
                </button>
                {p.selected.size > 0 && (
                  <button onClick={() => p.onSelectedChange(new Set())} className="cursor-pointer" style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none" }}>ล้างการเลือก</button>
                )}
              </div>
              <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid #f1f5f9", borderRadius: 8 }}>
                {visible.length === 0 ? (
                  <div style={{ padding: 16, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>ไม่พบ Ad Set ที่ตรงกับการค้นหา</div>
                ) : visible.map(o => {
                  const st = STATUS_COLOR[o.status] ?? { bg: "#e2e8f0", fg: "#475569" };
                  return (
                    <label key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderBottom: "1px solid #f8fafc", cursor: "pointer", background: p.selected.has(o.id) ? "#f0f7ff" : "#fff" }}>
                      <input type="checkbox" checked={p.selected.has(o.id)} onChange={() => toggle(o.id)} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                        <span style={{ display: "block", fontSize: 10, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.campaignName}{o.adIds.length ? ` · ${o.adIds.length} ads` : ""}</span>
                      </span>
                      {o.status && <span style={{ background: st.bg, color: st.fg, fontSize: 9, fontWeight: 800, padding: "1px 8px", borderRadius: 9999 }}>{o.status}</span>}
                    </label>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={p.onFetch} disabled={p.selected.size === 0 || p.fetching} className="cursor-pointer"
                  style={{ fontSize: 12, fontWeight: 700, padding: "8px 18px", borderRadius: 8, border: "none", color: "#fff", background: p.selected.size === 0 || p.fetching ? "#94a3b8" : "#16a34a" }}>
                  {p.fetching ? "กำลังดึง Target..." : `ดึง Target ที่เลือก (${p.selected.size})`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function TargetView({ targets, adNames, index, onIndexChange, loading, error, picker, onExportPdf, exporting, exportMode }: {
  targets: AdsetTarget[]; adNames: Record<string, string>; index: number; onIndexChange: (i: number) => void;
  loading: boolean; error: string; picker: PickerProps; onExportPdf: () => void; exporting: boolean; exportMode: boolean;
}) {
  const item = targets[index];
  return (
    <div className="flex-1 overflow-auto" style={{ padding: 24, background: "#f1f5f9" }}>
      {!exportMode && <AdsetPicker p={picker} startOpen={targets.length === 0} />}
      {!exportMode && targets.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", maxWidth: SLIDE_W, margin: "0 auto 14px" }}>
          {targets.length > 0 && (
            <>
              <button onClick={() => onIndexChange(Math.max(0, index - 1))} disabled={index === 0} className="cursor-pointer"
                style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", opacity: index === 0 ? 0.4 : 1 }}>‹</button>
              <span style={{ fontSize: 12, color: "#64748b" }}>{index + 1} / {targets.length}</span>
              <button onClick={() => onIndexChange(Math.min(targets.length - 1, index + 1))} disabled={index === targets.length - 1} className="cursor-pointer"
                style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", opacity: index === targets.length - 1 ? 0.4 : 1 }}>›</button>
              <select value={index} onChange={e => onIndexChange(Number(e.target.value))}
                style={{ fontSize: 12, padding: "6px 8px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", maxWidth: 260 }}>
                {targets.map((t, i) => <option key={t.adsetId} value={i}>{t.adsetName}</option>)}
              </select>
              <button onClick={onExportPdf} disabled={exporting} className="cursor-pointer"
                style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: "none", color: "#b91c1c", background: "#fee2e2" }}>
                {exporting ? "..." : "Target PDF"}
              </button>
            </>
          )}
        </div>
      )}
      {error && <div style={{ maxWidth: SLIDE_W, margin: "0 auto 12px", fontSize: 12, color: "#991b1b", background: "#fee2e2", borderRadius: 8, padding: "8px 12px" }}>{error}</div>}
      {item ? (
        <div style={{ width: SLIDE_W, margin: "0 auto", flexShrink: 0 }}>
          <TargetSlide item={item} adNames={adNames} />
        </div>
      ) : !loading && !error && (
        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 60 }}>
          ยังไม่มีข้อมูล Target — โหลดรายการ Ad Set ด้านบน ติ๊กเลือกที่ต้องการ แล้วกด "ดึง Target ที่เลือก"
        </div>
      )}
    </div>
  );
}
