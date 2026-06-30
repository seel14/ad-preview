"use client";

import { useState, useRef, useEffect, createContext, useContext } from "react";

const ExportCtx = createContext(false);

export interface StructureNode {
  id: string;
  type: "platform" | "campaign" | "adset" | "ad";
  name: string;
  meta?: Record<string, string>;
  children: StructureNode[];
}

interface AdData {
  id: string;
  name: string;
  creative: {
    image_url?: string;
    thumbnail_url?: string;
    object_story_spec?: {
      link_data?: { picture?: string };
      video_data?: { image_url?: string };
    };
  };
}

const PLATFORM_THEMES: Record<string, { platform: string; campaign: string; adset: string; adsetText: string }> = {
  "Facebook Ads": { platform: "#1877f2", campaign: "#1d4ed8", adset: "#bfdbfe", adsetText: "#1e3a8a" },
  "Google Ads":   { platform: "#ea4335", campaign: "#b91c1c", adset: "#fecaca", adsetText: "#7f1d1d" },
  "TikTok":       { platform: "#111827", campaign: "#374151", adset: "#d1d5db", adsetText: "#111827" },
  "Line":         { platform: "#06C755", campaign: "#15803d", adset: "#bbf7d0", adsetText: "#14532d" },
};
const PLATFORM_OPTIONS = Object.keys(PLATFORM_THEMES);
const LINE_COLOR = "#d1d5db";

function uid() { return Math.random().toString(36).slice(2, 10); }

function getThumb(ad: AdData): string {
  const ld = ad.creative.object_story_spec?.link_data;
  const vd = ad.creative.object_story_spec?.video_data;
  return ld?.picture ?? vd?.image_url ?? ad.creative.image_url ?? ad.creative.thumbnail_url ?? "";
}

// ── Drag state (global within component tree) ─────────────────────────────────
interface DragCtxType {
  dragId: string | null;
  overId: string | null;
  setDragId: (id: string | null) => void;
  setOverId: (id: string | null) => void;
}
const DragCtx = createContext<DragCtxType>({ dragId: null, overId: null, setDragId: () => {}, setOverId: () => {} });

// ── useSortList — helper for drag-sortable lists ───────────────────────────────
function useDragSort(items: StructureNode[], onReorder: (next: StructureNode[]) => void) {
  const { dragId, overId, setDragId, setOverId } = useContext(DragCtx);
  const exporting = useContext(ExportCtx);

  function dragProps(item: StructureNode) {
    if (exporting) return {};
    return {
      draggable: true as const,
      onDragStart: (e: React.DragEvent) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.id);
        setDragId(item.id);
      },
      onDragEnd: () => { setDragId(null); setOverId(null); },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        setOverId(item.id);
      },
      onDragLeave: (e: React.DragEvent) => {
        e.stopPropagation();
        setOverId(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const fromId = e.dataTransfer.getData("text/plain");
        if (!fromId || fromId === item.id) { setDragId(null); setOverId(null); return; }
        const fromIdx = items.findIndex(x => x.id === fromId);
        const toIdx = items.findIndex(x => x.id === item.id);
        if (fromIdx === -1 || toIdx === -1) { setDragId(null); setOverId(null); return; }
        const next = [...items];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        onReorder(next);
        setDragId(null);
        setOverId(null);
      },
    };
  }

  return { dragProps, isDragging: (id: string) => dragId === id, isOver: (id: string) => overId === id && dragId !== id };
}

// ── Inline editable field ──────────────────────────────────────────────────────
function InlineField({ value, onSave, placeholder, style }: {
  value: string; onSave: (v: string) => void; placeholder?: string; style?: React.CSSProperties;
}) {
  const exporting = useContext(ExportCtx);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  function commit() { setEditing(false); if (draft.trim() !== value) onSave(draft.trim()); }
  if (!editing) {
    return (
      <span
        onClick={e => { if (exporting) return; e.stopPropagation(); setDraft(value); setEditing(true); }}
        style={{ cursor: exporting ? "default" : "text", borderBottom: exporting ? "none" : "1px dashed rgba(0,0,0,0.2)", minWidth: 40, display: "inline-block", ...style }}
        title={exporting ? undefined : "คลิกเพื่อแก้ไข"}>
        {value || <span style={{ opacity: 0.4 }}>{placeholder}</span>}
      </span>
    );
  }
  return (
    <input ref={ref} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      onClick={e => e.stopPropagation()}
      onDragStart={e => e.stopPropagation()}
      style={{ background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.6)", borderRadius: 4, padding: "1px 6px", color: "inherit", fontSize: "inherit", fontWeight: "inherit", outline: "none", width: 90, ...style }} />
  );
}

// ── Ad picker dropdown ─────────────────────────────────────────────────────────
function AdPicker({ loadedAds, existingAdIds, onSelect, onClose }: {
  loadedAds: AdData[]; existingAdIds: Set<string>; onSelect: (ad: AdData) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) { if (!ref.current?.contains(e.target as Node)) onClose(); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const available = loadedAds.filter(a => !existingAdIds.has(a.id));
  return (
    <div ref={ref} style={{
      position: "absolute", top: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)",
      zIndex: 200, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
      boxShadow: "0 8px 24px rgba(0,0,0,0.14)", width: 280, maxHeight: 320, overflowY: "auto",
    }}>
      {available.length === 0 ? (
        <div style={{ padding: "16px 12px", fontSize: 12, color: "#9ca3af", textAlign: "center" }}>
          {loadedAds.length === 0 ? "โหลด Ads ในแท็บ Ad Preview ก่อน" : "ไม่มี Ad ที่เหลือแล้ว"}
        </div>
      ) : available.map(ad => {
        const thumb = getThumb(ad);
        return (
          <div key={ad.id} onClick={() => { onSelect(ad); onClose(); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#f9fafb")}
            onMouseLeave={e => (e.currentTarget.style.background = "")}>
            {thumb
              ? <img src={thumb} alt="" crossOrigin="anonymous" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
              : <div style={{ width: 44, height: 44, background: "#f3f4f6", borderRadius: 6, flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad.name}</div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>{ad.id.slice(-8)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Budget field ───────────────────────────────────────────────────────────────
function BudgetRow({ meta, onUpdate, textColor }: {
  meta?: Record<string, string>; onUpdate: (m: Record<string, string>) => void; textColor: string;
}) {
  const exporting = useContext(ExportCtx);
  const period = meta?.budgetPeriod ?? "Day";
  const hasBudget = !!(meta?.budget?.trim());
  if (exporting && !hasBudget) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 4, fontSize: 11 }}>
      <InlineField value={meta?.budget ?? ""} onSave={v => onUpdate({ ...meta, budget: v })} placeholder="Budget"
        style={{ color: textColor, fontSize: 11, width: 60, textAlign: "center" }} />
      <span style={{ opacity: 0.7, color: textColor }}>Baht/</span>
      {exporting
        ? <span style={{ color: textColor, fontSize: 10, fontWeight: 700 }}>{period}</span>
        : <button onClick={e => { e.stopPropagation(); onUpdate({ ...meta, budgetPeriod: period === "Day" ? "Month" : "Day" }); }}
            style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 4, color: textColor, fontSize: 10, fontWeight: 700, padding: "1px 6px", cursor: "pointer" }}>
            {period}
          </button>}
    </div>
  );
}

// ── Node box ───────────────────────────────────────────────────────────────────
function NodeBox({ label, bg, textColor, sublabel, onLabelSave, onRemove, children, isOver, isDraggingThis }: {
  label: string; bg: string; textColor: string; sublabel?: React.ReactNode;
  onLabelSave: (v: string) => void; onRemove: () => void; children?: React.ReactNode;
  isOver?: boolean; isDraggingThis?: boolean;
}) {
  const exporting = useContext(ExportCtx);
  return (
    <div style={{ position: "relative", display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{
        background: bg, color: textColor, padding: "10px 18px", borderRadius: 10,
        fontWeight: 700, fontSize: 13, textAlign: "center", minWidth: 150,
        boxShadow: isOver ? "0 0 0 3px #3b82f6, 0 4px 16px rgba(0,0,0,0.2)" : "0 2px 8px rgba(0,0,0,0.15)",
        opacity: isDraggingThis ? 0.5 : 1,
        transition: "box-shadow 0.15s, opacity 0.15s",
      }}>
        <InlineField value={label} onSave={onLabelSave} placeholder="ชื่อ..." style={{ color: textColor, fontSize: 13, fontWeight: 700 }} />
        {sublabel}
        {!exporting && <button onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{ position: "absolute", top: -8, right: -8, width: 20, height: 20, borderRadius: "50%", background: "#ef4444", color: "#fff", border: "2px solid #fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          ✕
        </button>}
      </div>
      {!exporting && children}
    </div>
  );
}

// ── Connector lines ────────────────────────────────────────────────────────────
function ChildConnector({ isFirst, isLast, single }: { isFirst: boolean; isLast: boolean; single: boolean }) {
  return (
    <div style={{ position: "relative", height: 24, alignSelf: "stretch" }}>
      {!single && (
        <div style={{ position: "absolute", top: 11, left: isFirst ? "50%" : 0, right: isLast ? "50%" : 0, height: 2, background: LINE_COLOR }} />
      )}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "calc(50% - 1px)", width: 2, background: LINE_COLOR }} />
    </div>
  );
}

function VertBar({ height = 24 }: { height?: number }) {
  return <div style={{ width: 2, height, background: LINE_COLOR, flexShrink: 0 }} />;
}

// ── Grab handle bar (visible drag grip) ───────────────────────────────────────
function GrabBar({ label, color = "#6b7280", bg = "#f3f4f6" }: { label: string; color?: string; bg?: string }) {
  const exporting = useContext(ExportCtx);
  if (exporting) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
      padding: "3px 12px", borderRadius: 20, marginBottom: 5,
      background: bg, border: `1px solid ${color}30`,
      fontSize: 11, color, fontWeight: 600, userSelect: "none",
      cursor: "grab",
    }}>
      <span style={{ fontSize: 14, letterSpacing: 2 }}>⠿</span>
      {label}
    </div>
  );
}

// ── Ad picker button ────────────────────────────────────────────────────────────
function AddAdButton({ existingAdIds, loadedAds, onAdd, label = "+ Ad" }: {
  existingAdIds: Set<string>; loadedAds: AdData[]; onAdd: (ad: AdData) => void; label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", marginTop: 6 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ fontSize: 10, color: "#6b7280", background: "#f3f4f6", border: "1px dashed #d1d5db", borderRadius: 4, padding: "3px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>
        {label}
      </button>
      {open && <AdPicker loadedAds={loadedAds} existingAdIds={existingAdIds} onSelect={onAdd} onClose={() => setOpen(false)} />}
    </div>
  );
}

// ── Ad card ────────────────────────────────────────────────────────────────────
function AdCard({ node, onRemove, dragP, isDraggingThis, isOver }: {
  node: StructureNode; onRemove: () => void;
  dragP: Record<string, unknown>; isDraggingThis: boolean; isOver: boolean;
}) {
  const exporting = useContext(ExportCtx);
  const thumb = node.meta?.thumbnailUrl ?? "";
  return (
    <div {...dragP} style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity: isDraggingThis ? 0.4 : 1 }}>
      {!exporting && <GrabBar label="ลาก Ad" color="#9ca3af" bg="#f3f4f6" />}
      <div style={{ position: "relative", width: 90 }}>
        <div style={{
          background: "#fff", border: isOver ? "2px solid #3b82f6" : "1px solid #e5e7eb",
          borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          transition: "border 0.15s",
        }}>
          <div style={{ width: "100%", aspectRatio: "1 / 1", overflow: "hidden", background: "#f3f4f6" }}>
            {thumb
              ? <img src={thumb} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                </div>}
          </div>
          <div style={{ padding: "4px 6px" }}>
            <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase" }}>AD</div>
            <div style={{ fontSize: 10, color: "#111", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {node.name || "—"}
            </div>
          </div>
        </div>
        {!exporting && <button onClick={e => { e.stopPropagation(); onRemove(); }}
          style={{ position: "absolute", top: -7, right: -7, width: 18, height: 18, borderRadius: "50%", background: "#ef4444", color: "#fff", border: "2px solid #fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          ✕
        </button>}
      </div>
    </div>
  );
}

// ── Adset node ─────────────────────────────────────────────────────────────────
function AdsetNode({ node, theme, loadedAds, onUpdate, onRemove, dragP, isDraggingThis, isOver }: {
  node: StructureNode; theme: typeof PLATFORM_THEMES["Facebook Ads"];
  loadedAds: AdData[]; onUpdate: (p: Partial<StructureNode>) => void; onRemove: () => void;
  dragP: Record<string, unknown>; isDraggingThis: boolean; isOver: boolean;
}) {
  const ads = node.children;
  const existingAdIds = new Set(ads.map(a => a.meta?.adId ?? "").filter(Boolean));
  const { dragProps: adDragProps, isDragging: adIsDragging, isOver: adIsOver } = useDragSort(ads,
    next => onUpdate({ children: next })
  );

  function addAd(ad: AdData) {
    onUpdate({ children: [...ads, { id: uid(), type: "ad", name: ad.name, meta: { adId: ad.id, thumbnailUrl: getThumb(ad) }, children: [] }] });
  }

  return (
    <div {...dragP} style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity: isDraggingThis ? 0.4 : 1 }}>
      <GrabBar label="ลาก Ad Set" color={theme.adsetText} bg={theme.adset} />
      <NodeBox label={node.name} bg={theme.adset} textColor={theme.adsetText}
        onLabelSave={v => onUpdate({ name: v })} onRemove={onRemove}
        isOver={isOver} isDraggingThis={isDraggingThis}
        sublabel={<BudgetRow meta={node.meta} onUpdate={m => onUpdate({ meta: m })} textColor={theme.adsetText} />}>
        <AddAdButton existingAdIds={existingAdIds} loadedAds={loadedAds} onAdd={addAd} />
      </NodeBox>
      {ads.length > 0 && (
        <>
          <VertBar />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", maxWidth: 360 }}>
            {ads.map(ad => (
              <AdCard key={ad.id} node={ad}
                onRemove={() => onUpdate({ children: ads.filter(a => a.id !== ad.id) })}
                dragP={adDragProps(ad)} isDraggingThis={adIsDragging(ad.id)} isOver={adIsOver(ad.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Campaign node ──────────────────────────────────────────────────────────────
function CampaignNode({ node, theme, loadedAds, onUpdate, onRemove, dragP, isDraggingThis, isOver }: {
  node: StructureNode; theme: typeof PLATFORM_THEMES["Facebook Ads"];
  loadedAds: AdData[]; onUpdate: (p: Partial<StructureNode>) => void; onRemove: () => void;
  dragP: Record<string, unknown>; isDraggingThis: boolean; isOver: boolean;
}) {
  const adsets = node.children.filter(c => c.type === "adset");
  const sharedAds = node.children.filter(c => c.type === "ad");
  const existingSharedIds = new Set(sharedAds.map(a => a.meta?.adId ?? "").filter(Boolean));
  const { dragProps: adsetDragProps, isDragging: adsetIsDragging, isOver: adsetIsOver } = useDragSort(adsets,
    next => onUpdate({ children: [...next, ...sharedAds] })
  );

  function updateChild(id: string, patch: Partial<StructureNode>) {
    onUpdate({ children: node.children.map(c => c.id === id ? { ...c, ...patch } : c) });
  }
  function removeChild(id: string) { onUpdate({ children: node.children.filter(c => c.id !== id) }); }
  function addAdset() {
    onUpdate({ children: [...node.children, { id: uid(), type: "adset", name: "New Ad Set", meta: {}, children: [] }] });
  }
  function addSharedAd(ad: AdData) {
    onUpdate({ children: [...node.children, { id: uid(), type: "ad", name: ad.name, meta: { adId: ad.id, thumbnailUrl: getThumb(ad) }, children: [] }] });
  }

  return (
    <div {...dragP} style={{ display: "flex", flexDirection: "column", alignItems: "center", opacity: isDraggingThis ? 0.4 : 1 }}>
      <GrabBar label="ลาก Campaign" color="#3b82f6" bg="#eff6ff" />
      <NodeBox label={node.name} bg={theme.campaign} textColor="#fff"
        onLabelSave={v => onUpdate({ name: v })} onRemove={onRemove}
        isOver={isOver} isDraggingThis={isDraggingThis}
        sublabel={<BudgetRow meta={node.meta} onUpdate={m => onUpdate({ meta: m })} textColor="#fff" />}>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button onClick={addAdset} style={{ fontSize: 10, color: "#6b7280", background: "#f3f4f6", border: "1px dashed #d1d5db", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>+ Ad Set</button>
          <AddAdButton existingAdIds={existingSharedIds} loadedAds={loadedAds} onAdd={addSharedAd} label="+ Shared Ad" />
        </div>
      </NodeBox>

      {adsets.length > 0 && (
        <>
          <VertBar />
          <div style={{ display: "flex" }}>
            {adsets.map((adset, i) => (
              <div key={adset.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <ChildConnector isFirst={i === 0} isLast={i === adsets.length - 1} single={adsets.length === 1} />
                <div style={{ paddingLeft: 8, paddingRight: 8 }}>
                  <AdsetNode node={adset} theme={theme} loadedAds={loadedAds}
                    onUpdate={p => updateChild(adset.id, p)} onRemove={() => removeChild(adset.id)}
                    dragP={adsetDragProps(adset)} isDraggingThis={adsetIsDragging(adset.id)} isOver={adsetIsOver(adset.id)} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {sharedAds.length > 0 && (
        <>
          <VertBar />
          <div style={{ padding: "8px 16px", background: "#fefce8", border: "1px dashed #fbbf24", borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 10, color: "#92400e", fontWeight: 600 }}>Shared Ads (ทุก Ad Set)</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {sharedAds.map(ad => <AdCard key={ad.id} node={ad} onRemove={() => removeChild(ad.id)} dragP={{}} isDraggingThis={false} isOver={false} />)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Platform node ──────────────────────────────────────────────────────────────
function PlatformNode({ node, loadedAds, onUpdate, onRemove }: {
  node: StructureNode; loadedAds: AdData[];
  onUpdate: (p: Partial<StructureNode>) => void; onRemove: () => void;
}) {
  const exporting = useContext(ExportCtx);
  const theme = PLATFORM_THEMES[node.name] ?? PLATFORM_THEMES["Facebook Ads"];
  const campaigns = node.children;
  const { dragProps: campaignDragProps, isDragging: campaignIsDragging, isOver: campaignIsOver } = useDragSort(campaigns,
    next => onUpdate({ children: next })
  );

  function updateChild(id: string, patch: Partial<StructureNode>) {
    onUpdate({ children: node.children.map(c => c.id === id ? { ...c, ...patch } : c) });
  }
  function removeChild(id: string) { onUpdate({ children: node.children.filter(c => c.id !== id) }); }
  function addCampaign() {
    onUpdate({ children: [...node.children, { id: uid(), type: "campaign", name: "New Campaign", meta: { budgetPeriod: "Day" }, children: [] }] });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", background: theme.platform, color: "#fff", padding: "10px 20px", borderRadius: 10, fontWeight: 700, fontSize: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.2)", display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {exporting
            ? <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{node.name}</span>
            : <>
                <select value={node.name} onChange={e => {
                  const t = PLATFORM_THEMES[e.target.value] ?? PLATFORM_THEMES["Facebook Ads"];
                  onUpdate({ name: e.target.value, meta: { ...node.meta, color: t.platform } });
                }} style={{ background: "transparent", border: "none", color: "#fff", fontWeight: 700, fontSize: 14, outline: "none", cursor: "pointer", appearance: "none" }}>
                  {PLATFORM_OPTIONS.map(o => <option key={o} value={o} style={{ color: "#000" }}>{o}</option>)}
                </select>
                <span style={{ opacity: 0.6, fontSize: 10 }}>▾</span>
              </>}
        </div>
        {!exporting && <button onClick={addCampaign} style={{ fontSize: 10, color: "#fff", background: "rgba(255,255,255,0.15)", border: "1px dashed rgba(255,255,255,0.5)", borderRadius: 4, padding: "3px 10px", cursor: "pointer" }}>+ Campaign</button>}
        {!exporting && <button onClick={onRemove} style={{ position: "absolute", top: -8, right: -8, width: 20, height: 20, borderRadius: "50%", background: "#ef4444", color: "#fff", border: "2px solid #fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>}
      </div>

      {campaigns.length > 0 && (
        <>
          <VertBar />
          <div style={{ display: "flex" }}>
            {campaigns.map((campaign, i) => (
              <div key={campaign.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <ChildConnector isFirst={i === 0} isLast={i === campaigns.length - 1} single={campaigns.length === 1} />
                <div style={{ paddingLeft: 12, paddingRight: 12 }}>
                  <CampaignNode node={campaign} theme={theme} loadedAds={loadedAds}
                    onUpdate={p => updateChild(campaign.id, p)} onRemove={() => removeChild(campaign.id)}
                    dragP={campaignDragProps(campaign)} isDraggingThis={campaignIsDragging(campaign.id)} isOver={campaignIsOver(campaign.id)} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function AdsStructure({ nodes, onChange, loadedAds, onExport, exporting }: {
  nodes: StructureNode[]; onChange: (nodes: StructureNode[]) => void;
  loadedAds: AdData[];
  savedLists?: { id: string; name: string; adIds: string[]; createdAt: number }[];
  onExport: () => void; exporting: boolean;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  function updateNode(id: string, patch: Partial<StructureNode>) {
    function walk(list: StructureNode[]): StructureNode[] {
      return list.map(n => n.id === id ? { ...n, ...patch } : { ...n, children: walk(n.children) });
    }
    onChange(walk(nodes));
  }
  function removeNode(id: string) {
    function walk(list: StructureNode[]): StructureNode[] {
      return list.filter(n => n.id !== id).map(n => ({ ...n, children: walk(n.children) }));
    }
    onChange(walk(nodes));
  }
  function addPlatform() {
    onChange([...nodes, { id: uid(), type: "platform", name: "Facebook Ads", children: [] }]);
  }

  return (
    <DragCtx.Provider value={{ dragId, overId, setDragId, setOverId }}>
      <ExportCtx.Provider value={exporting}>
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderBottom: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>
            <button onClick={addPlatform} style={toolBtn("#2563eb")}>+ Platform</button>
            <div style={{ flex: 1 }} />
            <button onClick={onExport} disabled={exporting || nodes.length === 0} style={toolBtn("#dc2626", exporting || nodes.length === 0)}>
              {exporting ? "Exporting..." : "Export รูป"}
            </button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 40, background: "#f9fafb" }}>
            <div id="structure-chart" style={{ display: "inline-block", minWidth: "100%", padding: 40 }}>
              {nodes.length === 0
                ? <div style={{ textAlign: "center", color: "#9ca3af", padding: 60, fontSize: 14 }}>กด <strong>+ Platform</strong> เพื่อเริ่มสร้าง Ads Structure</div>
                : <div style={{ display: "flex", justifyContent: "center", gap: 80 }}>
                    {nodes.map(platform => (
                      <PlatformNode key={platform.id} node={platform} loadedAds={loadedAds}
                        onUpdate={p => updateNode(platform.id, p)} onRemove={() => removeNode(platform.id)} />
                    ))}
                  </div>}
            </div>
          </div>
        </div>
      </ExportCtx.Provider>
    </DragCtx.Provider>
  );
}

function toolBtn(color: string, disabled = false): React.CSSProperties {
  return { background: disabled ? "#d1d5db" : color, color: "#fff", border: "none", borderRadius: 6, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 };
}
