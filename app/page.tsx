"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import SlideView from "./components/SlideView";
import TokenGuide from "./components/TokenGuide";
import AdsStructure, { type StructureNode } from "./components/AdsStructure";
import Timeline, { type TimelineEntry } from "./components/Timeline";
import { useFacebookBrowser, type FbAd } from "./hooks/useFacebookBrowser";
import ShareManager from "./components/ShareManager";
import TargetView, { type AdsetTarget } from "./components/TargetView";
import { useProjectPersistence, type Project, type SavedList } from "./hooks/useProjectPersistence";

interface AdData {
  id: string;
  name: string;
  status: string;
  campaign: string;
  adset: string;
  creative: {
    title?: string;
    body?: string;
    image_url?: string;
    thumbnail_url?: string;
    call_to_action_type?: string;
    object_story_spec?: {
      link_data?: {
        message?: string; name?: string; description?: string; picture?: string; link?: string;
        child_attachments?: { picture?: string; link?: string; name?: string; description?: string }[];
      };
      video_data?: { message?: string; title?: string; image_url?: string };
    };
  };
  previewHtml: string | null;
  shareLink?: string | null;
  albumImages?: string[];
  page?: { name: string; picture: string } | null;
}

type Tab = "preview" | "structure" | "timeline" | "target";

// Ad names repeat across ad sets (same creative reused) — collapse to one row per
// unique name, keeping the first Ad ID encountered as the representative to add/load.
function uniqueFbAdsByName(ads: FbAd[]): FbAd[] {
  const seen = new Set<string>();
  const result: FbAd[] = [];
  for (const ad of ads) {
    if (seen.has(ad.name)) continue;
    seen.add(ad.name);
    result.push(ad);
  }
  return result;
}

// jsPDF instance — typed loosely since the library is dynamically imported
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

const PDF_PAGE_W = 297; // landscape A4, mm
const PDF_PAGE_H = 210;

// Adds a canvas as its own page, fit-to-page with padding — used for both the
// single-structure export and the per-platform structure pages in combined export.
function addFittedImagePage(pdf: PdfDoc, canvas: HTMLCanvasElement, isFirstPage: boolean) {
  if (!isFirstPage) pdf.addPage();
  const imgData = canvas.toDataURL("image/jpeg", 0.92);
  const pad = 10;
  const maxW = PDF_PAGE_W - pad * 2;
  const maxH = PDF_PAGE_H - pad * 2;
  const ratio = canvas.width / canvas.height;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  const x = (PDF_PAGE_W - w) / 2;
  const y = (PDF_PAGE_H - h) / 2;
  pdf.addImage(imgData, "JPEG", x, y, w, h);
}

// Adds a centered text divider page — used to separate Saved Lists in a combined export.
function addDividerPage(pdf: PdfDoc, title: string, subtitle: string, isFirstPage: boolean) {
  if (!isFirstPage) pdf.addPage();
  pdf.setFontSize(28);
  pdf.setFont("helvetica", "bold");
  pdf.text(title, PDF_PAGE_W / 2, PDF_PAGE_H * 0.42, { align: "center" });
  pdf.setFontSize(13);
  pdf.setFont("helvetica", "normal");
  pdf.text(subtitle, PDF_PAGE_W / 2, PDF_PAGE_H * 0.52, { align: "center" });
}

// ── Export font ─────────────────────────────────────────────────────────────
type FontCfg =
  | { kind: "default" }
  | { kind: "google"; family: string }
  | { kind: "upload"; family: string; dataUrl: string };

const FONT_KEY = "adPreviewExportFont";
const GOOGLE_FONT_PRESETS = ["Sarabun", "Prompt", "Kanit", "Noto Sans Thai", "Mitr", "Anuphan", "IBM Plex Sans Thai", "Inter", "Poppins"];

let activeExportFont = "";
function exportFontStack(weight: string, px: number) {
  return `${weight} ${px}px ${activeExportFont ? `"${activeExportFont}", ` : ""}Helvetica, Arial, "Thonburi", "Noto Sans Thai", sans-serif`;
}

function loadStylesheet(href: string): Promise<boolean> {
  return new Promise(resolve => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.exportFont = "1";
    const t = setTimeout(() => resolve(false), 6000);
    link.onload = () => { clearTimeout(t); resolve(true); };
    link.onerror = () => { clearTimeout(t); link.remove(); resolve(false); };
    document.head.appendChild(link);
  });
}

// Loads the chosen font and (until the returned cleanup runs) forces it onto the capture targets and canvas text.
async function applyExportFont(cfg: FontCfg): Promise<() => void> {
  activeExportFont = "";
  if (cfg.kind === "default") return () => {};
  const family = cfg.family.replace(/["\\]/g, "");
  try {
    if (cfg.kind === "google") {
      const q = family.replace(/ /g, "+");
      const ok = await loadStylesheet(`https://fonts.googleapis.com/css2?family=${q}:wght@400;700&display=swap`)
        || await loadStylesheet(`https://fonts.googleapis.com/css2?family=${q}&display=swap`);
      if (!ok) throw new Error("font not found");
    } else {
      const face = new FontFace(family, `url(${cfg.dataUrl})`);
      await face.load();
      document.fonts.add(face);
    }
    await Promise.all([
      document.fonts.load(`400 16px "${family}"`, "กA"),
      document.fonts.load(`700 16px "${family}"`, "กA"),
    ]);
  } catch (e) {
    console.error(e);
    alert(`โหลดฟอนต์ "${family}" ไม่สำเร็จ — จะใช้ฟอนต์เริ่มต้นแทน`);
    return () => {};
  }
  activeExportFont = family;
  const style = document.createElement("style");
  style.textContent = `#structure-chart, #structure-chart *, #timeline-chart, #timeline-chart *, #export-slide, #export-slide *, #export-target-slide, #export-target-slide * { font-family: "${family}", Helvetica, Arial, sans-serif !important; }`;
  document.head.appendChild(style);
  return () => { style.remove(); activeExportFont = ""; };
}

const GRID_COLS = 5;

// Renders text to a canvas so Thai titles survive (jsPDF built-in fonts have no Thai glyphs).
function textToCanvas(text: string, px = 64, color = "#0f172a", weight = "bold"): HTMLCanvasElement {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const font = exportFontStack(weight, px);
  ctx.font = font;
  c.width = Math.ceil(ctx.measureText(text).width) + 8;
  c.height = Math.ceil(px * 1.4);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 4, c.height / 2);
  return c;
}

const COVER_KEY = "adPreviewCoverStyle";
interface CoverStyle { enabled: boolean; bg: string; text: string }
const DEFAULT_COVER: CoverStyle = { enabled: true, bg: "#1e40af", text: "#ffffff" };

function formatCoverDate(d = new Date()) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Cover page: project name, then today's date on the next line, centered on a solid background.
function addCoverPage(pdf: PdfDoc, title: string, style: CoverStyle) {
  const [r, g, b] = hexToRgb(style.bg);
  pdf.setFillColor(r, g, b);
  pdf.rect(0, 0, PDF_PAGE_W, PDF_PAGE_H, "F");
  const maxW = PDF_PAGE_W - 40;
  const t = textToCanvas(title, 140, style.text);
  let th = 26;
  let tw = th * (t.width / t.height);
  if (tw > maxW) { tw = maxW; th = tw * (t.height / t.width); }
  const d = textToCanvas(formatCoverDate(), 70, style.text, "normal");
  const dh = 11;
  const dw = dh * (d.width / d.height);
  const y0 = PDF_PAGE_H / 2 - (th + 6 + dh) / 2;
  pdf.addImage(t.toDataURL("image/png"), "PNG", (PDF_PAGE_W - tw) / 2, y0, tw, th);
  pdf.addImage(d.toDataURL("image/png"), "PNG", (PDF_PAGE_W - dw) / 2, y0 + th + 6, dw, dh);
}

// Centered, wrapped (max 2 lines) caption rendered to a canvas so Thai names work in the PDF.
function captionToCanvas(text: string, widthPx = 800, px = 34): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = widthPx;
  c.height = Math.ceil(px * 1.35 * 2) + 8;
  const ctx = c.getContext("2d")!;
  ctx.font = exportFontStack("bold", px);
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const lines: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > widthPx - 16) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  let shown = lines.slice(0, 2);
  if (lines.length > 2) shown[1] = shown[1].slice(0, -1) + "…";
  shown.forEach((l, k) => ctx.fillText(l, widthPx / 2, 4 + k * px * 1.35));
  return c;
}

// One grid page: centered list title on top, up to GRID_COLS ad cards in a row, each with its name above
// and its share link centered underneath.
function addGridPage(pdf: PdfDoc, title: string, cards: { canvas: HTMLCanvasElement; link: string | null; name: string }[], isFirstPage: boolean) {
  if (!isFirstPage) pdf.addPage();
  const pad = 8, gap = 5;
  const t = textToCanvas(title);
  const th = 10;
  const tw = th * (t.width / t.height);
  pdf.addImage(t.toDataURL("image/png"), "PNG", (PDF_PAGE_W - tw) / 2, pad, tw, th);
  const colW = (PDF_PAGE_W - pad * 2 - gap * (GRID_COLS - 1)) / GRID_COLS;
  const nameTop = pad + th + 5;
  cards.forEach((card, i) => {
    const x = pad + i * (colW + gap);
    const cap = captionToCanvas(card.name);
    const capH = colW * (cap.height / cap.width);
    pdf.addImage(cap.toDataURL("image/png"), "PNG", x, nameTop, colW, capH);
    const top = nameTop + capH + 2;
    const maxH = PDF_PAGE_H - top - pad - 7;
    let w = colW;
    let h = w * (card.canvas.height / card.canvas.width);
    if (h > maxH) { h = maxH; w = h * (card.canvas.width / card.canvas.height); }
    const ix = x + (colW - w) / 2;
    pdf.addImage(card.canvas.toDataURL("image/jpeg", 0.92), "JPEG", ix, top, w, h);
    pdf.setDrawColor(226, 232, 240);
    pdf.rect(ix, top, w, h);
    if (card.link) {
      pdf.setFontSize(7);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(0, 102, 204);
      const full = card.link.replace(/^https?:\/\//, "");
      let label = full;
      while (label.length > 4 && pdf.getTextWidth(label) > colW) label = label.slice(0, -2);
      if (label !== full) label += "…";
      pdf.textWithLink(label, x + colW / 2, top + h + 5, { url: card.link, align: "center" });
      pdf.setTextColor(0, 0, 0);
    }
  });
}

// Captures whichever platform is currently active in Ads Structure (#structure-chart
// only ever renders one platform at a time) — shared by the standalone PNG export
// and the "structure" section of renderSectionsToPdf.
async function captureStructureChartCanvas(html2canvas: (typeof import("html2canvas-pro"))["default"]) {
  const el = document.getElementById("structure-chart");
  if (!el) return null;
  return html2canvas(el, { scale: 2, backgroundColor: "#f9fafb", useCORS: true });
}

// The ordered list of things a combined PDF export can contain. One orchestrator
// (renderSectionsToPdf) walks this list instead of each export handler
// re-implementing its own jsPDF/html2canvas/render-wait sequencing.
type ExportSection =
  | { kind: "cover" }
  | { kind: "structure"; platformIds?: string[] }
  | { kind: "timeline" }
  | { kind: "divider"; title: string; subtitle: string }
  | { kind: "ads"; ads: AdData[] }
  | { kind: "grid"; title: string; ads: AdData[] }
  | { kind: "target"; items: AdsetTarget[] };

export default function Home() {
  const { data: session, status } = useSession();

  const [activeTab, setActiveTab] = useState<Tab>("preview");

  const {
    fbConnected, fbAdAccounts, fbSelectedAccount, setFbSelectedAccount, fbAds, fbCampaigns,
    fbCampaignFilter, setFbCampaignFilter, fbAccountSearch, setFbAccountSearch,
    fbCampaignSearch, setFbCampaignSearch, fbStatusFilter, setFbStatusFilter,
    fbAdsLoading, fbSidebarOpen, setFbSidebarOpen,
    connect: handleFbConnect, disconnect: handleFbDisconnect,
  } = useFacebookBrowser(status);

  const {
    projects, currentId, setCurrentId, currentProject, projectsLoading, storageError, saveState,
    newProject, deleteProject, renameProject, patchProject, persistTokenAndAdIds, reloadProjects,
  } = useProjectPersistence(status);

  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [adIdsInput, setAdIdsInput] = useState("");

  const [ads, setAds] = useState<AdData[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportMode, setExportMode] = useState(false);
  const [structureExporting, setStructureExporting] = useState(false);
  const [timelineExporting, setTimelineExporting] = useState(false);
  const [selectedListIds, setSelectedListIds] = useState<Set<string>>(new Set());
  const [combineExporting, setCombineExporting] = useState(false);
  const [activePlatformId, setActivePlatformId] = useState<string>("");
  const [cover, setCover] = useState<CoverStyle>(DEFAULT_COVER);
  const [coverOpen, setCoverOpen] = useState(false);
  const [fontCfg, setFontCfg] = useState<FontCfg>({ kind: "default" });
  const [customFont, setCustomFont] = useState("");
  const [targets, setTargets] = useState<AdsetTarget[]>([]);
  const [targetIndex, setTargetIndex] = useState(0);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState("");
  const [targetExporting, setTargetExporting] = useState(false);
  const [dlgTarget, setDlgTarget] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [dlgOrder, setDlgOrder] = useState<string[]>(["cover", "ads", "folders", "structure", "timeline", "target"]);
  const [dlgAds, setDlgAds] = useState(true);
  const [dlgFolders, setDlgFolders] = useState(false);
  const [dlgStructure, setDlgStructure] = useState(true);
  const [dlgTimeline, setDlgTimeline] = useState(true);
  const [dlgListIds, setDlgListIds] = useState<Set<string>>(new Set());
  const [dlgPlatformIds, setDlgPlatformIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COVER_KEY);
      if (raw) setCover({ ...DEFAULT_COVER, ...JSON.parse(raw) });
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FONT_KEY);
      if (raw) setFontCfg(JSON.parse(raw));
    } catch {}
  }, []);

  function updateFont(cfg: FontCfg) {
    setFontCfg(cfg);
    try { localStorage.setItem(FONT_KEY, JSON.stringify(cfg)); } catch { alert("ไฟล์ฟอนต์ใหญ่เกินกว่าจะจำไว้ในเบราว์เซอร์ — ใช้ได้เฉพาะรอบนี้"); }
  }

  function handleFontUpload(file: File) {
    if (file.size > 3 * 1024 * 1024) { alert("ไฟล์ฟอนต์ใหญ่เกิน 3MB"); return; }
    const reader = new FileReader();
    reader.onload = () => updateFont({ kind: "upload", family: file.name.replace(/\.[^.]+$/, ""), dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  }

  function updateCover(patch: Partial<CoverStyle>) {
    setCover(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(COVER_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const slideRef = useRef<HTMLDivElement>(null);

  const savedLists = currentProject?.savedLists ?? [];
  const structureNodes = currentProject?.structure ?? [];
  const timeline = currentProject?.timeline ?? [];

  // React to the active project changing (selection, creation, or deletion of the
  // active one) by syncing the ad-loading state to match — this is the one place
  // "which project is active" and "what's loaded in the ad preview" are coupled.
  useEffect(() => {
    setToken(currentProject?.token ?? "");
    setAdIdsInput(currentProject?.adIds.join("\n") ?? "");
    setAds((currentProject?.cachedAds as AdData[] | undefined) ?? []);
    setTargets((currentProject?.cachedTargets as AdsetTarget[] | undefined) ?? []);
    setTargetIndex(0);
    setTargetError("");
    setCurrentIndex(0);
    setStatusMsg("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // Keep the active platform tab pointed at a real node — fall back to the first
  // platform whenever the current selection disappears (project switch, deletion, etc.)
  useEffect(() => {
    if (structureNodes.length === 0) { if (activePlatformId) setActivePlatformId(""); return; }
    if (!structureNodes.some(n => n.id === activePlatformId)) setActivePlatformId(structureNodes[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureNodes, currentId]);

  function handleAddFbAd(ad: FbAd) {
    const line = ad.id;
    setAdIdsInput(prev => {
      const existing = prev.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      if (existing.includes(line)) return prev;
      return prev ? `${prev}\n${line}` : line;
    });
  }

  function selectProject(p: Project) {
    setCurrentId(p.id);
  }

  async function handleNewProject() {
    const name = prompt("ชื่อ Project ใหม่:", "Project ใหม่");
    if (name === null) return;
    await newProject(name);
  }

  async function handleDeleteProject(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("ลบ Project นี้?")) return;
    await deleteProject(id);
  }

  async function handleRename(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const p = projects.find(x => x.id === id);
    const name = prompt("เปลี่ยนชื่อ Project:", p?.name ?? "");
    if (name === null) return;
    await renameProject(id, name);
  }

  function onTokenChange(v: string) {
    setToken(v);
    persistTokenAndAdIds(v, adIdsInput);
  }

  function onAdIdsChange(v: string) {
    setAdIdsInput(v);
    persistTokenAndAdIds(token, v);
  }

  // Loads AdData for a list of ad IDs / preview URLs — shared by handleLoad (single list)
  // and combined multi-list export (each Saved List is loaded through this same path).
  async function loadAdsForIds(lines: string[], tok: string, onProgress?: (msg: string) => void): Promise<AdData[]> {
    // Separate direct preview URLs from ad IDs
    const isPreviewUrl = (s: string) => /^https?:\/\//i.test(s);
    const previewUrls = lines.filter(isPreviewUrl);
    const adIds = lines.filter(s => !isPreviewUrl(s));

    const results: AdData[] = [];

    // Add direct preview URLs as instant entries (no API call needed)
    previewUrls.forEach((url, i) => {
      results.push({
        id: `link-${i}`,
        name: `Link Preview ${i + 1}`,
        status: "ACTIVE",
        campaign: "",
        adset: "",
        creative: {},
        previewHtml: `<iframe src="${url}"></iframe>`,
        shareLink: url,
      });
    });

    for (let i = 0; i < adIds.length; i++) {
      onProgress?.(`กำลังโหลด ${i + 1}/${adIds.length}...`);
      try {
        const res = await fetch(`/api/ads?adId=${adIds[i]}&token=${encodeURIComponent(tok.trim())}`);
        const data = await res.json();
        if (data.error) {
          results.push({ id: adIds[i], name: `❌ ${data.error}`, status: "ERROR", campaign: "", adset: "", creative: {}, previewHtml: null });
        } else {
          results.push(data);
        }
      } catch {
        results.push({ id: adIds[i], name: "❌ โหลดไม่ได้", status: "ERROR", campaign: "", adset: "", creative: {}, previewHtml: null });
      }
    }
    return results;
  }

  async function handleLoad(linesOverride?: string[]) {
    const lines = linesOverride ?? adIdsInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return;

    // Require token only if there are real ad IDs (non-URL lines) to fetch
    const hasRealIds = lines.some(s => !/^https?:\/\//i.test(s));
    if (hasRealIds && !token.trim()) return;

    setLoading(true);
    setAds([]);
    setCurrentIndex(0);
    const results = await loadAdsForIds(lines, token, msg => setStatusMsg(msg));
    setAds(results);
    setStatusMsg("");
    setLoading(false);
    await patchProject({ cachedAds: results });
  }

  // Save current ad IDs as a named list (update existing or create new, deduplicate)
  async function handleSaveList() {
    if (!currentId) return;
    const ids = adIdsInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!ids.length) return;

    let updated: SavedList[];
    if (savedLists.length > 0) {
      const listNames = savedLists.map((l, i) => `${i + 1}. ${l.name}`).join("\n");
      const choice = prompt(`อัพเดท List ที่มีอยู่ หรือสร้างใหม่?\n\n${listNames}\n\nใส่หมายเลขเพื่ออัพเดท หรือพิมพ์ชื่อใหม่:`);
      if (!choice) return;
      const idx = parseInt(choice) - 1;
      if (idx >= 0 && idx < savedLists.length) {
        // Update existing — merge & deduplicate
        const existing = savedLists[idx];
        const merged = Array.from(new Set([...existing.adIds, ...ids]));
        updated = savedLists.map((l, i) => i === idx ? { ...l, adIds: merged } : l);
      } else {
        // Create new list with the typed name
        const newList: SavedList = { id: Math.random().toString(36).slice(2, 10), name: choice.trim() || `Ad List ${savedLists.length + 1}`, adIds: ids, createdAt: Date.now() };
        updated = [...savedLists, newList];
      }
    } else {
      const name = prompt("ชื่อ List:", "Ad List 1");
      if (!name) return;
      const newList: SavedList = { id: Math.random().toString(36).slice(2, 10), name, adIds: ids, createdAt: Date.now() };
      updated = [newList];
    }

    await patchProject({ savedLists: updated });
  }

  function handleLoadList(list: SavedList) {
    setAdIdsInput(list.adIds.join("\n"));
    persistTokenAndAdIds(token, list.adIds.join("\n"));
  }

  // Merge + dedupe ad IDs from every checked Saved List into the textarea, then load them all
  function handleLoadSelectedLists() {
    const lists = savedLists.filter(l => selectedListIds.has(l.id));
    if (!lists.length) return;
    const merged = Array.from(new Set(lists.flatMap(l => l.adIds)));
    const text = merged.join("\n");
    setAdIdsInput(text);
    persistTokenAndAdIds(token, text);
    void handleLoad(merged);
  }

  async function handleDeleteList(listId: string) {
    const updated = savedLists.filter(l => l.id !== listId);
    await patchProject({ savedLists: updated });
  }

  // Structure
  async function handleStructureChange(nodes: StructureNode[]) {
    await patchProject({ structure: nodes });
  }

  async function handleTimelineChange(entries: TimelineEntry[]) {
    await patchProject({ timeline: entries });
  }

  // Walks an ordered list of ExportSections, building one PDF. Owns the jsPDF instance,
  // the html2canvas capture loop, and the tab/platform switching + render-wait sequencing
  // that every export handler used to reimplement independently.
  async function renderSectionsToPdf(sections: ExportSection[]) {
    const restoreFont = await applyExportFont(fontCfg);
    try {
      return await renderSectionsToPdfInner(sections);
    } finally {
      restoreFont();
    }
  }

  async function renderSectionsToPdfInner(sections: ExportSection[]) {
    const { default: jsPDF } = await import("jspdf");
    const { default: html2canvas } = await import("html2canvas-pro");
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    let firstPage = true;
    if (cover.enabled && !sections.some(sec => sec.kind === "cover")) {
      addCoverPage(pdf, currentProject?.name || "Ad Preview", cover);
      firstPage = false;
    }
    const prevActiveTab = activeTab;
    const prevActivePlatformId = activePlatformId;

    for (const section of sections) {
      if (section.kind === "cover") {
        if (!firstPage) pdf.addPage();
        addCoverPage(pdf, currentProject?.name || "Ad Preview", cover);
        firstPage = false;
      } else if (section.kind === "structure") {
        const platforms = section.platformIds ? structureNodes.filter(n => section.platformIds!.includes(n.id)) : structureNodes;
        if (platforms.length === 0) continue;
        setStatusMsg("กำลัง render Structure...");
        setStructureExporting(true);
        setActiveTab("structure");
        await new Promise(r => setTimeout(r, 600));
        for (const platform of platforms) {
          setActivePlatformId(platform.id);
          await new Promise(r => setTimeout(r, 400));
          const canvas = await captureStructureChartCanvas(html2canvas);
          if (!canvas) continue;
          addFittedImagePage(pdf, canvas, firstPage);
          firstPage = false;
        }
        setActivePlatformId(prevActivePlatformId);
        setStructureExporting(false);
      } else if (section.kind === "timeline") {
        if (timeline.length === 0) continue;
        setStatusMsg("กำลัง render Timeline...");
        setActiveTab("timeline");
        await new Promise(r => setTimeout(r, 500));
        const el = document.getElementById("timeline-chart");
        if (el) {
          const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
          addFittedImagePage(pdf, canvas, firstPage);
          firstPage = false;
        }
      } else if (section.kind === "divider") {
        addDividerPage(pdf, section.title, section.subtitle, firstPage);
        firstPage = false;
      } else if (section.kind === "target") {
        if (section.items.length === 0) continue;
        setActiveTab("target");
        await new Promise(r => setTimeout(r, 500));
        for (let i = 0; i < section.items.length; i++) {
          setTargetIndex(i);
          setStatusMsg(`กำลัง render Target ${i + 1}/${section.items.length}...`);
          await new Promise(r => setTimeout(r, 600));
          const el = document.getElementById("export-target-slide");
          if (!el) continue;
          const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#f8fafc" });
          const imgH = (canvas.height / canvas.width) * PDF_PAGE_W;
          if (!firstPage) pdf.addPage();
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, Math.max(0, (PDF_PAGE_H - imgH) / 2), PDF_PAGE_W, Math.min(imgH, PDF_PAGE_H));
          firstPage = false;
        }
        setTargetIndex(0);
      } else if (section.kind === "grid") {
        if (section.ads.length === 0) continue;
        setActiveTab("preview");
        setAds(section.ads);
        await new Promise(r => setTimeout(r, 400));
        const cards: { canvas: HTMLCanvasElement; link: string | null; name: string }[] = [];
        for (let i = 0; i < section.ads.length; i++) {
          setCurrentIndex(i);
          setStatusMsg(`กำลัง render ${section.title} ${i + 1}/${section.ads.length}...`);
          await new Promise(r => setTimeout(r, 800));
          const el = slideRef.current;
          if (!el) continue;
          const full = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#ffffff" });
          // Crop to just the ad card (centered in the slide's left half) so it fills the grid cell.
          const halfW = full.width / 2;
          const cropW = Math.floor(halfW * 0.7);
          const cropX = Math.floor((halfW - cropW) / 2);
          const half = document.createElement("canvas");
          half.width = cropW;
          half.height = full.height;
          half.getContext("2d")!.drawImage(full, cropX, 0, cropW, full.height, 0, 0, cropW, full.height);
          const ad = section.ads[i];
          const link = ad.shareLink ?? ad.previewHtml?.match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&") ?? null;
          cards.push({ canvas: half, link, name: ad.name });
        }
        for (let i = 0; i < cards.length; i += GRID_COLS) {
          addGridPage(pdf, section.title, cards.slice(i, i + GRID_COLS), firstPage);
          firstPage = false;
        }
        setCurrentIndex(0);
      } else {
        if (section.ads.length === 0) continue;
        setActiveTab("preview");
        setAds(section.ads);
        await new Promise(r => setTimeout(r, 400));
        for (let i = 0; i < section.ads.length; i++) {
          setCurrentIndex(i);
          setStatusMsg(`กำลัง render Ad ${i + 1}/${section.ads.length}...`);
          await new Promise(r => setTimeout(r, 800));
          const el = slideRef.current;
          if (!el) continue;
          const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#ffffff" });
          const imgData = canvas.toDataURL("image/jpeg", 0.95);
          const imgH = (canvas.height / canvas.width) * PDF_PAGE_W;
          const yOffset = Math.max(0, (PDF_PAGE_H - imgH) / 2);
          if (!firstPage) pdf.addPage();
          pdf.addImage(imgData, "JPEG", 0, yOffset, PDF_PAGE_W, Math.min(imgH, PDF_PAGE_H));
          firstPage = false;
        }
        setCurrentIndex(0);
      }
    }

    setActiveTab(prevActiveTab);
    return pdf;
  }

  async function handleExportTimelinePDF() {
    if (!timeline.length) return;
    setTimelineExporting(true);
    try {
      const pdf = await renderSectionsToPdf([{ kind: "timeline" }]);
      const fileName = exportFileName("Timeline", "pdf");
      pdf.save(fileName);
    } catch (e) {
      console.error(e);
      alert("Export ล้มเหลว");
    } finally {
      setTimelineExporting(false);
    }
  }

  // "<project> - <label> - <YYYY-MM-DD>.<ext>"; empty label = "<project> - <date>"
  function exportFileName(label: string, ext: "pdf" | "png") {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return [currentProject?.name || "Ad Preview", label, date].filter(Boolean).join(" - ") + `.${ext}`;
  }

  async function handleExportStructure(ids: string[], format: "png" | "pdf") {
    setStructureExporting(true);
    const prevActivePlatformId = activePlatformId;
    const selectedPlatforms = structureNodes.filter(n => ids.includes(n.id));
    const restoreFont = await applyExportFont(fontCfg);
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      if (format === "pdf") {
        const { default: jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        let first = true;
        if (cover.enabled) {
          addCoverPage(pdf, currentProject?.name || "Ad Preview", cover);
          first = false;
        }
        for (const platform of selectedPlatforms) {
          setActivePlatformId(platform.id);
          await new Promise(r => setTimeout(r, 400));
          const canvas = await captureStructureChartCanvas(html2canvas);
          if (!canvas) continue;
          if (!first) pdf.addPage();
          first = false;
          const pw = pdf.internal.pageSize.getWidth();
          const ph = pdf.internal.pageSize.getHeight();
          const imgW = canvas.width, imgH = canvas.height;
          const ratio = Math.min(pw / imgW, ph / imgH);
          const w = imgW * ratio, h = imgH * ratio;
          pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pw - w) / 2, (ph - h) / 2, w, h);
        }
        if (!first) {
          const fileName = exportFileName("Structure", "pdf");
          pdf.save(fileName);
        }
      } else {
        for (const platform of selectedPlatforms) {
          setActivePlatformId(platform.id);
          await new Promise(r => setTimeout(r, 400));
          const canvas = await captureStructureChartCanvas(html2canvas);
          if (!canvas) continue;
          const link = document.createElement("a");
          link.download = exportFileName(`Structure - ${platform.name || platform.id}`, "png");
          link.href = canvas.toDataURL("image/png");
          link.click();
        }
      }
    } catch (e) {
      console.error(e);
      alert("Export ล้มเหลว");
    } finally {
      restoreFont();
      setActivePlatformId(prevActivePlatformId);
      setStructureExporting(false);
    }
  }

  async function handleExportPDF() {
    if (!ads.length) return;
    setExporting(true);
    setExportMode(true);
    try {
      const pdf = await renderSectionsToPdf([{ kind: "ads", ads }]);
      const fileName = exportFileName("Ads Preview", "pdf");
      pdf.save(fileName);
      setStatusMsg("✅ Export PDF สำเร็จ");
    } catch (e) {
      console.error(e);
      setStatusMsg("❌ Export ล้มเหลว");
    } finally {
      setExporting(false);
      setExportMode(false);
    }
  }

  async function handleExportCombined() {
    if (!ads.length && structureNodes.length === 0) return;
    setExporting(true);
    setExportMode(true);
    try {
      const pdf = await renderSectionsToPdf([{ kind: "structure" }, { kind: "timeline" }, { kind: "ads", ads }]);
      const fileName = exportFileName("", "pdf");
      pdf.save(fileName);
      setStatusMsg("✅ Export Combined PDF สำเร็จ");
    } catch (e) {
      console.error(e);
      setStatusMsg("❌ Export ล้มเหลว");
    } finally {
      setExporting(false);
      setExportMode(false);
    }
  }

  // Exports the checked Saved Lists as one combined PDF, with a divider page between each list's ads.
  async function handleExportCombinedLists() {
    const lists = savedLists.filter(l => selectedListIds.has(l.id));
    if (!lists.length || !token.trim()) return;

    setCombineExporting(true);
    setExportMode(true);
    try {
      // Load each selected list sequentially, then build one divider+ads section pair per list.
      const sections: ExportSection[] = [];
      for (const list of lists) {
        setStatusMsg(`กำลังโหลด "${list.name}"...`);
        const listAds = await loadAdsForIds(list.adIds, token, msg => setStatusMsg(`${list.name}: ${msg}`));
        sections.push({ kind: "divider", title: list.name, subtitle: `${listAds.length} ads` });
        sections.push({ kind: "ads", ads: listAds });
      }

      const pdf = await renderSectionsToPdf(sections);
      const fileName = exportFileName("", "pdf");
      pdf.save(fileName);
      setStatusMsg("✅ Export Combined PDF สำเร็จ");
    } catch (e) {
      console.error(e);
      setStatusMsg("❌ Export ล้มเหลว");
    } finally {
      setCombineExporting(false);
      setExportMode(false);
      setTimeout(() => setStatusMsg(""), 3000);
    }
  }

  // One PDF with each selected Saved List laid out as a grid (GRID_COLS ads per page) with share links under each ad.
  async function handleExportGridLists() {
    const lists = savedLists.filter(l => selectedListIds.has(l.id));
    if (!lists.length || !token.trim()) return;
    setCombineExporting(true);
    setExportMode(true);
    try {
      const sections: ExportSection[] = [];
      for (const list of lists) {
        setStatusMsg(`กำลังโหลด "${list.name}"...`);
        const listAds = await loadAdsForIds(list.adIds, token, msg => setStatusMsg(`${list.name}: ${msg}`));
        sections.push({ kind: "grid", title: list.name, ads: listAds });
      }
      const pdf = await renderSectionsToPdf(sections);
      pdf.save(exportFileName("Ads Grid", "pdf"));
      setStatusMsg("✅ Export Grid PDF สำเร็จ");
    } catch (e) {
      console.error(e);
      setStatusMsg("❌ Export ล้มเหลว");
    } finally {
      setCombineExporting(false);
      setExportMode(false);
      setTimeout(() => setStatusMsg(""), 3000);
    }
  }

  const targetAdIds = ads.map(a => a.id).filter(id => /^\d+$/.test(id));
  const adNameById: Record<string, string> = Object.fromEntries(ads.map(a => [a.id, a.name]));

  async function fetchTargets() {
    if (!token.trim() || targetAdIds.length === 0) return;
    setTargetLoading(true);
    setTargetError("");
    try {
      const r = await fetch("/api/targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), adIds: targetAdIds }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "ดึง Target ไม่สำเร็จ");
      setTargets(data);
      setTargetIndex(0);
      await patchProject({ cachedTargets: data });
    } catch (e) {
      setTargetError(e instanceof Error ? e.message : "ดึง Target ไม่สำเร็จ");
    } finally {
      setTargetLoading(false);
    }
  }

  async function handleExportTargetPDF() {
    if (!targets.length) return;
    setTargetExporting(true);
    setExportMode(true);
    try {
      const pdf = await renderSectionsToPdf([{ kind: "target", items: targets }]);
      pdf.save(exportFileName("Target", "pdf"));
    } catch (e) {
      console.error(e);
      alert("Export ล้มเหลว");
    } finally {
      setTargetExporting(false);
      setExportMode(false);
    }
  }

  function openExportDialog() {
    setDlgListIds(new Set(savedLists.map(l => l.id)));
    setDlgPlatformIds(new Set(structureNodes.map(n => n.id)));
    setDlgAds(ads.length > 0);
    setDlgFolders(false);
    setDlgStructure(structureNodes.length > 0);
    setDlgTimeline(timeline.length > 0);
    setDlgTarget(targets.length > 0);
    setDlgOpen(true);
  }

  // Builds one PDF from whatever the Export dialog has checked: cover, single ads, folder grids, structure, timeline.
  async function handleExportCustom() {
    const lists = dlgFolders ? savedLists.filter(l => dlgListIds.has(l.id)) : [];
    const platformIds = dlgStructure ? [...dlgPlatformIds] : [];
    const useAds = dlgAds && ads.length > 0;
    const useTimeline = dlgTimeline && timeline.length > 0;
    const useTarget = dlgTarget && targets.length > 0;
    const active: Record<string, boolean> = {
      ads: useAds, folders: lists.length > 0, structure: platformIds.length > 0, timeline: useTimeline, target: useTarget,
    };
    const partLabel: Record<string, string> = { ads: "Ads Preview", folders: "Ads Grid", structure: "Structure", timeline: "Timeline", target: "Target" };
    const parts = dlgOrder.filter(k => active[k]).map(k => partLabel[k]);
    if (parts.length === 0 && !cover.enabled) return;
    if (lists.length && !token.trim()) { alert("ต้องมี Token เพื่อโหลด Ads ใน Folder"); return; }

    setDlgOpen(false);
    setCombineExporting(true);
    setExportMode(true);
    const originalAds = ads;
    try {
      const sections: ExportSection[] = [];
      for (const key of dlgOrder) {
        if (key === "cover" && cover.enabled) sections.push({ kind: "cover" });
        else if (key === "ads" && useAds) sections.push({ kind: "ads", ads });
        else if (key === "folders") {
          for (const list of lists) {
            setStatusMsg(`กำลังโหลด "${list.name}"...`);
            const listAds = await loadAdsForIds(list.adIds, token, msg => setStatusMsg(`${list.name}: ${msg}`));
            sections.push({ kind: "grid", title: list.name, ads: listAds });
          }
        }
        else if (key === "structure" && platformIds.length) sections.push({ kind: "structure", platformIds });
        else if (key === "timeline" && useTimeline) sections.push({ kind: "timeline" });
        else if (key === "target" && useTarget) sections.push({ kind: "target", items: targets });
      }

      const pdf = await renderSectionsToPdf(sections);
      pdf.save(exportFileName(parts.length === 1 ? parts[0] : "", "pdf"));
      setStatusMsg("✅ Export PDF สำเร็จ");
    } catch (e) {
      console.error(e);
      setStatusMsg("❌ Export ล้มเหลว");
    } finally {
      setAds(originalAds);
      setCurrentIndex(0);
      setCombineExporting(false);
      setExportMode(false);
      setTimeout(() => setStatusMsg(""), 3000);
    }
  }

  // ---- Loading / login states ----
  const loginBg = {
    background: "radial-gradient(ellipse at 60% 20%, #dbeafe 0%, #eff6ff 40%, #f0f9ff 100%)",
    backgroundSize: "cover",
  } as const;

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center" style={loginBg}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}>
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.952 9.168-4.837" />
            </svg>
          </div>
          <svg className="animate-spin w-5 h-5" style={{ color: "#2563eb" }} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6" style={loginBg}>
        <div className="w-full max-w-sm">
          {/* Brand */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 8px 24px rgba(37,99,235,0.4)" }}>
              <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.952 9.168-4.837" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold" style={{ color: "#0f172a", letterSpacing: "-0.02em" }}>Ad Preview</h1>
            <p className="text-sm mt-1.5" style={{ color: "#64748b" }}>เครื่องมือดู Preview และ Export โฆษณา Meta</p>
          </div>

          {/* Card */}
          <div className="rounded-2xl p-8" style={{ background: "#fff", boxShadow: "0 4px 24px rgba(15,23,42,0.08), 0 1px 3px rgba(15,23,42,0.06)", border: "1px solid #e2e8f0" }}>
            <p className="text-sm font-medium text-center mb-5" style={{ color: "#475569" }}>เข้าสู่ระบบเพื่อเริ่มใช้งาน</p>
            <button
              onClick={() => signIn("google")}
              className="w-full flex items-center justify-center gap-3 font-medium rounded-xl py-3 text-sm cursor-pointer transition-all duration-150"
              style={{ background: "#fff", border: "1.5px solid #e2e8f0", color: "#1e293b", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#93c5fd"; e.currentTarget.style.background = "#eff6ff"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#fff"; }}
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ---- Authenticated app ----
  const headerH = 60;
  const TAB_META: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "preview", label: "Ad Preview",
      icon: <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>,
    },
    {
      id: "structure", label: "Ads Structure",
      icon: <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16M4 12h10M4 19h6" /></svg>,
    },
    {
      id: "target", label: "Target",
      icon: <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" strokeWidth={2} /><circle cx="12" cy="12" r="4" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M12 1v4M12 19v4M1 12h4M19 12h4" /></svg>,
    },
    {
      id: "timeline", label: "Timeline",
      icon: <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
    },
  ];
  return (
    <main className="min-h-screen" style={{ background: "#f1f5f9" }}>
      {/* ── Header ── */}
      <header style={{ height: headerH, background: "#fff", borderBottom: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
        className="flex items-center justify-between px-5 flex-shrink-0">
        {/* Left: brand + breadcrumb */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 2px 6px rgba(37,99,235,0.35)" }}>
            <svg className="w-4.5 h-4.5 text-white" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <span className="text-sm font-bold text-slate-900 tracking-tight">Ad Preview</span>
          {currentProject && (
            <>
              <span className="text-slate-300 text-sm">/</span>
              <span className="text-sm text-slate-500 truncate max-w-40">{currentProject.name}</span>
            </>
          )}
        </div>

        {/* Center: tabs */}
        <div className="flex items-center gap-0.5 rounded-xl p-1" style={{ background: "#f1f5f9", border: "1px solid #e2e8f0" }}>
          {TAB_META.map(({ id, label, icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer"
              style={activeTab === id
                ? { background: "#fff", color: "#1e40af", boxShadow: "0 1px 4px rgba(0,0,0,0.1)", border: "1px solid #dbeafe" }
                : { color: "#64748b", border: "1px solid transparent" }}>
              <span style={{ color: activeTab === id ? "#2563eb" : "#94a3b8" }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>

        {/* Right: export actions + FB + user */}
        <div className="flex items-center gap-2">

          {currentProject && (
            <ShareManager project={{ id: currentProject.id, name: currentProject.name }} ads={ads} structure={structureNodes}
              onApplied={async () => {
                const data = await reloadProjects();
                const fresh = data?.find(x => x.id === currentId);
                if (fresh?.cachedAds) setAds(fresh.cachedAds as AdData[]);
              }} />
          )}

          {currentProject && (
            <button onClick={openExportDialog} disabled={combineExporting}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
              style={{ color: "#fff", background: "#dc2626", border: "none" }}
              title="เลือกสิ่งที่จะ Export เป็น PDF">
              {combineExporting ? "กำลัง Export..." : "Export PDF"}
            </button>
          )}

          {/* PDF cover page settings */}
          {currentProject && (
            <div style={{ position: "relative" }}>
              <button onClick={() => setCoverOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg cursor-pointer"
                style={{ color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0" }}
                title="ตั้งค่าหน้าปก PDF">
                <span style={{ width: 12, height: 12, borderRadius: 3, background: cover.bg, border: "1px solid #cbd5e1", display: "inline-block" }} />
                หน้าปก
              </button>
              {coverOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setCoverOpen(false)} />
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50, width: 240, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 14 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#334155", fontWeight: 600, marginBottom: 12, cursor: "pointer" }}>
                      <input type="checkbox" checked={cover.enabled} onChange={e => updateCover({ enabled: e.target.checked })} />
                      ใส่หน้าปกใน PDF
                    </label>
                    {([["สีพื้นหลัง", "bg"], ["สีตัวอักษร", "text"]] as const).map(([label, key]) => (
                      <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, opacity: cover.enabled ? 1 : 0.4 }}>
                        <span style={{ fontSize: 12, color: "#64748b" }}>{label}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input type="text" value={cover[key]} disabled={!cover.enabled}
                            onChange={e => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && updateCover({ [key]: e.target.value })}
                            style={{ width: 72, fontSize: 11, padding: "3px 6px", border: "1px solid #e2e8f0", borderRadius: 6, fontFamily: "monospace" }} />
                          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(cover[key]) ? cover[key] : "#000000"} disabled={!cover.enabled}
                            onChange={e => updateCover({ [key]: e.target.value })}
                            style={{ width: 28, height: 24, padding: 0, border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer" }} />
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: 4, aspectRatio: "297 / 210", background: cover.bg, borderRadius: 6, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: cover.text, opacity: cover.enabled ? 1 : 0.4 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, maxWidth: "90%", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentProject.name}</div>
                      <div style={{ fontSize: 9, marginTop: 4 }}>{formatCoverDate()}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Export zone — shown only when there's something to export */}
          {(ads.length > 0 || (activeTab === "timeline" && timeline.length > 0)) && (
            <>
              <div style={{ width: 1, height: 24, background: "#e2e8f0" }} />
              <div className="flex items-center gap-1" style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "3px 4px" }}>
                {ads.length > 0 && (
                  <button onClick={handleExportCombined} disabled={exporting}
                    className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-all duration-150 disabled:opacity-50 cursor-pointer"
                    style={{ color: exporting ? "#94a3b8" : "#6d28d9", background: exporting ? "transparent" : "#ede9fe", border: "none" }}
                    title="Combined PDF (Structure + Ads)">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {exporting ? "..." : "Combined PDF"}
                  </button>
                )}
                {ads.length > 0 && activeTab === "preview" && (
                  <button onClick={handleExportPDF} disabled={exporting}
                    className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-all duration-150 disabled:opacity-50 cursor-pointer"
                    style={{ color: exporting ? "#94a3b8" : "#b91c1c", background: exporting ? "transparent" : "#fee2e2", border: "none" }}
                    title="Export Ads PDF only">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Ads PDF
                  </button>
                )}
                {activeTab === "timeline" && timeline.length > 0 && (
                  <button onClick={handleExportTimelinePDF} disabled={timelineExporting}
                    className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-all duration-150 disabled:opacity-50 cursor-pointer"
                    style={{ color: timelineExporting ? "#94a3b8" : "#b91c1c", background: timelineExporting ? "transparent" : "#fee2e2", border: "none" }}
                    title="Export Timeline PDF">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {timelineExporting ? "..." : "Timeline PDF"}
                  </button>
                )}
              </div>
              <div style={{ width: 1, height: 24, background: "#e2e8f0" }} />
            </>
          )}

          {/* Facebook connect / toggle — opens the right-side account & campaign browser */}
          {!fbConnected ? (
            <button
              onClick={handleFbConnect}
              className="flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer"
              style={{ background: "linear-gradient(135deg,#1877F2,#0a5bb8)" }}>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Connect Facebook
            </button>
          ) : (
            <button
              onClick={() => setFbSidebarOpen(o => !o)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors duration-150 cursor-pointer"
              style={{ background: fbSidebarOpen ? "#eff6ff" : "#f8fafc", color: "#1e40af", border: "1px solid #bfdbfe" }}>
              <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Facebook Ads
              <svg className="w-3 h-3 transition-transform" style={{ transform: fbSidebarOpen ? "rotate(180deg)" : "" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}

          <div className="flex items-center gap-2 pl-3 border-l border-slate-200 ml-1">
            {session?.user?.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="" className="w-7 h-7 rounded-full ring-2 ring-slate-100" />
            )}
            <button onClick={() => signOut()}
              className="text-xs text-slate-400 hover:text-red-500 transition-colors duration-150 cursor-pointer">
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      {/* Storage warning */}
      {storageError && (
        <div className="flex items-center gap-2 px-5 py-2 text-xs font-medium" style={{ background: "#fefce8", borderBottom: "1px solid #fef08a", color: "#854d0e" }}>
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          ยังไม่ได้ตั้งค่า Database — Projects จะยังบันทึกไม่ได้
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex" style={{ height: `calc(100vh - ${headerH}px)` }}>

        {/* ── Sidebar ── */}
        <aside className="flex flex-col flex-shrink-0" style={{ width: 272, background: "#fff", borderRight: "1px solid #e2e8f0", boxShadow: "1px 0 0 #f1f5f9" }}>

          {/* Projects section */}
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid #f1f5f9", background: "#fafbfd" }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Projects</span>
              <button onClick={handleNewProject}
                className="flex items-center gap-1 cursor-pointer"
                style={{ fontSize: 11, fontWeight: 600, color: "#2563eb", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "2px 8px" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#dbeafe"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#eff6ff"; }}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                ใหม่
              </button>
            </div>

            <div className="flex flex-col gap-0.5" style={{ maxHeight: 160, overflowY: "auto" }}>
              {projectsLoading ? (
                <p style={{ fontSize: 12, color: "#94a3b8", padding: "8px 6px" }}>กำลังโหลด...</p>
              ) : projects.length === 0 ? (
                <p style={{ fontSize: 12, color: "#94a3b8", padding: "8px 6px" }}>ยังไม่มี Project — กด &quot;ใหม่&quot;</p>
              ) : projects.map(p => (
                <div key={p.id} onClick={() => selectProject(p)}
                  className="group flex items-center gap-2 rounded-lg cursor-pointer transition-all duration-150"
                  style={{
                    padding: "7px 9px",
                    background: currentId === p.id ? "#eff6ff" : "transparent",
                    border: currentId === p.id ? "1px solid #bfdbfe" : "1px solid transparent",
                  }}
                  onMouseEnter={e => { if (currentId !== p.id) e.currentTarget.style.background = "#f8fafc"; }}
                  onMouseLeave={e => { if (currentId !== p.id) e.currentTarget.style.background = "transparent"; }}>
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    style={{ color: currentId === p.id ? "#2563eb" : "#94a3b8" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                  <span className="flex-1 truncate" style={{ fontSize: 12, fontWeight: currentId === p.id ? 600 : 400, color: currentId === p.id ? "#1e40af" : "#475569" }}>
                    {p.name}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => handleRename(p.id, e)} className="cursor-pointer" style={{ color: "#cbd5e1" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#475569")} onMouseLeave={e => (e.currentTarget.style.color = "#cbd5e1")}>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={e => handleDeleteProject(p.id, e)} className="cursor-pointer" style={{ color: "#cbd5e1" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")} onMouseLeave={e => (e.currentTarget.style.color = "#cbd5e1")}>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Project settings */}
          {currentProject ? (
            <div className="flex-1 flex flex-col overflow-y-auto" style={{ padding: "14px", gap: 14 }}>

              {/* Token */}
              <div>
                <div className="flex items-center mb-1.5">
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#334155" }}>Access Token</label>
                  <TokenGuide />
                  <div className="flex-1" />
                  {saveState === "saving" && <span style={{ fontSize: 10, color: "#94a3b8" }}>บันทึก...</span>}
                  {saveState === "saved" && <span style={{ fontSize: 10, color: "#16a34a" }}>✓ บันทึกแล้ว</span>}
                </div>
                <div className="relative">
                  <input type={showToken ? "text" : "password"} value={token} onChange={e => onTokenChange(e.target.value)} placeholder="EAAj..."
                    className="w-full focus:outline-none transition-all duration-150"
                    style={{ fontSize: 12, color: "#0f172a", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 32px 8px 10px", background: "#f8fafc" }}
                    onFocus={e => { e.currentTarget.style.borderColor = "#2563eb"; e.currentTarget.style.background = "#fff"; }}
                    onBlur={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#f8fafc"; }}
                  />
                  <button type="button" onClick={() => setShowToken(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                    style={{ color: "#94a3b8", background: "none", border: "none", padding: 2, lineHeight: 0 }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#475569")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#94a3b8")}>
                    {showToken ? (
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Ad IDs */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#334155" }}>Ad IDs / Preview Links</label>
                  {adIdsInput.trim() && (
                    <button onClick={handleSaveList} className="cursor-pointer"
                      style={{ fontSize: 10, fontWeight: 600, color: "#2563eb" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#1d4ed8")} onMouseLeave={e => (e.currentTarget.style.color = "#2563eb")}>
                      + Save List
                    </button>
                  )}
                </div>
                <textarea value={adIdsInput} onChange={e => onAdIdsChange(e.target.value)}
                  placeholder={"120218xxxxxxxxx\nhttps://fb.me/adspreview/..."}
                  rows={5} className="w-full focus:outline-none transition-all duration-150 resize-none"
                  style={{ fontSize: 11, fontFamily: "var(--font-geist-mono), monospace", color: "#0f172a", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", background: "#f8fafc", lineHeight: 1.6 }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#2563eb"; e.currentTarget.style.background = "#fff"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#f8fafc"; }}
                />
                <p style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>ใส่ Ad ID หรือ fb.me link ทีละบรรทัด</p>
              </div>

              {/* Load button */}
              <button onClick={() => handleLoad()}
                disabled={loading || !adIdsInput.trim()}
                className="w-full flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-150 cursor-pointer"
                style={{
                  fontSize: 13, padding: "9px 0", color: "#fff",
                  background: (loading || !adIdsInput.trim()) ? "#94a3b8" : "linear-gradient(135deg,#2563eb,#1d4ed8)",
                  boxShadow: (loading || !adIdsInput.trim()) ? "none" : "0 2px 8px rgba(37,99,235,0.3)",
                  cursor: (loading || !adIdsInput.trim()) ? "default" : "pointer",
                }}>
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    {statusMsg || "กำลังโหลด..."}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    โหลด Ads
                  </>
                )}
              </button>

              {/* Saved Lists */}
              {savedLists.length > 0 && (
                <div>
                  <div className="flex items-center mb-2">
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase" }}>Saved Lists</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {savedLists.map(list => (
                      <div key={list.id}
                        className="group flex items-center gap-2 rounded-lg transition-colors duration-150"
                        style={{ padding: "7px 9px", border: "1px solid #e2e8f0", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>
                        <input type="checkbox" className="cursor-pointer flex-shrink-0"
                          checked={selectedListIds.has(list.id)}
                          onChange={e => {
                            setSelectedListIds(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(list.id); else next.delete(list.id);
                              return next;
                            });
                          }}
                        />
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="#94a3b8" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <span onClick={() => handleLoadList(list)} className="flex-1 truncate cursor-pointer"
                          style={{ fontSize: 11, color: "#334155" }}>
                          {list.name}
                          <span style={{ color: "#94a3b8", marginLeft: 4 }}>({list.adIds.length})</span>
                        </span>
                        <button onClick={() => handleDeleteList(list.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          style={{ color: "#cbd5e1" }}
                          onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                          onMouseLeave={e => (e.currentTarget.style.color = "#cbd5e1")}>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  {selectedListIds.size > 0 && (
                    <div className="flex flex-col gap-1.5 mt-2" style={{ padding: "8px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                      <span style={{ fontSize: 10, color: "#64748b" }}>เลือกแล้ว {selectedListIds.size} List</span>
                      <button onClick={handleLoadSelectedLists} disabled={loading}
                        className="font-semibold rounded-md cursor-pointer disabled:opacity-50"
                        style={{ fontSize: 10, padding: "6px 0", color: "#fff", background: loading ? "#94a3b8" : "#2563eb" }}>
                        {loading ? "กำลังโหลด..." : "โหลด Ads ที่เลือกทั้งหมด"}
                      </button>
                      <button onClick={handleExportCombinedLists} disabled={combineExporting}
                        className="font-semibold rounded-md cursor-pointer disabled:opacity-50"
                        style={{ fontSize: 10, padding: "6px 0", color: "#fff", background: combineExporting ? "#94a3b8" : "#dc2626" }}>
                        {combineExporting ? "..." : "Combined PDF"}
                      </button>
                      <button onClick={handleExportGridLists} disabled={combineExporting}
                        className="font-semibold rounded-md cursor-pointer disabled:opacity-50"
                        style={{ fontSize: 10, padding: "6px 0", color: "#fff", background: combineExporting ? "#94a3b8" : "#7c3aed" }}
                        title={`เรียง ${GRID_COLS} Ads ต่อหน้า พร้อมลิงก์ Preview ใต้ Ad`}>
                        {combineExporting ? "..." : `Grid PDF (${GRID_COLS} Ads/หน้า)`}
                      </button>
                      <button onClick={() => setSelectedListIds(new Set())}
                        className="cursor-pointer" style={{ fontSize: 10, color: "#94a3b8", textAlign: "left" }}>
                        ล้างการเลือก
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#f1f5f9" }}>
                <svg className="w-5 h-5" fill="none" stroke="#94a3b8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
              </div>
              <p style={{ fontSize: 12, color: "#94a3b8" }}>เลือก Project หรือสร้างใหม่</p>
            </div>
          )}
        </aside>

        {/* ── Main area ── */}
        {activeTab === "preview" ? (
          <div className="flex-1 flex flex-col items-center justify-center overflow-auto" style={{ padding: 32 }}>
            {ads.length === 0 ? (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: "#f1f5f9" }}>
                  <svg className="w-8 h-8" fill="none" stroke="#cbd5e1" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                  </svg>
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#475569" }}>ยังไม่มี Ads ที่โหลด</p>
                  <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                    {currentProject ? 'ใส่ Ad IDs ในแถบซ้ายแล้วกด "โหลด Ads"' : "เลือก Project ก่อน"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-6">
                {/* Navigator */}
                <div className="flex items-center gap-3">
                  <button onClick={() => setCurrentIndex(i => Math.max(0, i - 1))} disabled={currentIndex === 0}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer disabled:opacity-30"
                    style={{ background: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                    <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  <div className="flex items-center gap-1.5">
                    {ads.map((_, i) => (
                      <button key={i} onClick={() => setCurrentIndex(i)} className="cursor-pointer transition-all duration-150 rounded-full"
                        style={{ width: i === currentIndex ? 20 : 6, height: 6, background: i === currentIndex ? "#2563eb" : "#cbd5e1" }} />
                    ))}
                  </div>

                  <button onClick={() => setCurrentIndex(i => Math.min(ads.length - 1, i + 1))} disabled={currentIndex === ads.length - 1}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 cursor-pointer disabled:opacity-30"
                    style={{ background: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                    <svg className="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 4 }}>{currentIndex + 1} / {ads.length}</span>
                </div>

                <div ref={slideRef} id="export-slide">
                  <SlideView ad={ads[currentIndex]} index={currentIndex} exportMode={exportMode} albumImages={ads[currentIndex].albumImages} />
                </div>

                {statusMsg && (
                  <p style={{ fontSize: 12, color: "#475569", background: "#f8fafc", padding: "6px 14px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    {statusMsg}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : activeTab === "structure" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentProject ? (
              <AdsStructure
                nodes={structureNodes}
                onChange={handleStructureChange}
                loadedAds={ads}
                savedLists={savedLists}
                onExport={handleExportStructure}
                exporting={structureExporting}
                activePlatformId={activePlatformId}
                onActivePlatformChange={setActivePlatformId}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center" style={{ fontSize: 13, color: "#94a3b8" }}>
                เลือก Project ก่อน
              </div>
            )}
          </div>
        ) : activeTab === "target" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentProject ? (
              <TargetView targets={targets} adNames={adNameById} index={targetIndex} onIndexChange={setTargetIndex}
                loading={targetLoading} error={targetError} onFetch={fetchTargets} canFetch={!!token.trim() && targetAdIds.length > 0}
                onExportPdf={handleExportTargetPDF} exporting={targetExporting} exportMode={exportMode} />
            ) : (
              <div className="flex-1 flex items-center justify-center" style={{ fontSize: 13, color: "#94a3b8" }}>
                เลือก Project ก่อน
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentProject ? (
              <Timeline entries={timeline} onChange={handleTimelineChange} projectName={currentProject?.name}
                campaigns={structureNodes.flatMap(pl => pl.children.filter(c => c.type === "campaign").map(c => ({ id: c.id, name: c.name, platform: pl.name })))} />
            ) : (
              <div className="flex-1 flex items-center justify-center" style={{ fontSize: 13, color: "#94a3b8" }}>
                เลือก Project ก่อน
              </div>
            )}
          </div>
        )}

        {/* ── Right panel: Facebook account/campaign browser ── */}
        {fbConnected && fbSidebarOpen && (
          <aside className="flex flex-col flex-shrink-0" style={{ width: 320, background: "#fff", borderLeft: "1px solid #e2e8f0" }}>
            <div className="flex items-center justify-between" style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="#1877F2">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Facebook Ads</span>
              </div>
              <button onClick={() => setFbSidebarOpen(false)} className="cursor-pointer" style={{ color: "#94a3b8" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#475569")} onMouseLeave={e => (e.currentTarget.style.color = "#94a3b8")}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Ad Account selector */}
              {fbAdAccounts.length > 1 && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>Ad Account</label>
                  <input type="text" value={fbAccountSearch} onChange={e => setFbAccountSearch(e.target.value)}
                    placeholder="ค้นหา Account..."
                    style={{ marginTop: 4, fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 10px", color: "#0f172a", background: "#f8fafc", width: "100%" }}
                  />
                  <select
                    value={fbSelectedAccount}
                    onChange={e => setFbSelectedAccount(e.target.value)}
                    style={{ marginTop: 6, fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 10px", color: "#0f172a", background: "#f8fafc", width: "100%" }}>
                    <option value="">เลือก Ad Account...</option>
                    {fbAdAccounts
                      .filter(acc => acc.name.toLowerCase().includes(fbAccountSearch.toLowerCase()))
                      .map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                      ))}
                  </select>
                </div>
              )}
              {fbAdAccounts.length === 1 && (
                <div style={{ fontSize: 12, color: "#475569" }}>
                  <span style={{ fontWeight: 600 }}>Account:</span> {fbAdAccounts[0].name}
                </div>
              )}

              {/* Filters */}
              {fbSelectedAccount && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>Campaign</label>
                    <input type="text" value={fbCampaignSearch} onChange={e => setFbCampaignSearch(e.target.value)}
                      placeholder="ค้นหา Campaign..."
                      style={{ marginTop: 4, fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 10px", color: "#0f172a", background: "#f8fafc", width: "100%" }}
                    />
                    <select
                      value={fbCampaignFilter}
                      onChange={e => setFbCampaignFilter(e.target.value)}
                      style={{ marginTop: 6, fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 10px", color: "#0f172a", background: "#f8fafc", width: "100%" }}>
                      <option value="">ทุก Campaign</option>
                      {fbCampaigns
                        .filter(c => c.name.toLowerCase().includes(fbCampaignSearch.toLowerCase()))
                        .map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>Status</label>
                    <select
                      value={fbStatusFilter}
                      onChange={e => setFbStatusFilter(e.target.value)}
                      style={{ marginTop: 4, fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 10px", color: "#0f172a", background: "#f8fafc", width: "100%" }}>
                      <option value="">ทุก Status</option>
                      <option value="ACTIVE">Active</option>
                      <option value="PAUSED">Paused</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Ads list */}
              {fbSelectedAccount && (
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>Ads</label>
                  <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 5 }}>
                    {fbAdsLoading ? (
                      <p style={{ fontSize: 12, color: "#94a3b8", padding: "6px 2px" }}>กำลังโหลด...</p>
                    ) : fbAds.length === 0 ? (
                      <p style={{ fontSize: 12, color: "#94a3b8", padding: "6px 2px" }}>ไม่มี Ads</p>
                    ) : uniqueFbAdsByName(fbAds).map(ad => {
                      const thumb = ad.creative?.thumbnail_url ?? ad.creative?.image_url;
                      const alreadyAdded = adIdsInput.split(/[\n,]+/).map(s => s.trim()).includes(ad.id);
                      return (
                        <div key={ad.id}
                          className="group flex items-center gap-2 rounded-lg transition-colors duration-150"
                          style={{ padding: "6px 8px", border: "1px solid #f1f5f9", background: "#fff", cursor: "pointer" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#f0f9ff")}
                          onMouseLeave={e => (e.currentTarget.style.background = alreadyAdded ? "#f0fdf4" : "#fff")}>
                          <div style={{ width: 32, height: 32, borderRadius: 5, overflow: "hidden", flexShrink: 0, background: "#e2e8f0" }}>
                            {thumb && <img src={thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad.name}</p>
                            <p style={{ fontSize: 10, color: ad.status === "ACTIVE" ? "#16a34a" : "#94a3b8" }}>{ad.status}</p>
                          </div>
                          <button
                            onClick={() => handleAddFbAd(ad)}
                            disabled={alreadyAdded}
                            style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5, border: "none", cursor: alreadyAdded ? "default" : "pointer",
                              background: alreadyAdded ? "#dcfce7" : "#2563eb", color: alreadyAdded ? "#16a34a" : "#fff", flexShrink: 0 }}>
                            {alreadyAdded ? "✓" : "+"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: "12px 16px", borderTop: "1px solid #f1f5f9", flexShrink: 0 }}>
              <button onClick={handleFbDisconnect}
                style={{ fontSize: 11, color: "#94a3b8", cursor: "pointer", background: "none", border: "none", textAlign: "left", padding: "2px 0" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                onMouseLeave={e => (e.currentTarget.style.color = "#94a3b8")}>
                Disconnect Facebook
              </button>
            </div>
          </aside>
        )}
      </div>
      {dlgOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setDlgOpen(false)}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 400, maxHeight: "85vh", overflowY: "auto", background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 20px 50px rgba(0,0,0,0.25)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Export PDF</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 14 }}>เลือกสิ่งที่ต้องการรวมในไฟล์เดียว (ใช้ปุ่ม ▲▼ เพื่อเรียงลำดับ)</div>

            {dlgOrder.map((key, idx) => {
              const arrows = (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, marginLeft: "auto" }}>
                  {([[-1, "▲"], [1, "▼"]] as const).map(([dir, ch]) => {
                    const off = idx + dir < 0 || idx + dir >= dlgOrder.length;
                    return (
                      <button key={ch} disabled={off} title={dir < 0 ? "เลื่อนขึ้น" : "เลื่อนลง"}
                        onClick={() => setDlgOrder(prev => { const n = [...prev]; [n[idx], n[idx + dir]] = [n[idx + dir], n[idx]]; return n; })}
                        className="cursor-pointer"
                        style={{ fontSize: 8, lineHeight: 1, padding: "3px 6px", border: "1px solid #e2e8f0", borderRadius: 4, background: "#f8fafc", color: off ? "#cbd5e1" : "#475569" }}>{ch}</button>
                    );
                  })}
                </div>
              );
              const row = (label: string, sub: string, checked: boolean, disabled: boolean, onChange: (v: boolean) => void) => (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, flex: 1 }}>
                    <input type="checkbox" style={{ marginTop: 3 }} checked={checked && !disabled} disabled={disabled} onChange={e => onChange(e.target.checked)} />
                    <span><div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{label}</div><div style={{ fontSize: 10, color: "#94a3b8" }}>{sub}</div></span>
                  </label>
                  {arrows}
                </div>
              );
              const sub = (children: React.ReactNode) => <div style={{ margin: "6px 0 0 24px", display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>;
              return (
                <div key={key} style={{ marginBottom: 10 }}>
                  {key === "cover" && row("หน้าปก", "ตั้งสีได้ที่ปุ่ม \"หน้าปก\"", cover.enabled, false, v => updateCover({ enabled: v }))}
                  {key === "ads" && row("Ad Preview รายตัว", ads.length ? `${ads.length} ads ที่โหลดอยู่ (1 ad ต่อหน้า)` : "ยังไม่ได้โหลด Ads", dlgAds, ads.length === 0, setDlgAds)}
                  {key === "folders" && row("Ad Preview Folder", savedLists.length ? "เรียงเป็นตาราง พร้อมลิงก์ Preview" : "ยังไม่มี Saved List", dlgFolders, savedLists.length === 0, setDlgFolders)}
                  {key === "folders" && dlgFolders && sub(savedLists.map(l => (
                    <label key={l.id} style={{ fontSize: 12, color: "#475569", display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={dlgListIds.has(l.id)} onChange={e => setDlgListIds(prev => { const n = new Set(prev); e.target.checked ? n.add(l.id) : n.delete(l.id); return n; })} />
                      {l.name} <span style={{ color: "#94a3b8" }}>({l.adIds.length})</span>
                    </label>
                  )))}
                  {key === "structure" && row("Ads Structure", structureNodes.length ? "เลือก Channel ที่ต้องการ" : "ยังไม่มี Structure", dlgStructure, structureNodes.length === 0, setDlgStructure)}
                  {key === "structure" && dlgStructure && structureNodes.length > 0 && sub(structureNodes.map(n => (
                    <label key={n.id} style={{ fontSize: 12, color: "#475569", display: "flex", gap: 6, alignItems: "center", cursor: "pointer" }}>
                      <input type="checkbox" checked={dlgPlatformIds.has(n.id)} onChange={e => setDlgPlatformIds(prev => { const x = new Set(prev); e.target.checked ? x.add(n.id) : x.delete(n.id); return x; })} />
                      {n.name || "Platform"}
                    </label>
                  )))}
                  {key === "timeline" && row("Ad Timeline", timeline.length ? `${timeline.length} เหตุการณ์` : "ยังไม่มี Timeline", dlgTimeline, timeline.length === 0, setDlgTimeline)}
                  {key === "target" && row("Target (ต่อ Ad Set)", targets.length ? `${targets.length} Ad Set (1 หน้าต่อ Ad Set)` : "ยังไม่ได้ดึง Target (ไปที่แท็บ Target)", dlgTarget, targets.length === 0, setDlgTarget)}
                </div>
              );
            })}

            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 }}>Font</div>
              <select
                value={fontCfg.kind === "default" ? "default" : fontCfg.kind === "upload" ? "__upload" : fontCfg.family}
                onChange={e => {
                  const v = e.target.value;
                  if (v === "default") updateFont({ kind: "default" });
                  else if (v !== "__upload") updateFont({ kind: "google", family: v });
                }}
                style={{ width: "100%", fontSize: 12, padding: "6px 8px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", marginBottom: 8 }}>
                <option value="default">ค่าเริ่มต้น (Helvetica)</option>
                {GOOGLE_FONT_PRESETS.map(f => <option key={f} value={f}>{f} (Google Fonts)</option>)}
                {fontCfg.kind === "google" && !GOOGLE_FONT_PRESETS.includes(fontCfg.family) && <option value={fontCfg.family}>{fontCfg.family} (Google Fonts)</option>}
                {fontCfg.kind === "upload" && <option value="__upload">{fontCfg.family} (ไฟล์ที่อัปโหลด)</option>}
              </select>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <input value={customFont} onChange={e => setCustomFont(e.target.value)} placeholder="ชื่อ Google Font อื่น เช่น Noto Serif Thai"
                  onKeyDown={e => { if (e.key === "Enter" && customFont.trim()) { updateFont({ kind: "google", family: customFont.trim() }); setCustomFont(""); } }}
                  style={{ flex: 1, fontSize: 11, padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: 8 }} />
                <button onClick={() => { if (customFont.trim()) { updateFont({ kind: "google", family: customFont.trim() }); setCustomFont(""); } }}
                  className="cursor-pointer" style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569" }}>ใช้</button>
              </div>
              <label className="cursor-pointer" style={{ fontSize: 11, color: "#2563eb" }}>
                + อัปโหลดไฟล์ฟอนต์ (.ttf .otf .woff .woff2)
                <input type="file" accept=".ttf,.otf,.woff,.woff2" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFontUpload(f); e.target.value = ""; }} />
              </label>
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>ใช้กับหน้าปก ชื่อใน Folder Grid, Ads Preview, Structure และ Timeline</div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDlgOpen(false)} className="cursor-pointer" style={{ fontSize: 12, padding: "7px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#64748b" }}>ยกเลิก</button>
              <button onClick={handleExportCustom} className="cursor-pointer font-semibold"
                disabled={!cover.enabled && !(dlgAds && ads.length) && !(dlgFolders && dlgListIds.size) && !(dlgStructure && dlgPlatformIds.size) && !(dlgTimeline && timeline.length) && !(dlgTarget && targets.length)}
                style={{ fontSize: 12, padding: "7px 16px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", opacity: 1 }}>
                Export
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
