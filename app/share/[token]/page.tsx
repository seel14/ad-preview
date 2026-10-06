"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import AdsStructure, { type StructureNode } from "../../components/AdsStructure";
import { TargetSlide } from "../../components/TargetView";
import Timeline, { type TimelineEntry } from "../../components/Timeline";
import type { AdsetTarget } from "@/lib/targets";
import { normalizeCreative, type RawCreative } from "@/lib/normalizeCreative";

interface ShareAd {
  id: string;
  name: string;
  creative?: RawCreative;
  previewHtml?: string | null;
}
interface AdEdit { body?: string; headline?: string; description?: string }
type AdEdits = Record<string, AdEdit>;

interface ShareData {
  projectName: string;
  scope: "both" | "preview" | "structure" | "none";
  includeTarget: boolean;
  targets: AdsetTarget[];
  includeTimeline: boolean;
  timeline: TimelineEntry[];
  status: "idle" | "pending";
  clientName: string;
  ads: ShareAd[];
  structure: StructureNode[];
  adEdits: AdEdits;
}

const uid = () => Math.random().toString(36).slice(2, 10);

// ── Tree helpers (immutable) ────────────────────────────────────────────────

function mapTree(nodes: StructureNode[], id: string, fn: (n: StructureNode) => StructureNode): StructureNode[] {
  return nodes.map(n => n.id === id ? fn(n) : { ...n, children: mapTree(n.children ?? [], id, fn) });
}
function removeFromTree(nodes: StructureNode[], id: string): StructureNode[] {
  return nodes.filter(n => n.id !== id).map(n => ({ ...n, children: removeFromTree(n.children ?? [], id) }));
}
function moveInTree(nodes: StructureNode[], id: string, dir: -1 | 1): StructureNode[] {
  const i = nodes.findIndex(n => n.id === id);
  if (i >= 0) {
    const j = i + dir;
    if (j < 0 || j >= nodes.length) return nodes;
    const next = [...nodes];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  }
  return nodes.map(n => ({ ...n, children: moveInTree(n.children ?? [], id, dir) }));
}

// ── Structure editor ─────────────────────────────────────────────────────────

interface Ops {
  rename: (id: string, name: string) => void;
  setMeta: (id: string, key: string, value: string) => void;
  remove: (id: string, label: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  add: (parentId: string, child: StructureNode) => void;
  ads: ShareAd[];
}

const TYPE_STYLE: Record<StructureNode["type"], { bg: string; fg: string; label: string }> = {
  platform: { bg: "#1877f2", fg: "#fff", label: "Platform" },
  campaign: { bg: "#1e40af", fg: "#fff", label: "Campaign" },
  adset: { bg: "#bfdbfe", fg: "#1e3a8a", label: "Ad Set" },
  ad: { bg: "#f1f5f9", fg: "#334155", label: "Ad" },
};

function AddAd({ parentId, label, ops }: { parentId: string; label: string; ops: Ops }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const addNode = (name: string, ad?: ShareAd) => {
    const thumb = ad?.creative ? normalizeCreative(ad.creative).image : "";
    ops.add(parentId, { id: uid(), type: "ad", name, meta: ad ? { adId: ad.id, thumbnailUrl: thumb } : {}, children: [] });
    setOpen(false);
    setCustom("");
  };
  if (!open) {
    return <button onClick={() => setOpen(true)} className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50">{label}</button>;
  }
  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white p-2 flex flex-col gap-2">
      {ops.ads.length > 0 && (
        <select defaultValue="" onChange={e => { const ad = ops.ads.find(a => a.id === e.target.value); if (ad) addNode(ad.name, ad); }}
          className="text-xs border border-slate-200 rounded-md px-2 py-1.5">
          <option value="">เลือกจาก Ads ที่มี...</option>
          {ops.ads.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      )}
      <div className="flex gap-2">
        <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="หรือพิมพ์ชื่อ Ad เอง"
          className="flex-1 min-w-0 text-xs border border-slate-200 rounded-md px-2 py-1.5" />
        <button disabled={!custom.trim()} onClick={() => addNode(custom.trim())}
          className="text-xs px-3 rounded-md bg-blue-600 text-white disabled:bg-slate-300">เพิ่ม</button>
        <button onClick={() => setOpen(false)} className="text-xs px-2 text-slate-400">ยกเลิก</button>
      </div>
    </div>
  );
}

function NodeRow({ node, ops }: { node: StructureNode; ops: Ops }) {
  const st = TYPE_STYLE[node.type];
  const budgetable = node.type === "campaign" || node.type === "adset";
  const thumb = node.meta?.thumbnailUrl;
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl p-2.5 flex flex-col gap-2 sm:flex-row sm:items-center" style={{ background: st.bg, color: st.fg }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {node.type === "ad" && thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="w-9 h-9 rounded-md object-cover shrink-0" />
          )}
          <span className="text-[10px] font-bold uppercase opacity-70 shrink-0">{st.label}</span>
          <input value={node.name} onChange={e => ops.rename(node.id, e.target.value)}
            className="flex-1 min-w-0 text-sm font-semibold rounded-md px-2 py-1 bg-white/20 focus:bg-white focus:text-slate-900 outline-none" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {budgetable && (
            <div className="flex items-center gap-1 text-xs">
              <input value={node.meta?.budget ?? ""} onChange={e => ops.setMeta(node.id, "budget", e.target.value)} placeholder="Budget"
                inputMode="decimal" className="w-20 rounded-md px-2 py-1 bg-white/20 focus:bg-white focus:text-slate-900 outline-none text-center" />
              <span className="opacity-80">Baht/</span>
              <button onClick={() => ops.setMeta(node.id, "budgetPeriod", (node.meta?.budgetPeriod ?? "Day") === "Day" ? "Month" : "Day")}
                className="rounded-md px-2 py-1 bg-white/25 font-bold">{node.meta?.budgetPeriod ?? "Day"}</button>
            </div>
          )}
          {node.type !== "platform" && (
            <div className="flex items-center gap-1 ml-auto">
              <button onClick={() => ops.move(node.id, -1)} aria-label="ขึ้น" className="w-7 h-7 rounded-md bg-white/25 text-xs">▲</button>
              <button onClick={() => ops.move(node.id, 1)} aria-label="ลง" className="w-7 h-7 rounded-md bg-white/25 text-xs">▼</button>
              <button onClick={() => ops.remove(node.id, node.name)} aria-label="ลบ" className="w-7 h-7 rounded-md bg-red-500 text-white text-xs">✕</button>
            </div>
          )}
        </div>
      </div>

      {(node.children.length > 0 || node.type !== "ad") && (
        <div className="ml-3 pl-3 sm:ml-5 sm:pl-4 border-l-2 border-slate-200 flex flex-col gap-2">
          {node.children.map(c => <NodeRow key={c.id} node={c} ops={ops} />)}
          <div className="flex flex-wrap gap-2">
            {node.type === "platform" && (
              <button onClick={() => ops.add(node.id, { id: uid(), type: "campaign", name: "New Campaign", meta: { budgetPeriod: "Day" }, children: [] })}
                className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50">+ Campaign</button>
            )}
            {node.type === "campaign" && (
              <>
                <button onClick={() => ops.add(node.id, { id: uid(), type: "adset", name: "New Ad Set", meta: {}, children: [] })}
                  className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50">+ Ad Set</button>
                <AddAd parentId={node.id} label="+ Shared Ad" ops={ops} />
              </>
            )}
            {node.type === "adset" && <AddAd parentId={node.id} label="+ Ad" ops={ops} />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ad preview cards ─────────────────────────────────────────────────────────

function AutoTextarea({ value, onChange, minHeight = 200 }: { value: string; onChange: (v: string) => void; minHeight?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight + 2, minHeight)}px`;
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)}
      className="mt-1 w-full text-[15px] leading-relaxed font-normal text-slate-800 border-2 border-slate-200 focus:border-blue-400 outline-none rounded-lg px-3 py-2.5 resize-y"
      style={{ minHeight }} />
  );
}

function AdCard({ ad, edit, onEdit }: { ad: ShareAd; edit?: AdEdit; onEdit: (e: AdEdit | undefined) => void }) {
  const orig = ad.creative ? normalizeCreative(ad.creative) : { body: "", headline: "", image: "", cta: "" };
  const origDesc = ad.creative?.object_story_spec?.link_data?.description ?? "";
  const iframeSrc = ad.previewHtml?.match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
  const val = (k: keyof AdEdit, o: string) => edit?.[k] ?? o;
  const set = (k: keyof AdEdit, o: string, v: string) => {
    const next = { ...(edit ?? {}) };
    if (v === o) delete next[k]; else next[k] = v;
    onEdit(Object.keys(next).length ? next : undefined);
  };
  const edited = !!edit && Object.keys(edit).length > 0;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
      <div className="bg-slate-100 flex justify-center">
        {iframeSrc ? (
          <iframe src={iframeSrc} title={ad.name} className="w-full max-w-[360px] border-0" style={{ height: 560 }} scrolling="no" />
        ) : orig.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={orig.image} alt={ad.name} className="w-full max-h-[420px] object-contain" />
        ) : <div className="h-40 flex items-center text-slate-400 text-sm">ไม่มีภาพ Preview</div>}
      </div>
      <div className="p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-800 truncate">{ad.name}</div>
          {edited && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 shrink-0">แก้ไขแล้ว</span>}
        </div>
        <label className="text-xs font-bold text-slate-600">Primary text (Caption)
          <AutoTextarea value={val("body", orig.body)} onChange={v => set("body", orig.body, v)} />
        </label>
        <label className="text-xs font-bold text-slate-600">Headline
          <AutoTextarea value={val("headline", orig.headline)} onChange={v => set("headline", orig.headline, v)} minHeight={76} />
        </label>
        <label className="text-xs font-bold text-slate-600">Description
          <AutoTextarea value={val("description", origDesc)} onChange={v => set("description", origDesc, v)} minHeight={100} />
        </label>
        {edited && <button onClick={() => onEdit(undefined)} className="self-start text-xs text-slate-500 underline">คืนค่าเดิม</button>}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"preview" | "structure" | "target" | "timeline">("preview");
  const [targetIdx, setTargetIdx] = useState(0);
  const [vw, setVw] = useState(1200);
  const [structure, setStructure] = useState<StructureNode[]>([]);
  const [adEdits, setAdEdits] = useState<AdEdits>({});
  const [clientName, setClientName] = useState("");
  const [saved, setSaved] = useState<string>("");
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"chart" | "list">("chart");
  const [platformId, setPlatformId] = useState("");

  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then(async r => {
        if (!r.ok) throw new Error(r.status === 404 ? "ลิงก์นี้ไม่ถูกต้องหรือถูกยกเลิกแล้ว" : "โหลดไม่สำเร็จ");
        return r.json() as Promise<ShareData>;
      })
      .then(d => {
        setData(d);
        setStructure(d.structure);
        setAdEdits(d.adEdits ?? {});
        setClientName(d.clientName ?? "");
        setTab(d.scope === "both" || d.scope === "preview" ? "preview" : d.scope === "structure" ? "structure" : d.includeTarget && d.targets.length ? "target" : "timeline");
        setView(window.innerWidth < 768 ? "list" : "chart");
        setPlatformId(d.structure[0]?.id ?? "");
        setInitial(JSON.stringify([d.structure, d.adEdits ?? {}]));
      })
      .catch(e => setError(e.message));
  }, [token]);

  const dirty = useMemo(() => !!data && JSON.stringify([structure, adEdits]) !== initial, [data, structure, adEdits, initial]);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const ops: Ops = useMemo(() => ({
    rename: (id, name) => setStructure(s => mapTree(s, id, n => ({ ...n, name }))),
    setMeta: (id, key, value) => setStructure(s => mapTree(s, id, n => ({ ...n, meta: { ...(n.meta ?? {}), [key]: value } }))),
    remove: (id, label) => { if (confirm(`ลบ "${label}" และรายการย่อยทั้งหมด?`)) setStructure(s => removeFromTree(s, id)); },
    move: (id, dir) => setStructure(s => moveInTree(s, id, dir)),
    add: (parentId, child) => setStructure(s => mapTree(s, parentId, n => ({ ...n, children: [...n.children, child] }))),
    ads: data?.ads ?? [],
  }), [data?.ads]);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch(`/api/share/${token}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ structure, adEdits, clientName }),
      });
      if (!r.ok) throw new Error();
      const { changeCount } = await r.json();
      setInitial(JSON.stringify([structure, adEdits]));
      setSaved(changeCount ? `บันทึกแล้ว — ส่งการแก้ไข ${changeCount} รายการให้ทีมงานเรียบร้อย` : "บันทึกแล้ว (ไม่มีการเปลี่ยนแปลงจากต้นฉบับ)");
    } catch {
      setSaved("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <main className="min-h-screen flex items-center justify-center p-6 text-slate-500">{error}</main>;
  if (!data) return <main className="min-h-screen flex items-center justify-center text-slate-400">กำลังโหลด...</main>;

  const showPreview = data.scope === "both" || data.scope === "preview";
  const showStructure = data.scope === "both" || data.scope === "structure";
  const showTarget = data.includeTarget && data.targets.length > 0;
  const showTimeline = data.includeTimeline && data.timeline.length > 0;
  const tabs = [
    ...(showPreview ? [["preview", "Ad Preview"] as const] : []),
    ...(showStructure ? [["structure", "Ad Structure"] as const] : []),
    ...(showTarget ? [["target", "Target"] as const] : []),
    ...(showTimeline ? [["timeline", "Timeline"] as const] : []),
  ];
  const editable = showPreview || showStructure;
  const slideScale = Math.min(1, (vw - 32) / 960);

  return (
    <main className="min-h-screen bg-slate-50 pb-28">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Ad Review</div>
            <h1 className="text-lg font-bold text-slate-900 truncate">{data.projectName}</h1>
          </div>
          {tabs.length > 1 && (
            <div className="flex bg-slate-100 rounded-xl p-1 self-start sm:self-auto">
              {tabs.map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-lg ${tab === k ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{label}</button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col gap-4">
        {data.status === "pending" && !dirty && !saved && (
          <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3">
            คุณส่งการแก้ไขไปแล้ว รอทีมงานตรวจสอบ — แก้ไขเพิ่มเติมแล้วกดบันทึกได้อีกครั้ง
          </div>
        )}

        {tab === "preview" && showPreview && (
          data.ads.length === 0
            ? <div className="text-center text-slate-400 py-16">ยังไม่มี Ad ให้แสดง</div>
            : <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {data.ads.map(ad => (
                  <AdCard key={ad.id} ad={ad} edit={adEdits[ad.id]}
                    onEdit={e => setAdEdits(prev => { const n = { ...prev }; if (e) n[ad.id] = e; else delete n[ad.id]; return n; })} />
                ))}
              </div>
        )}

        {tab === "timeline" && showTimeline && (
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white" style={{ height: "calc(100vh - 170px)", minHeight: 420 }}>
            <Timeline entries={data.timeline} onChange={() => {}} readOnly />
          </div>
        )}

        {tab === "target" && showTarget && (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => setTargetIdx(i => Math.max(0, i - 1))} disabled={targetIdx === 0} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm disabled:opacity-40">‹</button>
              <span className="text-xs text-slate-500">{targetIdx + 1} / {data.targets.length}</span>
              <button onClick={() => setTargetIdx(i => Math.min(data.targets.length - 1, i + 1))} disabled={targetIdx === data.targets.length - 1} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm disabled:opacity-40">›</button>
              <select value={targetIdx} onChange={e => setTargetIdx(Number(e.target.value))} className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white min-w-0 max-w-full">
                {data.targets.map((t, i) => <option key={t.adsetId} value={i}>{t.adsetName}</option>)}
              </select>
            </div>
            <div style={{ width: 960 * slideScale, height: 679 * slideScale, margin: "0 auto", overflow: "hidden" }}>
              <div style={{ width: 960, transform: `scale(${slideScale})`, transformOrigin: "top left" }}>
                <TargetSlide item={data.targets[targetIdx]} adNames={Object.fromEntries(data.ads.map(a => [a.id, a.name]))} />
              </div>
            </div>
          </>
        )}

        {tab === "structure" && showStructure && (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-slate-500">
                {view === "chart" ? "คลิกที่ชื่อหรืองบเพื่อแก้ไข ลากเพื่อสลับตำแหน่ง ใช้ + และ ✕ เพิ่ม/ลบ" : "แก้ชื่อ งบ ลำดับ เพิ่มหรือลบรายการได้ตามต้องการ"} แล้วกดบันทึกด้านล่าง
              </p>
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {([["chart", "แผนภาพ"], ["list", "รายการ"]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setView(k)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md ${view === k ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}>{label}</button>
                ))}
              </div>
            </div>
            {view === "chart" ? (
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-white" style={{ height: "calc(100vh - 250px)", minHeight: 440 }}>
                <AdsStructure nodes={structure} onChange={setStructure} loadedAds={data.ads as never} onExport={() => {}} exporting={false}
                  activePlatformId={platformId} onActivePlatformChange={setPlatformId} hideExport autoFit />
              </div>
            ) : structure.length === 0 ? (
              <div className="text-center text-slate-400 py-16">ยังไม่มี Ad Structure</div>
            ) : (
              <div className="flex flex-col gap-5">
                {structure.map(n => <NodeRow key={n.id} node={n} ops={ops} />)}
              </div>
            )}
          </>
        )}
      </div>

      {editable && <div className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="ชื่อของคุณ (ไม่บังคับ)"
            className="sm:w-56 text-sm border border-slate-200 rounded-lg px-3 py-2" />
          <div className="flex-1 text-xs text-slate-500 min-h-4">{dirty ? "มีการแก้ไขที่ยังไม่ได้บันทึก" : saved}</div>
          <button onClick={save} disabled={!dirty || saving}
            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 disabled:bg-slate-300">
            {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
          </button>
        </div>
      </div>}
    </main>
  );
}
