"use client";

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

  // A4 landscape: 297×210 mm
  const slideW = 960;
  const slideH = Math.round(slideW * (210 / 297));
  const halfW = Math.round(slideW / 2);

  return (
    <div
      className="bg-white shadow-2xl flex flex-row"
      style={{ width: slideW, height: slideH, borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb" }}
    >
      {/* Left: Ad visual */}
      <div
        className="relative bg-gray-100 flex-shrink-0 overflow-hidden"
        style={{ width: halfW, height: slideH }}
      >
        {iframeSrc ? (
          <iframe
            src={iframeSrc}
            width={halfW}
            height={slideH}
            style={{ border: "none", display: "block" }}
            scrolling="no"
            allow="autoplay"
          />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="creative"
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Slide number badge */}
        <div className="absolute top-3 left-3 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-full">
          {index + 1}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-gray-200 flex-shrink-0" />

      {/* Right: Caption */}
      <div className="flex flex-col flex-1 overflow-hidden" style={{ height: slideH }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400 font-medium truncate">{ad.campaign}</p>
            <p className="text-sm font-bold text-black truncate">{ad.name}</p>
          </div>
          <span className={`ml-3 flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(ad.status)}`}>
            {ad.status}
          </span>
        </div>

        {/* Caption body — scrollable so full text shows */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {bodyText ? (
            <p className="text-sm text-black leading-relaxed whitespace-pre-line">{bodyText}</p>
          ) : (
            <p className="text-sm text-gray-300 italic">ไม่มี caption</p>
          )}
        </div>

        {/* Footer: headline + CTA + adset */}
        {(headline || cta || ad.adset) && (
          <div className="border-t border-gray-100 px-6 py-3 flex-shrink-0 flex items-center justify-between gap-3">
            <div className="min-w-0">
              {headline && <p className="text-sm font-semibold text-black truncate">{headline}</p>}
              {ad.adset && <p className="text-xs text-gray-400 truncate">{ad.adset}</p>}
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
  );
}
