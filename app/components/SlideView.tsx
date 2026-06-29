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

function proxyUrl(url: string) {
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

export default function SlideView({ ad, index, exportMode = false }: { ad: AdData; index: number; exportMode?: boolean }) {
  const creative = ad.creative;
  const linkData = creative.object_story_spec?.link_data;
  const videoData = creative.object_story_spec?.video_data;

  const bodyText = linkData?.message ?? videoData?.message ?? creative.body ?? "";
  const headline = linkData?.name ?? videoData?.title ?? creative.title ?? "";
  const rawImageUrl = linkData?.picture ?? videoData?.image_url ?? creative.image_url ?? creative.thumbnail_url ?? "";
  const cta = creative.call_to_action_type?.replace(/_/g, " ") ?? "";

  // In export mode, proxy the image so html2canvas can capture it (no CORS issue)
  const imageUrl = exportMode && rawImageUrl ? proxyUrl(rawImageUrl) : rawImageUrl;

  const iframeSrc = (() => {
    if (!ad.previewHtml) return null;
    const m = ad.previewHtml.match(/src="([^"]+)"/);
    return m ? m[1].replace(/&amp;/g, "&") : null;
  })();

  // A4 landscape: 297×210 mm → 960×681px
  const slideW = 960;
  const slideH = Math.round(slideW * (210 / 297));
  const halfW = Math.round(slideW / 2);

  // Header + footer heights (px)
  const headerH = 56;
  const footerH = headline || cta || ad.adset ? 56 : 0;
  const bodyH = slideH - headerH - footerH;

  return (
    <div
      className="bg-white shadow-2xl flex flex-row"
      style={{ width: slideW, height: slideH, borderRadius: exportMode ? 0 : 8, overflow: "hidden", border: "1px solid #e5e7eb" }}
    >
      {/* Left: Ad visual */}
      <div className="relative bg-gray-100 flex-shrink-0 overflow-hidden" style={{ width: halfW, height: slideH }}>
        {iframeSrc && !exportMode ? (
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
        <div className="absolute top-3 left-3 bg-black/60 text-white text-xs font-bold px-2 py-1 rounded-full">
          {index + 1}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-gray-200 flex-shrink-0" />

      {/* Right: Caption */}
      <div className="flex flex-col flex-1" style={{ height: slideH, overflow: "hidden" }}>

        {/* Header */}
        <div
          className="flex items-center justify-between px-6 border-b border-gray-100 flex-shrink-0"
          style={{ height: headerH }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400 font-medium truncate">{ad.campaign}</p>
            <p className="text-sm font-bold text-black truncate">{ad.name}</p>
          </div>
          <span className={`ml-3 flex-shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(ad.status)}`}>
            {ad.status}
          </span>
        </div>

        {/* Body: screen = scrollable, export = no scroll, auto font-size */}
        <div
          className="px-6 py-4"
          style={{
            height: bodyH,
            overflowY: exportMode ? "hidden" : "auto",
          }}
        >
          {bodyText ? (
            <p
              className="text-black leading-relaxed whitespace-pre-line"
              style={{
                fontSize: exportMode ? clampFontSize(bodyText, bodyH) : 14,
              }}
            >
              {bodyText}
            </p>
          ) : (
            <p className="text-sm text-gray-300 italic">ไม่มี caption</p>
          )}
        </div>

        {/* Footer */}
        {(headline || cta || ad.adset) && (
          <div
            className="border-t border-gray-100 px-6 flex-shrink-0 flex items-center justify-between gap-3"
            style={{ height: footerH }}
          >
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

// Estimate a font size so the text fits within the available pixel height
function clampFontSize(text: string, containerH: number): number {
  const lineHeight = 1.6;
  const charsPerLine = 38; // approx at 13px in a ~440px wide column
  const lines = text.split("\n").reduce((acc, line) => {
    return acc + Math.max(1, Math.ceil(line.length / charsPerLine));
  }, 0);

  for (let size = 13; size >= 7; size--) {
    const lineH = size * lineHeight;
    const totalH = lines * lineH + 32; // 32 = py-4 padding
    if (totalH <= containerH) return size;
  }
  return 7;
}
