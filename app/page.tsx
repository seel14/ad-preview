"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import SlideView from "./components/SlideView";

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
}

interface Project {
  id: string;
  name: string;
  token: string;
  adIds: string[];
  createdAt: number;
  updatedAt: number;
}

export default function Home() {
  const { data: session, status } = useSession();

  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [storageError, setStorageError] = useState(false);

  const [token, setToken] = useState("");
  const [adIdsInput, setAdIdsInput] = useState("");
  const [saveState, setSaveState] = useState<"" | "saving" | "saved">("");

  const [ads, setAds] = useState<AdData[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportMode, setExportMode] = useState(false);
  const slideRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentProject = projects.find(p => p.id === currentId) ?? null;

  // Load projects on login
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

  // Debounced auto-save of token + adIds to current project
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
    const ids = adIdsInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!ids.length || !token.trim()) return;
    setLoading(true);
    setAds([]);
    setCurrentIndex(0);
    const results: AdData[] = [];
    for (let i = 0; i < ids.length; i++) {
      setStatusMsg(`กำลังโหลด ${i + 1}/${ids.length}...`);
      try {
        const res = await fetch(`/api/ads?adId=${ids[i]}&token=${encodeURIComponent(token.trim())}`);
        const data = await res.json();
        if (data.error) {
          results.push({ id: ids[i], name: `❌ ${data.error}`, status: "ERROR", campaign: "", adset: "", creative: {}, previewHtml: null });
        } else {
          results.push(data);
        }
      } catch {
        results.push({ id: ids[i], name: "❌ โหลดไม่ได้", status: "ERROR", campaign: "", adset: "", creative: {}, previewHtml: null });
      }
    }
    setAds(results);
    setStatusMsg("");
    setLoading(false);
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
      <main className="min-h-screen flex items-center justify-center bg-gray-100">
        <svg className="animate-spin w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-black mb-1">Ad Preview</h1>
          <p className="text-sm text-gray-500 mb-6">เข้าสู่ระบบเพื่อจัดการ Projects</p>
          <button
            onClick={() => signIn("google")}
            className="w-full flex items-center justify-center gap-3 border border-gray-300 hover:bg-gray-50 text-black font-medium rounded-xl py-3 text-sm transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            เข้าสู่ระบบด้วย Google
          </button>
        </div>
      </main>
    );
  }

  // ---- Authenticated app ----
  return (
    <main className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-black">Ad Preview</h1>
          {currentProject && <span className="text-sm text-gray-400">/ {currentProject.name}</span>}
        </div>
        <div className="flex items-center gap-3">
          {ads.length > 0 && (
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export PDF
            </button>
          )}
          <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
            {session?.user?.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />
            )}
            <button onClick={() => signOut()} className="text-xs text-gray-400 hover:text-red-500 transition-colors">
              ออกจากระบบ
            </button>
          </div>
        </div>
      </div>

      {storageError && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2 text-sm text-yellow-800">
          ⚠️ ยังไม่ได้ตั้งค่า Database (Upstash Redis) — Projects จะยังบันทึกไม่ได้
        </div>
      )}

      <div className="flex h-[calc(100vh-57px)]">
        {/* Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
          {/* Projects list */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Projects</p>
              <button
                onClick={handleNewProject}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                ใหม่
              </button>
            </div>
            <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
              {projectsLoading ? (
                <p className="text-sm text-gray-400 px-2 py-3">กำลังโหลด...</p>
              ) : projects.length === 0 ? (
                <p className="text-sm text-gray-400 px-2 py-3">ยังไม่มี Project — กด "ใหม่"</p>
              ) : (
                projects.map(p => (
                  <div
                    key={p.id}
                    onClick={() => selectProject(p)}
                    className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors border ${
                      currentId === p.id ? "bg-blue-50 border-blue-300" : "border-transparent hover:bg-gray-50"
                    }`}
                  >
                    <svg className={`w-4 h-4 flex-shrink-0 ${currentId === p.id ? "text-blue-600" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                    </svg>
                    <span className={`text-sm flex-1 truncate ${currentId === p.id ? "text-blue-800 font-medium" : "text-black"}`}>
                      {p.name}
                    </span>
                    <button onClick={(e) => handleRename(p.id, e)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-gray-600 transition-opacity">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={(e) => handleDeleteProject(p.id, e)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Editor for current project */}
          {currentProject ? (
            <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-black">Access Token</label>
                  {saveState === "saving" && <span className="text-xs text-gray-400">กำลังบันทึก...</span>}
                  {saveState === "saved" && <span className="text-xs text-green-600">✓ บันทึกแล้ว</span>}
                </div>
                <input
                  type="password"
                  value={token}
                  onChange={e => onTokenChange(e.target.value)}
                  placeholder="EAAj..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-black mb-1.5">Ad IDs</label>
                <textarea
                  value={adIdsInput}
                  onChange={e => onAdIdsChange(e.target.value)}
                  placeholder={"120218xxxxxxxxx\n120219xxxxxxxxx"}
                  rows={8}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">ใส่ทีละบรรทัด หรือคั่นด้วย ,</p>
              </div>

              <button
                onClick={handleLoad}
                disabled={loading || !token.trim() || !adIdsInput.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-lg py-2.5 text-sm transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    {statusMsg || "กำลังโหลด..."}
                  </>
                ) : "โหลด Ads"}
              </button>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-gray-400">
              เลือก Project หรือสร้างใหม่เพื่อเริ่มต้น
            </div>
          )}
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-auto">
          {ads.length === 0 ? (
            <div className="text-center text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">{currentProject ? 'ใส่ Token และ Ad IDs แล้วกด "โหลด Ads"' : "เลือก Project ก่อน"}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-6">
                <button
                  onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                  disabled={currentIndex === 0}
                  className="w-9 h-9 rounded-full bg-white border border-gray-300 flex items-center justify-center disabled:opacity-30 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="text-sm text-black font-medium">{currentIndex + 1} / {ads.length}</span>
                <button
                  onClick={() => setCurrentIndex(i => Math.min(ads.length - 1, i + 1))}
                  disabled={currentIndex === ads.length - 1}
                  className="w-9 h-9 rounded-full bg-white border border-gray-300 flex items-center justify-center disabled:opacity-30 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              <div ref={slideRef}>
                <SlideView ad={ads[currentIndex]} index={currentIndex} exportMode={exportMode} />
              </div>

              {statusMsg && <p className="mt-4 text-sm text-black">{statusMsg}</p>}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
