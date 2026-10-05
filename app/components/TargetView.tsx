"use client";

import type { AdsetTarget, TargetGroup } from "@/lib/targets";

export type { AdsetTarget };

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

export function TargetSlide({ item, adNames }: { item: AdsetTarget; adNames: Record<string, string> }) {
  const st = STATUS_COLOR[item.status] ?? { bg: "#e2e8f0", fg: "#475569" };
  const names = item.adIds.map(id => adNames[id]).filter(Boolean);
  return (
    <div id="export-target-slide" style={{ width: SLIDE_W, height: SLIDE_H, background: "#f8fafc", display: "flex", flexDirection: "column", fontFamily: "Helvetica, Arial, sans-serif", overflow: "hidden", border: "1px solid #e5e7eb", borderRadius: 8 }}>
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
            {item.locations.length ? <Chips items={item.locations} /> : <Empty />}
            {item.locationTypes.length > 0 && <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>{item.locationTypes.join(" · ")}</div>}
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

export default function TargetView({ targets, adNames, index, onIndexChange, loading, error, onFetch, canFetch, onExportPdf, exporting, exportMode }: {
  targets: AdsetTarget[]; adNames: Record<string, string>; index: number; onIndexChange: (i: number) => void;
  loading: boolean; error: string; onFetch: () => void; canFetch: boolean; onExportPdf: () => void; exporting: boolean; exportMode: boolean;
}) {
  const item = targets[index];
  return (
    <div className="flex-1 overflow-auto" style={{ padding: 24, background: "#f1f5f9" }}>
      {!exportMode && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", maxWidth: SLIDE_W, margin: "0 auto 14px" }}>
          <button onClick={onFetch} disabled={!canFetch || loading} className="cursor-pointer"
            style={{ fontSize: 12, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: "none", color: "#fff", background: !canFetch || loading ? "#94a3b8" : "#2563eb" }}>
            {loading ? "กำลังดึง Target..." : targets.length ? "รีเฟรช Target" : "ดึง Target จาก Facebook"}
          </button>
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
          {!canFetch && <span style={{ fontSize: 11, color: "#b45309" }}>ต้องมี Token และโหลด Ads (Ad ID) ที่แท็บ Ad Preview ก่อน</span>}
        </div>
      )}
      {error && <div style={{ maxWidth: SLIDE_W, margin: "0 auto 12px", fontSize: 12, color: "#991b1b", background: "#fee2e2", borderRadius: 8, padding: "8px 12px" }}>{error}</div>}
      {item ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <TargetSlide item={item} adNames={adNames} />
        </div>
      ) : !loading && !error && (
        <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 60 }}>
          ยังไม่มีข้อมูล Target — กด "ดึง Target จาก Facebook" เพื่อดึงการตั้งค่า Target ของแต่ละ Ad Set จาก Ads ที่โหลดไว้
        </div>
      )}
    </div>
  );
}
