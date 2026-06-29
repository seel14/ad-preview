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
  const headline = linkData?.name ?? videoData?.title ?? creative.title ?? ad.name;
  const description = linkData?.description ?? "";
  const imageUrl = linkData?.picture ?? videoData?.image_url ?? creative.image_url ?? creative.thumbnail_url ?? "";
  const cta = creative.call_to_action_type?.replace(/_/g, " ") ?? "";

  return (
    <div className="bg-white rounded-2xl shadow-lg" style={{ width: 480 }}>
      {/* Slide header */}
      <div className="bg-gray-900 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-medium">#{index + 1}</span>
          <span className="text-gray-300 text-sm truncate max-w-[260px]">{ad.name}</span>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor(ad.status)}`}>
          {ad.status}
        </span>
      </div>

      {/* Campaign info */}
      {(ad.campaign || ad.adset) && (
        <div className="bg-gray-50 border-b border-gray-100 px-5 py-2 flex gap-4 text-xs text-gray-500">
          {ad.campaign && <span>Campaign: <span className="text-gray-700 font-medium">{ad.campaign}</span></span>}
          {ad.adset && <span>Ad Set: <span className="text-gray-700 font-medium">{ad.adset}</span></span>}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(["facebook", "custom"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "facebook" ? "Facebook Preview" : "Custom Preview"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-5">
        {tab === "facebook" ? (
          <div className="flex justify-center">
            {ad.previewHtml ? (() => {
              const srcMatch = ad.previewHtml.match(/src="([^"]+)"/);
              const iframeSrc = srcMatch ? srcMatch[1].replace(/&amp;/g, "&") : null;
              return iframeSrc ? (
                <iframe
                  src={iframeSrc}
                  width="100%"
                  height="700"
                  style={{ border: "none", borderRadius: 8 }}
                  scrolling="no"
                />
              ) : (
                <div
                  className="rounded-lg overflow-auto"
                  dangerouslySetInnerHTML={{ __html: ad.previewHtml }}
                  style={{ maxWidth: "100%" }}
                />
              );
            })() : (
              <div className="text-sm text-gray-400 py-12 text-center">ไม่มี preview จาก Facebook</div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Simulated Facebook post */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Post header */}
              <div className="flex items-center gap-2 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.514c-1.491 0-1.956.93-1.956 1.887v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-black leading-tight">Your Page</p>
                  <p className="text-xs text-gray-400">Sponsored</p>
                </div>
              </div>

              {/* Post text */}
              {bodyText && (
                <div className="px-4 pb-3 text-sm text-black leading-relaxed whitespace-pre-line">
                  {bodyText.length > 200 ? bodyText.slice(0, 200) + "..." : bodyText}
                </div>
              )}

              {/* Image */}
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt="ad creative"
                  className="w-full object-cover"
                  style={{ maxHeight: 300 }}
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="bg-gray-100 w-full flex items-center justify-center" style={{ height: 200 }}>
                  <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}

              {/* Link card */}
              {(headline || cta) && (
                <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    {headline && <p className="text-sm font-semibold text-black truncate">{headline}</p>}
                    {description && <p className="text-xs text-gray-500 truncate">{description}</p>}
                  </div>
                  {cta && (
                    <div className="flex-shrink-0 bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded whitespace-nowrap">
                      {cta}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
