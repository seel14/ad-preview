"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import SlideView from "./components/SlideView";
import TokenGuide from "./components/TokenGuide";
import AdsStructure, { type StructureNode } from "./components/AdsStructure";

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
      link_data?: { message?: string; name?: string; description?: string; picture?: string; link?: string };
      video_data?: { message?: string; title?: string; image_url?: string };
    };
  };
  previewHtml: string | null;
  page?: { name: string; picture: string } | null;
}

interface SavedList {
  id: string;
  name: string;
  adIds: string[];
  createdAt: number;
}

interface Project {
  id: string;
  name: string;
  token: string;
  adIds: string[];
  savedLists?: SavedList[];
  structure?: StructureNode[];
  createdAt: number;
  updatedAt: number;
}

type Tab = "preview" | "structure";

export default function Home() {
  const { data: session, status } = useSession();

  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("preview");

  const [token, setToken] = useState("");
  const [adIdsInput, setAdIdsInput] = useState("");
  const [saveState, setSaveState] = useState<"" | "saving" | "saved">("");

  const [ads, setAds] = useState<AdData[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportMode, setExportMode] = useState(false);
  const [structureExporting, setStructureExporting] = useState(false);
  const slideRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentProject = projects.find(p => p.id === currentId) ?? null;
  const savedLists = currentProject?.savedLists ?? [];
  const structureNodes = currentProject?.structure ?? [];

  useEffect(() => {
    if (status !== "authenticated") return;
    setProjectsLoading(true);
    fetch("/api/projects")
      .then(r => {
        if (r.status === 503) { setStorageError(true); return []; }
        return r.json();
      })
      .then((data: Project[]) => {
        if (Array.isArray(data)) {
          setProjects(data);
          if (data[0]) selectProject(data[0]);
        }
      })
      .finally(() => setProjectsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function selectProject(p: Project) {
    setCurrentId(p.id);
    setToken(p.token);
    setAdIdsInput(p.adIds.join("\n"));
    setAds([]);
    setCurrentIndex(0);
    setStatusMsg("");
  }

  async function handleNewProject() {
    const name = prompt("ชื่อ Project ใหม่:", "Project ใหม่");
    if (name === null) return;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() || "Untitled" }),
    });
    if (!res.ok) { setStorageError(true); return; }
    const project: Project = await res.json();
    setProjects(prev => [project, ...prev]);
    selectProject(project);
  }

  async function handleDeleteProject(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("ลบ Project นี้?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects(prev => prev.filter(p => p.id !== id));
    if (currentId === id) {
      setCurrentId(null);
      setToken("");
      setAdIdsInput("");
      setAds([]);
    }
  }

  async function handleRename(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const p = projects.find(x => x.id === id);
    const name = prompt("เปลี่ยนชื่อ Project:", p?.name ?? "");
    if (name === null) return;
    setProjects(prev => prev.map(x => x.id === id ? { ...x, name } : x));
    await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  const persist = useCallback((tok: string, idsText: string) => {
    if (!currentId) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const adIds = idsText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      await fetch(`/api/projects/${currentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tok, adIds }),
      });
      setProjects(prev => prev.map(p => p.id === currentId ? { ...p, token: tok, adIds } : p));
      setSaveState("saved");
      setTimeout(() => setSaveState(""), 1500);
    }, 800);
  }, [currentId]);

  function onTokenChange(v: string) {
    setToken(v);
    persist(v, adIdsInput);
  }

  function onAdIdsChange(v: string) {
    setAdIdsInput(v);
    persist(token, v);
  }

  async function handleLoad() {
    const lines = adIdsInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return;

    // Separate direct preview URLs from ad IDs
    const isPreviewUrl = (s: string) => /^https?:\/\//i.test(s);
    const previewUrls = lines.filter(isPreviewUrl);
    const adIds = lines.filter(s => !isPreviewUrl(s));

    // Require token only if there are real ad IDs to fetch
    if (adIds.length && !token.trim()) return;

    setLoading(true);
    setAds([]);
    setCurrentIndex(0);
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
      });
    });

    for (let i = 0; i < adIds.length; i++) {
      setStatusMsg(`กำลังโหลด ${i + 1}/${adIds.length}...`);
      try {
        const res = await fetch(`/api/ads?adId=${adIds[i]}&token=${encodeURIComponent(token.trim())}`);
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
    setAds(results);
    setStatusMsg("");
    setLoading(false);
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

    setProjects(prev => prev.map(p => p.id === currentId ? { ...p, savedLists: updated } : p));
    await fetch(`/api/projects/${currentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ savedLists: updated }),
    });
  }

  function handleLoadList(list: SavedList) {
    setAdIdsInput(list.adIds.join("\n"));
    persist(token, list.adIds.join("\n"));
  }

  async function handleDeleteList(listId: string) {
    if (!currentId) return;
    const updated = savedLists.filter(l => l.id !== listId);
    setProjects(prev => prev.map(p => p.id === currentId ? { ...p, savedLists: updated } : p));
    await fetch(`/api/projects/${currentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ savedLists: updated }),
    });
  }

  // Structure
  async function handleStructureChange(nodes: StructureNode[]) {
    if (!currentId) return;
    setProjects(prev => prev.map(p => p.id === currentId ? { ...p, structure: nodes } : p));
    await fetch(`/api/projects/${currentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structure: nodes }),
    });
  }

  async function handleExportStructure() {
    setStructureExporting(true);
    try {
      const { default: html2canvas } = await import("html2canvas-pro");
      const el = document.getElementById("structure-chart");
      if (!el) return;
      const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#f9fafb", useCORS: true });
      const link = document.createElement("a");
      link.download = `${currentProject?.name ?? "ads"}-structure.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (e) {
      console.error(e);
      alert("Export ล้มเหลว");
    } finally {
      setStructureExporting(false);
    }
  }

  async function handleExportPDF() {
    if (!ads.length) return;
    setExporting(true);
    setExportMode(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: html2canvas } = await import("html2canvas-pro");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = 297;
      const pageH = 210;
      for (let i = 0; i < ads.length; i++) {
        setCurrentIndex(i);
        setStatusMsg(`กำลัง render หน้า ${i + 1}/${ads.length}...`);
        await new Promise(r => setTimeout(r, 800));
        const el = slideRef.current;
        if (!el) continue;
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#ffffff" });
        const imgData = canvas.toDataURL("image/jpeg", 0.95);
        const imgH = (canvas.height / canvas.width) * pageW;
        const yOffset = Math.max(0, (pageH - imgH) / 2);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, yOffset, pageW, Math.min(imgH, pageH));
      }
      const fileName = currentProject?.name ? `${currentProject.name}.pdf` : "ad-preview.pdf";
      pdf.save(fileName);
      setCurrentIndex(0);
      setStatusMsg("✅ Export PDF สำเร็จ");
    } catch (e) {
      console.error(e);
      setStatusMsg("❌ Export ล้มเหลว");
    } finally {
      setExporting(false);
      setExportMode(false);
    }
  }

  // ---- Loading / login states ----
  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg,#eff6ff 0%,#f0f9ff 100%)" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <svg className="animate-spin w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(135deg,#eff6ff 0%,#f0f9ff 100%)" }}>
        <div className="w-full max-w-sm">
          {/* Brand */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-lg" style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Ad Preview</h1>
            <p className="text-sm text-slate-500 mt-1">เครื่องมือดู Preview และ Export โฆษณา Meta</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
            <p className="text-sm font-medium text-slate-700 mb-4 text-center">เข้าสู่ระบบเพื่อเริ่มใช้งาน</p>
            <button
              onClick={() => signIn("google")}
              className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-800 font-medium rounded-xl py-3 text-sm transition-all duration-150 shadow-sm cursor-pointer"
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
  const headerH = 56;
  return (
    <main className="min-h-screen" style={{ background: "#f1f5f9" }}>
      {/* ── Header ── */}
      <header style={{ height: headerH, background: "#fff", borderBottom: "1px solid #e2e8f0" }}
        className="flex items-center justify-between px-5 flex-shrink-0">
        {/* Left: brand + breadcrumb */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)" }}>
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
        <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: "#f1f5f9" }}>
          {(["preview", "structure"] as Tab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 cursor-pointer"
              style={activeTab === tab
                ? { background: "#fff", color: "#1e40af", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }
                : { color: "#64748b" }}>
              {tab === "preview" ? "Ad Preview" : "Ads Structure"}
            </button>
          ))}
        </div>

        {/* Right: actions + user */}
        <div className="flex items-center gap-2">
          {activeTab === "preview" && ads.length > 0 && (
            <button onClick={handleExportPDF} disabled={exporting}
              className="flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all duration-150 disabled:opacity-50 cursor-pointer"
              style={{ background: exporting ? "#94a3b8" : "linear-gradient(135deg,#dc2626,#b91c1c)" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {exporting ? "Exporting..." : "Export PDF"}
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
        <aside className="flex flex-col flex-shrink-0" style={{ width: 272, background: "#fff", borderRight: "1px solid #e2e8f0" }}>

          {/* Projects section */}
          <div style={{ padding: "14px 14px 10px", borderBottom: "1px solid #f1f5f9" }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.07em", textTransform: "uppercase" }}>Projects</span>
              <button onClick={handleNewProject}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                style={{ fontSize: 11, fontWeight: 600 }}>
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
                    padding: "7px 8px",
                    background: currentId === p.id ? "#eff6ff" : "transparent",
                    borderLeft: currentId === p.id ? "2px solid #2563eb" : "2px solid transparent",
                  }}>
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    style={{ color: currentId === p.id ? "#2563eb" : "#94a3b8" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                  <span className="flex-1 truncate" style={{ fontSize: 12, fontWeight: currentId === p.id ? 600 : 400, color: currentId === p.id ? "#1e40af" : "#334155" }}>
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
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>Access Token</label>
                  <TokenGuide />
                  <div className="flex-1" />
                  {saveState === "saving" && <span style={{ fontSize: 10, color: "#94a3b8" }}>บันทึก...</span>}
                  {saveState === "saved" && <span style={{ fontSize: 10, color: "#16a34a" }}>✓ บันทึกแล้ว</span>}
                </div>
                <input type="password" value={token} onChange={e => onTokenChange(e.target.value)} placeholder="EAAj..."
                  className="w-full focus:outline-none transition-all duration-150"
                  style={{ fontSize: 12, color: "#0f172a", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", background: "#f8fafc" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#2563eb"; e.currentTarget.style.background = "#fff"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#f8fafc"; }}
                />
              </div>

              {/* Ad IDs */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>Ad IDs / Preview Links</label>
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
              <button onClick={handleLoad}
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
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.07em", textTransform: "uppercase" }}>Saved Lists</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {savedLists.map(list => (
                      <div key={list.id}
                        className="group flex items-center gap-2 rounded-lg transition-colors duration-150"
                        style={{ padding: "7px 8px", border: "1px solid #f1f5f9", background: "#fff" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>
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

                <div ref={slideRef}>
                  <SlideView ad={ads[currentIndex]} index={currentIndex} exportMode={exportMode} />
                </div>

                {statusMsg && (
                  <p style={{ fontSize: 12, color: "#475569", background: "#f8fafc", padding: "6px 14px", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    {statusMsg}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentProject ? (
              <AdsStructure
                nodes={structureNodes}
                onChange={handleStructureChange}
                loadedAds={ads}
                savedLists={savedLists}
                onExport={handleExportStructure}
                exporting={structureExporting}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center" style={{ fontSize: 13, color: "#94a3b8" }}>
                เลือก Project ก่อน
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
