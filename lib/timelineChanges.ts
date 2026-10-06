// Structured "what changed" items for Timeline events: category → action (dropdown) → optional from/to + note.

export type ChangeKind = "none" | "fromto" | "value" | "text";

export interface ChangeItem {
  id: string;
  category: string;
  action: string;
  from?: string;
  to?: string;
  note?: string;
}

interface ActionDef { label: string; kind: ChangeKind; unit?: string }
export interface CategoryDef { name: string; actions: ActionDef[]; keywordEditor?: boolean }

const A = (label: string, kind: ChangeKind = "none", unit?: string): ActionDef => ({ label, kind, unit });
const ACTIVE = [A("Active"), A("Inactive")];

const META: CategoryDef[] = [
  { name: "Campaign", actions: [...ACTIVE, A("สร้างใหม่", "text"), A("Duplicate", "text"), A("เปลี่ยนชื่อ", "fromto"), A("ลบ / Archive")] },
  { name: "Ad Set", actions: [...ACTIVE, A("สร้างใหม่", "text"), A("Duplicate", "text"), A("ปรับ Schedule", "fromto")] },
  { name: "Audience", actions: [A("แก้ Location", "fromto"), A("แก้ Age / Gender", "fromto"), A("แก้ Interest / Behavior", "text"), A("เพิ่ม Custom Audience", "text"), A("Exclude Audience", "text"), A("ปรับ Lookalike", "fromto"), A("เปิด Advantage+ audience"), A("ปิด Advantage+ audience")] },
  { name: "Budget", actions: [A("Increase", "fromto", "บาท"), A("Decrease", "fromto", "บาท"), A("ABO → CBO"), A("CBO → ABO"), A("Daily ↔ Lifetime", "text")] },
  { name: "Bidding", actions: [A("Lowest cost"), A("Cost cap", "value", "บาท"), A("Bid cap", "value", "บาท"), A("ROAS goal", "value"), A("แก้ค่า Bid", "fromto", "บาท")] },
  { name: "Objective", actions: [A("เปลี่ยน Objective", "fromto"), A("เปลี่ยน Optimization goal", "fromto"), A("เปลี่ยน Conversion event", "fromto")] },
  { name: "Placement", actions: [A("Advantage+ → Manual"), A("Manual → Advantage+"), A("แก้ Placement", "text")] },
  { name: "Ad", actions: [...ACTIVE, A("เพิ่ม Ad ใหม่", "text"), A("เปลี่ยน Creative", "text"), A("แก้ Caption / Headline / CTA", "text"), A("แก้ลิงก์ปลายทาง", "fromto"), A("Duplicate", "text"), A("ลบ")] },
  { name: "Tracking", actions: [A("เปลี่ยน Pixel / Event", "fromto"), A("แก้ UTM", "text"), A("แก้ Lead Form", "text")] },
];

const GOOGLE: CategoryDef[] = [
  { name: "Campaign", actions: [...ACTIVE, A("สร้างใหม่", "text"), A("เปลี่ยน Network (Search Partners / Display)", "text")] },
  { name: "Budget", actions: [A("Increase", "fromto", "บาท"), A("Decrease", "fromto", "บาท"), A("ใช้ Shared budget")] },
  { name: "Bidding", actions: [A("เปลี่ยน Strategy", "fromto"), A("แก้ค่า tCPA", "fromto", "บาท"), A("แก้ค่า tROAS", "fromto"), A("ตั้ง Max CPC", "value", "บาท")] },
  { name: "Keyword", keywordEditor: true, actions: [A("เพิ่ม Keyword"), A("Pause / ลบ Keyword"), A("เพิ่ม Negative Keyword"), A("เปลี่ยน Match Type", "text"), A("ปรับ Bid", "fromto", "บาท")] },
  { name: "Ads", actions: [A("แก้ Headline / Description", "text"), A("Pause"), A("Enable"), A("เพิ่ม Ad ใหม่", "text")] },
  { name: "Targeting", actions: [A("แก้ Location", "fromto"), A("แก้ภาษา", "fromto"), A("แก้ Audience", "text"), A("ปรับ Device bid", "fromto"), A("แก้ Ad Schedule", "fromto")] },
  { name: "Assets", actions: [A("Sitelink", "text"), A("Callout", "text"), A("Call", "text"), A("Image", "text")] },
  { name: "Conversion / Landing", actions: [A("เปลี่ยน Conversion action", "fromto"), A("เปลี่ยน Final URL", "fromto")] },
];

const TIKTOK: CategoryDef[] = [
  { name: "Campaign", actions: [...ACTIVE, A("สร้างใหม่", "text"), A("Duplicate", "text")] },
  { name: "Ad Group", actions: [...ACTIVE, A("สร้างใหม่", "text"), A("ปรับ Schedule", "fromto")] },
  { name: "Audience", actions: [A("แก้ Location", "fromto"), A("แก้ Age / Gender", "fromto"), A("แก้ Interest / Behavior", "text"), A("เพิ่ม Custom Audience", "text"), A("แก้ Device", "text")] },
  { name: "Budget", actions: [A("Increase", "fromto", "บาท"), A("Decrease", "fromto", "บาท"), A("Daily ↔ Lifetime", "text")] },
  { name: "Bidding", actions: [A("Lowest cost"), A("Cost cap", "value", "บาท"), A("แก้ค่า Bid", "fromto", "บาท")] },
  { name: "Objective", actions: [A("เปลี่ยน Objective", "fromto"), A("เปลี่ยน Optimization goal", "fromto")] },
  { name: "Placement", actions: [A("TikTok only"), A("เพิ่ม Pangle"), A("แก้ Placement", "text")] },
  { name: "Ad", actions: [...ACTIVE, A("เพิ่ม Ad ใหม่", "text"), A("เปลี่ยน Creative", "text"), A("ใช้ Spark Ads", "text"), A("แก้ Caption / CTA", "text"), A("ลบ")] },
  { name: "Tracking", actions: [A("เปลี่ยน Pixel / Event", "fromto"), A("แก้ UTM", "text")] },
];

const LINE: CategoryDef[] = [
  { name: "Campaign", actions: [...ACTIVE, A("สร้างใหม่", "text")] },
  { name: "Budget", actions: [A("Increase", "fromto", "บาท"), A("Decrease", "fromto", "บาท")] },
  { name: "Audience", actions: [A("แก้ Audience", "text"), A("แก้ Location", "fromto"), A("แก้ Age / Gender", "fromto")] },
  { name: "Ad", actions: [...ACTIVE, A("เพิ่ม Ad ใหม่", "text"), A("เปลี่ยน Creative", "text"), A("แก้ข้อความ", "text")] },
  { name: "Schedule", actions: [A("ปรับวันที่เริ่ม/สิ้นสุด", "fromto")] },
];

const OTHER: CategoryDef[] = [
  { name: "Budget", actions: [A("Increase", "fromto"), A("Decrease", "fromto")] },
  { name: "Audience", actions: [A("แก้ Audience", "text")] },
  { name: "Ad", actions: [...ACTIVE, A("เพิ่ม Ad ใหม่", "text"), A("เปลี่ยน Creative", "text")] },
  { name: "Schedule", actions: [A("ปรับวันที่", "fromto")] },
  { name: "Landing Page", actions: [A("เปลี่ยนลิงก์", "fromto"), A("แก้เนื้อหา", "text")] },
  { name: "Tracking", actions: [A("แก้การติดตาม", "text")] },
];

export function categoriesForChannel(channel: string): CategoryDef[] {
  if (channel === "Facebook") return META;
  if (channel === "Google") return GOOGLE;
  if (channel === "TikTok") return TIKTOK;
  if (channel === "LINE") return LINE;
  return channel ? OTHER : [];
}

export const CUSTOM_ACTION = "__custom";

export function actionDef(channel: string, category: string, action: string): ActionDef | undefined {
  return categoriesForChannel(channel).find(c => c.name === category)?.actions.find(a => a.label === action);
}

const num = (s?: string) => {
  const n = Number((s ?? "").replace(/[,\s฿บาท%]/g, ""));
  return s?.trim() && Number.isFinite(n) ? n : null;
};

// "+50%" when both sides are plain numbers.
export function pctChange(from?: string, to?: string): string {
  const a = num(from), b = num(to);
  if (a == null || b == null || a === 0) return "";
  const p = ((b - a) / Math.abs(a)) * 100;
  return `${p > 0 ? "+" : ""}${Number(p.toFixed(1))}%`;
}

export function valueText(c: ChangeItem): string {
  const parts: string[] = [];
  if (c.from || c.to) {
    const pct = pctChange(c.from, c.to);
    parts.push(c.from && c.to ? `${c.from} → ${c.to}${pct ? ` (${pct})` : ""}` : (c.to || c.from)!);
  }
  return parts.join("");
}

export function formatChange(c: ChangeItem): string {
  return [`${c.category}: ${c.action}`, valueText(c), c.note ? `(${c.note})` : ""].filter(Boolean).join(" ");
}

const LEGACY_CATEGORY: Record<string, string> = { Target: "Audience", Ads: "Ad", "Text Ads": "Ad", Keyword: "Keyword" };

// Old free-text details become "other" actions so nothing is lost when an old event is edited.
export function legacyToChanges(details?: Record<string, string>): ChangeItem[] {
  return Object.entries(details ?? {}).filter(([, v]) => v).map(([k, v]) => ({
    id: Math.random().toString(36).slice(2, 10),
    category: LEGACY_CATEGORY[k] ?? k,
    action: "อื่นๆ",
    note: v,
  }));
}
