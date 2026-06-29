"use client";

import { useState, useRef } from "react";
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

export default function Home() {
  const [token, setToken] = useState("");
  const [adIdsInput, setAdIdsInput] = useState("");
  const [ads, setAds] = useState<AdData[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportMode, setExportMode] = useState(false);
  const slideRef = useRef<HTMLDivElement>(null);

  async function handleLoad() {
    const ids = adIdsInput.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!ids.length || !token.trim()) return;
    setLoading(true);
    setAds([]);
    setCurrentIndex(0);
    const results: AdData[] = [];
    for (let i = 0; i < ids.length; i++) {
      setStatus(`กำลังโหลด ${i + 1}/${ids.length}...`);
      try {
        const res = await fetch(`/api/ads?adId=${ids[i].trim()}&token=${encodeURIComponent(token.trim())}`);
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
    setStatus("");
    setLoading(false);
  }

  async function handleExportPDF() {
    if (!ads.length) return;
    setExporting(true);
    setExportMode(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const { default: html2canvas } = await import("html2canvas-pro");
      // A4 landscape
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = 297;
      const pageH = 210;

      for (let i = 0; i < ads.length; i++) {
        setCurrentIndex(i);
        setStatus(`กำลัง render หน้า ${i + 1}/${ads.length}...`);
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
      pdf.save("ad-preview.pdf");
      setCurrentIndex(0);
      setStatus("✅ Export PDF สำเร็จ");
    } catch (e) {
      console.error(e);
      setStatus("❌ Export ล้มเหลว");
    } finally {
      setExporting(false);
      setExportMode(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-black">Ad Preview</h1>
        </div>
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
      </div>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Sidebar */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col p-5 gap-4 overflow-y-auto flex-shrink-0">
          <div>
            <label className="block text-sm font-medium text-black mb-1.5">Access Token</label>
            <input
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="EAAj..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1.5">Ad IDs</label>
            <textarea
              value={adIdsInput}
              onChange={e => setAdIdsInput(e.target.value)}
              placeholder={"120218xxxxxxxxx\n120219xxxxxxxxx\n120220xxxxxxxxx"}
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
                {status || "กำลังโหลด..."}
              </>
            ) : "โหลด Ads"}
          </button>

          {ads.length > 0 && (
            <div className="flex flex-col gap-1 mt-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{ads.length} Ads</p>
              {ads.map((ad, i) => (
                <button
                  key={ad.id}
                  onClick={() => setCurrentIndex(i)}
                  className={`text-left px-3 py-2.5 rounded-lg text-sm transition-colors border ${
                    currentIndex === i
                      ? "bg-blue-50 border-blue-300 text-blue-800 font-medium"
                      : "border-transparent hover:bg-gray-50 text-black"
                  }`}
                >
                  <div className="font-medium truncate">{i + 1}. {ad.name}</div>
                  {ad.campaign && <div className="text-xs text-gray-400 truncate mt-0.5">{ad.campaign}</div>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main area */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
          {ads.length === 0 ? (
            <div className="text-center text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">ใส่ Token และ Ad IDs แล้วกด "โหลด Ads"</p>
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

              {status && <p className="mt-4 text-sm text-black">{status}</p>}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
