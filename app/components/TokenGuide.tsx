"use client";

import { useState } from "react";

export default function TokenGuide() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="วิธีเอา Access Token"
        style={{
          width: 18, height: 18, borderRadius: "50%", border: "1px solid #d1d5db",
          background: "#fff", color: "#9ca3af", fontSize: 11, fontWeight: 700,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", marginLeft: 6, flexShrink: 0,
        }}
      >
        ?
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 12, maxWidth: 520, width: "100%",
              maxHeight: "80vh", overflow: "auto", padding: "24px 28px",
              boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#000", margin: 0 }}>
                วิธีเอา Access Token
              </h2>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", fontSize: 20, color: "#9ca3af", cursor: "pointer" }}>
                ✕
              </button>
            </div>

            <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.8 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#000", margin: "0 0 8px" }}>
                วิธีที่ 1: Graph API Explorer (แนะนำ)
              </h3>
              <ol style={{ margin: "0 0 20px", paddingLeft: 20 }}>
                <li>เข้า <strong>developers.facebook.com/tools/explorer</strong></li>
                <li>เลือก <strong>Meta App</strong> ที่ต้องการ (หรือสร้างใหม่)</li>
                <li>กด <strong>Generate Access Token</strong></li>
                <li>เพิ่ม Permission: <code style={{ background: "#f3f4f6", padding: "1px 4px", borderRadius: 3 }}>ads_read</code></li>
                <li>กด <strong>Generate</strong> แล้ว Copy Token มาวาง</li>
              </ol>

              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#000", margin: "0 0 8px" }}>
                วิธีที่ 2: System User Token (ใช้ได้นาน)
              </h3>
              <ol style={{ margin: "0 0 20px", paddingLeft: 20 }}>
                <li>เข้า <strong>Business Settings</strong> ใน Meta Business Suite</li>
                <li>ไปที่ <strong>Users → System Users</strong></li>
                <li>สร้าง System User หรือเลือกที่มีอยู่</li>
                <li>กด <strong>Generate New Token</strong></li>
                <li>เลือก App → เพิ่ม Permission <code style={{ background: "#f3f4f6", padding: "1px 4px", borderRadius: 3 }}>ads_read</code></li>
                <li>กด <strong>Generate Token</strong> แล้ว Copy มาวาง</li>
              </ol>

              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#1e40af", marginBottom: 20 }}>
                <strong>Tip:</strong> Token จาก Graph API Explorer หมดอายุใน 1-2 ชม. ใช้วิธีด้านล่างเพื่อขยายอายุ Token
              </div>

              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#000", margin: "0 0 6px" }}>
                วิธีที่ 3: Long-Lived Token (อายุ 60 วัน)
              </h3>
              <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 10px" }}>
                แปลง Short-Lived Token (จากวิธีที่ 1) ให้อยู่ได้ 60 วัน โดยใช้ Graph API
              </p>
              <ol style={{ margin: "0 0 12px", paddingLeft: 20 }}>
                <li>เอา <strong>Short-Lived Token</strong> จากวิธีที่ 1 มาก่อน</li>
                <li>หา <strong>App ID</strong> และ <strong>App Secret</strong> ที่ developers.facebook.com → เลือก App → <strong>Settings → Basic</strong></li>
                <li>เปิด URL นี้ใน Browser (แทนค่าให้ครบ):
                  <div style={{ background: "#f3f4f6", borderRadius: 6, padding: "8px 10px", margin: "6px 0", fontSize: 10, wordBreak: "break-all", fontFamily: "monospace", lineHeight: 1.6 }}>
                    https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&amp;client_id=<strong>APP_ID</strong>&amp;client_secret=<strong>APP_SECRET</strong>&amp;fb_exchange_token=<strong>SHORT_TOKEN</strong>
                  </div>
                </li>
                <li>Browser จะแสดง JSON — Copy ค่า <code style={{ background: "#f3f4f6", padding: "1px 4px", borderRadius: 3 }}>access_token</code> มาวาง</li>
              </ol>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#15803d" }}>
                <strong>Token อายุ 60 วัน</strong> — ต่ออายุได้โดยเรียก URL เดิมซ้ำก่อนหมดอายุ
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
