"use client";

import { useState } from "react";

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

function statusColor(status: string) {
  if (status === "ACTIVE") return "bg-green-100 text-green-700";
  if (status === "PAUSED") return "bg-yellow-100 text-yellow-700";
  if (status === "ERROR") return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
}

export default function SlideView({ ad, index }: { ad: AdData; index: number }) {
  const [tab, setTab] = useState<"facebook" | "custom">("facebook");

  const creative = ad.creative;
  const linkData = creative.object_story_spec?.link_data;
  const videoData = creative.object_story_spec?.video_data;

  const bodyText = linkData?.message ?? videoData?.message ?? creative.body ?? "";
  const headline = linkData?.name ?? videoData?.title ?? creative.title ?? "";
  const imageUrl = linkData?.picture ?? videoData?.image_url ?? creative.image_url ?? creative.thumbnail_url ?? "";
  const cta = creative.call_to_action_type?.replace(/_/g, " ") ?? "";

  const iframeSrc = (() => {
    if (!ad.previewHtml) return null;
    const m = ad.previewHtml.match(/src="([^"]+)"/);
    return m ? m[1].replace(/&amp;/g, "&") : null;
  })();

  // A4 landscape: 297 x 210 mm → at 900px wide → height = 900 * (210/297) = 636px
  const slideW = 900;
  const slideH = Math.round(slideW * (210 / 297));

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Tab switcher outside slide */}
      <div className="flex gap-1 bg-gray-200 rounded-lg p-1">
        {(["facebook", "custom"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "facebook" ? "Facebook Preview" : "Custom Preview"}
          </button>
        ))}
      </div>

      {/* Landscape slide — this is what gets captured for PDF */}
      <div
        className="bg-white shadow-2xl flex flex-row"
        style={{ width: slideW, height: slideH, borderRadius: 8, overflow: "hidden" }}
      >
        {/* Left: preview pane */}
        <div
          className="bg-gray-50 border-r border-gray-200 flex items-start justify-center overflow-hidden"
          style={{ width: Math.round(slideW * 0.45), height: slideH, paddingTop: 8 }}
        >
          {tab === "facebook" ? (
            iframeSrc ? (
              <iframe
                src={iframeSrc}
                width={Math.round(slideW * 0.45) - 16}
                height={slideH - 16}
                style={{ border: "none", borderRadius: 6, background: "white" }}
                scrolling="no"
                allow="autoplay"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300 text-sm">ไม่มี preview</div>
            )
          ) : (
            /* Custom preview — simulated FB post */
            <div className="w-full mx-2 mt-2 border border-gray-200 rounded-xl overflow-hidden bg-white" style={{ maxHeight: slideH - 24 }}>
              {/* post header */}
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.514c-1.491 0-1.956.93-1.956 1.887v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-black leading-tight">Your Page</p>
                  <p className="text-xs text-gray-400">Sponsored</p>
                </div>
              </div>
              {bodyText && (
                <div className="px-3 pb-2 text-xs text-black leading-relaxed whitespace-pre-line">
                  {bodyText.length > 150 ? bodyText.slice(0, 150) + "..." : bodyText}
                </div>
              )}
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="creative" className="w-full object-cover" style={{ maxHeight: 220 }} crossOrigin="anonymous" />
              ) : (
                <div className="bg-gray-100 w-full flex items-center justify-center" style={{ height: 160 }}>
                  <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              {(headline || cta) && (
                <div className="bg-gray-50 border-t border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    {headline && <p className="text-xs font-semibold text-black truncate">{headline}</p>}
                  </div>
                  {cta && <div className="flex-shrink-0 bg-blue-600 text-white text-xs font-semibold px-2 py-1 rounded whitespace-nowrap">{cta}</div>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: info pane */}
        <div className="flex flex-col justify-between flex-1 p-6" style={{ height: slideH }}>
          {/* Top: ad info */}
          <div className="flex flex-col gap-4">
            {/* Status badge */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400 font-medium">AD #{index + 1}</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(ad.status)}`}>
                {ad.status}
              </span>
            </div>

            {/* Ad name */}
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Ad Name</p>
              <p className="text-sm font-bold text-black leading-snug">{ad.name}</p>
            </div>

            {/* Campaign */}
            {ad.campaign && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Campaign</p>
                <p className="text-sm text-black">{ad.campaign}</p>
              </div>
            )}

            {/* Ad Set */}
            {ad.adset && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Ad Set</p>
                <p className="text-sm text-black">{ad.adset}</p>
              </div>
            )}

            {/* Body text preview */}
            {bodyText && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Ad Copy</p>
                <p className="text-sm text-gray-700 leading-relaxed line-clamp-5">{bodyText}</p>
              </div>
            )}

            {/* Headline */}
            {headline && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Headline</p>
                <p className="text-sm font-medium text-black">{headline}</p>
              </div>
            )}

            {/* CTA */}
            {cta && (
              <div className="inline-block">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">CTA</p>
                <span className="text-xs bg-blue-600 text-white px-3 py-1 rounded font-medium">{cta}</span>
              </div>
            )}
          </div>

          {/* Bottom: Ad ID */}
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-300">ID: {ad.id}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
