"use client";

// Shown instead of Facebook's English error page when an ad's page post cannot be previewed with the current token.
export default function PreviewNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ width: "100%", padding: compact ? 14 : 24, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 8, alignItems: "center", textAlign: "center" }}>
      <div style={{ width: compact ? 36 : 48, height: compact ? 36 : 48, borderRadius: "50%", background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center", fontSize: compact ? 18 : 24 }}>🔒</div>
      <div style={{ fontSize: compact ? 13 : 15, fontWeight: 700, color: "#0f172a" }}>ยังดูตัวอย่างโฆษณานี้ไม่ได้</div>
      <div style={{ fontSize: compact ? 11 : 12, color: "#475569", lineHeight: 1.6, maxWidth: 360 }}>
        โฆษณานี้ใช้โพสต์ที่มีอยู่แล้วบนเพจ (บูสต์โพสต์) แต่ Token ที่ใช้อยู่ยังไม่มีสิทธิ์เข้าถึงเพจเจ้าของโพสต์ Facebook จึงไม่แสดงตัวอย่างและรูปให้
      </div>
      <div style={{ fontSize: compact ? 10 : 11, color: "#64748b", lineHeight: 1.6, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", maxWidth: 360, textAlign: "left" }}>
        <b style={{ color: "#334155" }}>วิธีแก้:</b> ให้ System User / บัญชีที่ใช้ Token เข้าถึงเพจนี้ใน Business Settings → Pages แล้วสร้าง Token ใหม่พร้อมสิทธิ์ <code>pages_read_engagement</code> จากนั้นโหลด Ads ใหม่
      </div>
      <div style={{ fontSize: 10, color: "#94a3b8" }}>ข้อความและรายละเอียดของโฆษณา (ฝั่งขวา) ยังแสดงได้ตามปกติ</div>
    </div>
  );
}
