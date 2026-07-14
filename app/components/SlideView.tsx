"use client";

import { normalizeCreative } from "@/lib/normalizeCreative";

interface ChildAttachment {
  picture?: string;
  link?: string;
  name?: string;
  description?: string;
}

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
        message?: string;
        name?: string;
        description?: string;
        picture?: string;
        link?: string;
        child_attachments?: ChildAttachment[];
      };
      video_data?: { message?: string; title?: string; image_url?: string };
    };
  };
  previewHtml: string | null;
  page?: { name: string; picture: string } | null;
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

export default function SlideView({ ad, index, exportMode = false, albumImages }: { ad: AdData; index: number; exportMode?: boolean; albumImages?: string[] }) {
  const creative = ad.creative;
  const linkData = creative.object_story_spec?.link_data;
  const { body: bodyText, headline, image: rawImageUrl, cta } = normalizeCreative(creative);

  const imageUrl = exportMode && rawImageUrl ? proxyUrl(rawImageUrl) : rawImageUrl;

  const iframeSrc = (() => {
    if (!ad.previewHtml) return null;
    const m = ad.previewHtml.match(/src="([^"]+)"/);
    return m ? m[1].replace(/&amp;/g, "&") : null;
  })();

  const slideW = 960;
  const slideH = Math.round(slideW * (210 / 297));
  const halfW = Math.round(slideW / 2);

  const headerH = 56;
  const footerH = headline || cta || ad.adset ? 56 : 0;
  const bodyH = slideH - headerH - footerH;

  const pageName = ad.page?.name ?? "";
  const pageImage = ad.page?.picture ? (exportMode ? proxyUrl(ad.page.picture) : ad.page.picture) : "";
  const captionSnippet = bodyText.length > 120
    ? bodyText.slice(0, 120).replace(/\n+$/, "")
    : bodyText.split("\n").slice(0, 3).join("\n");

  return (
    <div
      style={{
        width: slideW, height: slideH, display: "flex", flexDirection: "row",
        background: "#fff", overflow: "hidden",
        borderRadius: exportMode ? 0 : 8,
        border: "1px solid #e5e7eb",
        boxShadow: exportMode ? "none" : "0 25px 50px -12px rgba(0,0,0,0.25)",
        fontFamily: "Helvetica, Arial, sans-serif",
      }}
    >
      {/* Left: Ad visual — FB post card in export, iframe on screen */}
      <div style={{ width: halfW, height: slideH, flexShrink: 0, overflow: "hidden", position: "relative", background: exportMode ? "#f0f2f5" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {exportMode ? (
          <div style={{ width: 320, transform: "scale(0.92)", transformOrigin: "center center" }}>
            <FbCard
              pageName={pageName}
              pageImage={pageImage}
              caption={captionSnippet}
              fullCaptionLength={bodyText.length}
              imageUrl={
                albumImages?.length === 1
                  ? (exportMode ? proxyUrl(albumImages[0]) : albumImages[0])
                  : imageUrl
              }
              childAttachments={
                albumImages && albumImages.length >= 2
                  ? albumImages.map(src => ({ picture: exportMode ? proxyUrl(src) : src }))
                  : linkData?.child_attachments
              }
              isAlbumFallback={albumImages?.length === 1}
              headline={headline}
              cta={cta}
              width={320}
            />
          </div>
        ) : iframeSrc ? (
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
          <img src={imageUrl} alt="creative" crossOrigin="anonymous"
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {/* Slide number badge */}
        <div style={{
          position: "absolute", top: 12, left: 12, zIndex: 10,
          background: "rgba(0,0,0,0.6)", color: "#fff",
          fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 12,
        }}>
          {index + 1}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, background: "#e5e7eb", flexShrink: 0 }} />

      {/* Right: Caption */}
      <div style={{ flex: 1, height: slideH, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{
          height: headerH, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 24px", borderBottom: "1px solid #f3f4f6", flexShrink: 0,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#000", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{ad.name}</p>
          </div>
          <span style={{
            marginLeft: 12, flexShrink: 0, fontSize: 11, fontWeight: 600,
            padding: "2px 8px", borderRadius: 9999,
            background: ad.status === "ACTIVE" ? "#dcfce7" : ad.status === "PAUSED" ? "#fef9c3" : "#f3f4f6",
            color: ad.status === "ACTIVE" ? "#15803d" : ad.status === "PAUSED" ? "#a16207" : "#4b5563",
          }}>
            {ad.status}
          </span>
        </div>

        {/* Body */}
        <div style={{
          height: bodyH, padding: "16px 24px",
          overflowY: exportMode ? "hidden" : "auto",
        }}>
          {bodyText ? (
            <p style={{
              color: "#000", lineHeight: 1.6, whiteSpace: "pre-line", margin: 0,
              fontSize: exportMode ? clampFontSize(bodyText, bodyH) : 14,
            }}>
              {bodyText}
            </p>
          ) : (
            <p style={{ fontSize: 13, color: "#d1d5db", fontStyle: "italic", margin: 0 }}>ไม่มี caption</p>
          )}
        </div>

        {/* Footer */}
        {(headline || cta || ad.adset) && (
          <div style={{
            height: footerH, borderTop: "1px solid #f3f4f6", padding: "0 24px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0,
          }}>
            <div style={{ minWidth: 0 }}>
              {headline && <p style={{ fontSize: 13, fontWeight: 600, color: "#000", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{headline}</p>}
              {ad.adset && <p style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>{ad.adset}</p>}
            </div>
            {cta && (
              <div style={{ flexShrink: 0, background: "#2563eb", color: "#fff", fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 4, whiteSpace: "nowrap" }}>
                {cta}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* Album grid — replicates Facebook's 2×2 photo mosaic */
function AlbumGrid({ images, width }: { images: string[]; width: number }) {
  const size = width; // square grid same as card width
  const cellSize = size / 2;
  // Show max 4 cells; last cell gets "+N" overlay if more
  const show = images.slice(0, 4);
  const extra = images.length - 4;

  return (
    <div style={{ width: size, height: size, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, background: "#e4e6eb", flexShrink: 0 }}>
      {show.map((src, i) => {
        const isLast = i === show.length - 1 && extra > 0;
        return (
          <div key={i} style={{ position: "relative", width: cellSize - 1, height: cellSize - 1, overflow: "hidden", background: "#f0f2f5" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" crossOrigin="anonymous"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {isLast && (
              <div style={{
                position: "absolute", inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, fontWeight: 700, color: "#fff",
              }}>
                +{extra}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* Facebook mobile feed card — used only in export mode */
function FbCard({ pageName, pageImage, caption, fullCaptionLength, imageUrl, childAttachments, isAlbumFallback, headline, cta, width }: {
  pageName: string; pageImage: string; caption: string; fullCaptionLength: number;
  imageUrl: string; childAttachments?: ChildAttachment[]; isAlbumFallback?: boolean; headline: string; cta: string; width: number;
}) {
  const ctaLabel = cta
    ? cta.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
    : "";

  const albumImages = (childAttachments ?? []).map(a => a.picture).filter(Boolean) as string[];
  const isAlbum = albumImages.length >= 2;

  return (
    <div style={{ width, display: "flex", flexDirection: "column", background: "#fff", overflow: "hidden", fontFamily: "Helvetica, Arial, sans-serif", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}>
      {/* Page header */}
      <div style={{ height: 52, display: "flex", alignItems: "center", padding: "0 14px", gap: 10 }}>
        {pageImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pageImage} alt="" crossOrigin="anonymous"
            style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "1px solid #e4e6eb" }} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#e4e6eb" }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#050505", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {pageName || "Page"}
          </div>
          <div style={{ fontSize: 11, color: "#65676b", lineHeight: 1.2 }}>
            Sponsored · <span style={{ fontSize: 10 }}>🌐</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#65676b" }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>···</span>
          <span style={{ fontSize: 18, fontWeight: 300 }}>✕</span>
        </div>
      </div>

      {/* Caption snippet */}
      {caption && (
        <div style={{ padding: "0 14px 8px", fontSize: 13, color: "#050505", lineHeight: 1.4 }}>
          <span style={{ whiteSpace: "pre-line" }}>{caption}</span>
          {fullCaptionLength > 120 && (
            <span style={{ color: "#65676b", fontSize: 13 }}> ...see more</span>
          )}
        </div>
      )}

      {/* Ad image — album grid, single, or album placeholder */}
      {isAlbum ? (
        <AlbumGrid images={albumImages} width={width} />
      ) : isAlbumFallback ? (
        /* Album post: full image not available without pages_read_engagement — show clean placeholder */
        <div style={{ aspectRatio: "1/1", background: "#e4e6eb", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#90949c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <div style={{ fontSize: 11, color: "#65676b", fontWeight: 600, letterSpacing: 0.2 }}>ALBUM POST</div>
          <div style={{ fontSize: 10, color: "#90949c", textAlign: "center", maxWidth: 160, lineHeight: 1.4 }}>
            รูปภาพ album ไม่สามารถแสดงได้<br/>ในโหมด export
          </div>
        </div>
      ) : (
        <div style={{ aspectRatio: "1/1", overflow: "hidden", background: "#f0f2f5", flexShrink: 0 }}>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" crossOrigin="anonymous"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#bcc0c4", fontSize: 12 }}>
              No image
            </div>
          )}
        </div>
      )}

      {/* CTA bar (headline + button) */}
      {(headline || cta) && (
        <div style={{
          height: 48, display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 14px", background: "#f0f2f5", borderTop: "1px solid #e4e6eb",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "#65676b", textTransform: "uppercase", letterSpacing: 0.3 }}>FORM</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#050505", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {headline}
            </div>
          </div>
          {ctaLabel && (
            <div style={{
              marginLeft: 10, background: "#e4e6eb", color: "#050505",
              fontSize: 13, fontWeight: 700, padding: "7px 16px", borderRadius: 6,
              whiteSpace: "nowrap", border: "1px solid #ccd0d5",
            }}>
              {ctaLabel}
            </div>
          )}
        </div>
      )}

      {/* Like / Comment actions */}
      <div style={{
        height: 40, display: "flex", alignItems: "center",
        borderTop: "1px solid #e4e6eb", padding: "0 14px",
      }}>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#65676b" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 9V5a3 3 0 00-6 0v4H5a2 2 0 00-2 2v1.2l1.8 7.2a1 1 0 001 .6H15" />
            <path d="M18 9h3a1 1 0 011 1v8a1 1 0 01-1 1h-3V9z" />
          </svg>
          Like
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#65676b" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#65676b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          Comment
        </div>
      </div>
    </div>
  );
}

function clampFontSize(text: string, containerH: number): number {
  const lineHeight = 1.6;
  const charsPerLine = 38;
  const lines = text.split("\n").reduce((acc, line) => {
    return acc + Math.max(1, Math.ceil(line.length / charsPerLine));
  }, 0);

  for (let size = 13; size >= 7; size--) {
    const lineH = size * lineHeight;
    const totalH = lines * lineH + 32;
    if (totalH <= containerH) return size;
  }
  return 7;
}
