/**
 * PDF generation utility for خدمة reports.
 * Uses jsPDF + jspdf-autotable with Amiri Arabic font (loaded from CDN).
 * All functions must be called client-side only (call from event handlers).
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabase";

// ─── Font loading (cached per session) ────────────────────────────────────────
let _fontBase64: string | null = null;

async function loadAmiriFont(): Promise<string> {
  if (_fontBase64) return _fontBase64;
  // Amiri is an Arabic/Latin font with full OpenType shaping support
  const url = "https://cdn.jsdelivr.net/npm/amiri-font@0.112.0/fonts/Amiri-Regular.ttf";
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const bytes = new Uint8Array(buf);
  // Convert to base64 in chunks to avoid stack overflow
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 2048) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 2048, bytes.byteLength)));
  }
  _fontBase64 = btoa(binary);
  return _fontBase64;
}

// ─── Doc factory ──────────────────────────────────────────────────────────────
async function makeDoc(): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const font = await loadAmiriFont();
  doc.addFileToVFS("Amiri-Regular.ttf", font);
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  doc.setFont("Amiri");
  doc.setR2L(true);
  return doc;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const GREEN      = [30, 80, 50]   as [number, number, number];
const BEIGE      = [228, 221, 211] as [number, number, number];
const GRAY       = [130, 130, 130] as [number, number, number];
const W          = 210; // A4 width mm
const MARGIN     = 14;
const INNER_W    = W - MARGIN * 2;

const fmt = (n: number) => n.toLocaleString("en");

function todayAr() {
  return new Date().toLocaleDateString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
  });
}

// ─── Header ───────────────────────────────────────────────────────────────────
function drawHeader(doc: jsPDF, title: string, subtitle: string): number {
  // Green band
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, W, 22, "F");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.setFont("Amiri");
  doc.text("نظام خدمة — إدارة كفالات الأيتام", W / 2, 10, { align: "center" });
  doc.setFontSize(9);
  doc.text(subtitle, W / 2, 17, { align: "center" });

  // Report title
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.text(title, W / 2, 31, { align: "center" });

  // Issue date
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  doc.text(`تاريخ الإصدار: ${todayAr()}`, W / 2, 38, { align: "center" });
  doc.setTextColor(0, 0, 0);

  // Divider
  doc.setDrawColor(...BEIGE);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, 42, W - MARGIN, 42);

  return 46; // next Y
}

// ─── Summary bar ──────────────────────────────────────────────────────────────
function drawSummary(
  doc: jsPDF,
  items: { label: string; value: string; highlight?: boolean }[],
  y: number
): number {
  const boxH = 24;
  const colW = INNER_W / items.length;

  doc.setFillColor(248, 245, 240);
  doc.setDrawColor(...BEIGE);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN, y, INNER_W, boxH, 3, 3, "FD");

  items.forEach((item, i) => {
    // RTL: item[0] is rightmost
    const cx = W - MARGIN - colW * i - colW / 2;

    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.setFont("Amiri");
    doc.text(item.label, cx, y + 9, { align: "center" });

    doc.setFontSize(11);
    if (item.highlight) {
      doc.setTextColor(...GREEN);
    } else {
      doc.setTextColor(40, 40, 40);
    }
    doc.text(item.value, cx, y + 19, { align: "center" });

    // Divider between columns
    if (i < items.length - 1) {
      doc.setDrawColor(210, 205, 195);
      doc.line(W - MARGIN - colW * (i + 1), y + 4, W - MARGIN - colW * (i + 1), y + boxH - 4);
    }
  });

  doc.setTextColor(0, 0, 0);
  return y + boxH + 6;
}

// ─── Footers (page X of Y + confidential note + date) ─────────────────────────
function addFooters(doc: jsPDF) {
  const totalPages = (doc.internal as any).getNumberOfPages() as number;
  const pageH = doc.internal.pageSize.getHeight();

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...BEIGE);
    doc.setLineWidth(0.35);
    doc.line(MARGIN, pageH - 14, W - MARGIN, pageH - 14);

    doc.setFontSize(7.5);
    doc.setFont("Amiri");
    doc.setTextColor(...GRAY);

    // Left side: confidential label
    doc.text("سري — للاستخدام الداخلي فقط", MARGIN, pageH - 9);

    // Center: page number
    doc.text(`صفحة ${p} من ${totalPages}`, W / 2, pageH - 9, { align: "center" });

    // Right side: generation date
    doc.text(todayAr(), W - MARGIN, pageH - 9, { align: "right" });

    doc.setTextColor(0, 0, 0);
  }
}

// ─── Shared table style ───────────────────────────────────────────────────────
const BASE_STYLES = {
  font: "Amiri" as const,
  fontSize: 10,
  halign: "right" as const,
  cellPadding: { top: 4, right: 10, bottom: 4, left: 6 },
  lineColor: [215, 210, 200] as [number, number, number],
  lineWidth: 0.3,
};

const HEAD_STYLES = {
  fillColor: GREEN,
  textColor: [255, 255, 255] as [number, number, number],
  font: "Amiri" as const,
  fontStyle: "normal" as const,
  halign: "center" as const,
  fontSize: 9.5,
};

const FOOT_STYLES = {
  fillColor: BEIGE,
  textColor: [50, 50, 50] as [number, number, number],
  font: "Amiri" as const,
  fontStyle: "normal" as const,
  halign: "center" as const,
  fontSize: 10,
};

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 1 — Area Disbursement (كشف الصرف)
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateAreaReportPDF(params: {
  areaName: string;
  month: string;       // "2026-03"
  monthLabel: string;  // "مارس ٢٠٢٦"
  rows: Array<{
    name: string;
    case_types: string[];
    children: string[];
    fixed: number;
    extras: number;
    total: number;
  }>;
  grandFixed: number;
  grandExtras: number;
  grandTotal: number;
}) {
  const { areaName, month, monthLabel, rows, grandFixed, grandExtras, grandTotal } = params;
  const doc = await makeDoc();

  let y = drawHeader(doc, `${areaName} — ${monthLabel}`, "كشف الصرف الشهري للكفالات");

  y = drawSummary(doc, [
    { label: "عدد العائلات",     value: `${rows.length} عائلة`             },
    { label: "إجمالي الكفالات", value: `${fmt(grandFixed)} ج`             },
    { label: "إجمالي الزيادات", value: grandExtras > 0 ? `${fmt(grandExtras)} ج` : "—" },
    { label: "الإجمالي الكلي",  value: `${fmt(grandTotal)} ج`, highlight: true },
  ], y);

  // Columns: left→right in PDF = Total | Extras | Fixed | Type | Name (reads RTL: Name→Type→Fixed→Extras→Total)
  autoTable(doc, {
    startY: y,
    tableWidth: INNER_W,
    margin: { left: MARGIN, right: MARGIN },
    head: [["الإجمالي", "الزيادات", "الكفالة", "نوع الحالة", "اسم العائل / المستفيد"]],
    body: rows.map((r) => [
      fmt(r.total),
      r.extras > 0 ? fmt(r.extras) : "—",
      r.fixed > 0  ? fmt(r.fixed)  : "—",
      r.case_types.join("، "),
      r.children.length > 1
        ? `${r.name}\n${r.children.join(" · ")}`
        : r.name,
    ]),
    foot: [
      [fmt(grandTotal), fmt(grandExtras), fmt(grandFixed), "", "الإجمالي الكلي"],
    ],
    styles: BASE_STYLES,
    headStyles: HEAD_STYLES,
    footStyles: { ...FOOT_STYLES, fontStyle: "bold" as const },
    alternateRowStyles: { fillColor: [252, 250, 247] },
    columnStyles: {
      0: { halign: "center", cellWidth: 28 },
      1: { halign: "center", cellWidth: 26 },
      2: { halign: "center", cellWidth: 26 },
      3: { halign: "center", cellWidth: 36 },
      4: { halign: "right",  cellWidth: "auto" as unknown as number },
    },
    rowPageBreak: "avoid",
  });

  addFooters(doc);
  doc.save(`كشف_${areaName}_${month}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 2 — Sadaqat Ledger (تقرير الصدقات)
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateSadaqatReportPDF(params: {
  month: string;
  monthLabel: string;
  totalIn: number;
  totalOut: number;
  balance: number;
  inflows: Array<{
    amount: number | string;
    donor_name?: string | null;
    destination_description?: string | null;
    approved_by?: string | null;
    month_year: string;
  }>;
  outflows: Array<{
    amount: number | string;
    destination_description?: string | null;
    approved_by?: string | null;
    month_year: string;
  }>;
  opMap: Record<string, string>;
}) {
  const { month, monthLabel, totalIn, totalOut, balance, inflows, outflows, opMap } = params;
  const doc = await makeDoc();

  let y = drawHeader(doc, `تقرير الصدقات — ${monthLabel}`, "سجل الحركات المالية لصندوق الصدقات");

  y = drawSummary(doc, [
    { label: "إجمالي الوارد",  value: `${fmt(totalIn)} ج`               },
    { label: "إجمالي الصادر", value: `${fmt(totalOut)} ج`              },
    { label: "الرصيد الكلي",  value: `${fmt(balance)} ج`, highlight: true },
  ], y);

  // ── Inflows table
  if (inflows.length > 0) {
    doc.setFontSize(10);
    doc.setFont("Amiri");
    doc.setTextColor(30, 100, 55);
    doc.text("الوارد — التبرعات", W - MARGIN, y + 6, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 10;

    autoTable(doc, {
      startY: y,
      tableWidth: INNER_W,
      margin: { left: MARGIN, right: MARGIN },
      head: [["المبلغ", "استلمه", "المتبرع / الوصف", "الشهر"]],
      body: inflows.map((e) => [
        `${fmt(Number(e.amount))} ج`,
        opMap[e.approved_by || ""] || "—",
        e.donor_name || e.destination_description || "—",
        e.month_year,
      ]),
      foot: [[`${fmt(totalIn)} ج`, "", "إجمالي الوارد", ""]],
      styles: BASE_STYLES,
      headStyles: { ...HEAD_STYLES, fillColor: [38, 100, 60] as [number, number, number] },
      footStyles: FOOT_STYLES,
      alternateRowStyles: { fillColor: [248, 253, 250] },
      columnStyles: {
        0: { halign: "center", cellWidth: 32 },
        1: { halign: "center", cellWidth: 32 },
        2: { halign: "right"  },
        3: { halign: "center", cellWidth: 24 },
      },
    });
    y = ((doc as any).lastAutoTable.finalY as number) + 10;
  }

  // ── Outflows table
  if (outflows.length > 0) {
    doc.setFontSize(10);
    doc.setFont("Amiri");
    doc.setTextColor(160, 40, 40);
    doc.text("الصادر — المصروفات", W - MARGIN, y + 6, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 10;

    autoTable(doc, {
      startY: y,
      tableWidth: INNER_W,
      margin: { left: MARGIN, right: MARGIN },
      head: [["المبلغ", "وزَّعه", "الوصف / الوجهة", "الشهر"]],
      body: outflows.map((e) => [
        `${fmt(Number(e.amount))} ج`,
        opMap[e.approved_by || ""] || "—",
        e.destination_description || "—",
        e.month_year,
      ]),
      foot: [[`${fmt(totalOut)} ج`, "", "إجمالي الصادر", ""]],
      styles: BASE_STYLES,
      headStyles: { ...HEAD_STYLES, fillColor: [140, 45, 45] as [number, number, number] },
      footStyles: FOOT_STYLES,
      alternateRowStyles: { fillColor: [255, 250, 250] },
      columnStyles: {
        0: { halign: "center", cellWidth: 32 },
        1: { halign: "center", cellWidth: 32 },
        2: { halign: "right"  },
        3: { halign: "center", cellWidth: 24 },
      },
    });
  }

  addFooters(doc);
  doc.save(`تقرير_الصدقات_${month}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE — fetch data + generate area PDF in one call
// ═══════════════════════════════════════════════════════════════════════════════
const CASE_TYPE_MAP: Record<string, string> = {
  orphan: "كفالة يتيم", student: "طالب علم", medical: "حالات مرضية",
  special: "حالات خاصة", vulnerable: "كفالة يتيم",
  "كفالة يتيم": "كفالة يتيم", "طالب علم": "طالب علم",
  "حالات مرضية": "حالات مرضية", "حالات خاصة": "حالات خاصة",
};

const MONTHS_AR: Record<string, string> = {
  "01":"يناير","02":"فبراير","03":"مارس","04":"أبريل",
  "05":"مايو","06":"يونيو","07":"يوليو","08":"أغسطس",
  "09":"سبتمبر","10":"أكتوبر","11":"نوفمبر","12":"ديسمبر",
};

function toArabicNumerals(str: string) {
  return str.replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
}

function fmtMonthLabel(month: string) {
  const [year, m] = month.split("-");
  return `${MONTHS_AR[m] || m} ${toArabicNumerals(year)}`;
}

export async function downloadAreaReportPDF(areaId: string, areaName: string, month: string) {
  // Fetch cases
  const { data: cases } = await supabase
    .from("cases")
    .select("id, guardian_name, child_name, case_type")
    .eq("area_id", areaId)
    .eq("status", "active");

  if (!cases?.length) { alert("لا توجد حالات نشطة في هذه المنطقة"); return; }

  const caseIds = cases.map(c => c.id);

  const [{ data: sps }, { data: adjs }] = await Promise.all([
    supabase.from("sponsorships").select("case_id, fixed_amount").in("case_id", caseIds).eq("status", "active"),
    supabase.from("monthly_adjustments").select("case_id, amount").eq("month_year", month).in("case_id", caseIds).eq("adjustment_type", "one_time_extra"),
  ]);

  // Build rows per guardian
  const guardianMap = new Map<string, { name: string; case_types: string[]; children: string[]; fixed: number; extras: number; total: number }>();
  for (const c of cases) {
    const fixed  = (sps  || []).filter(s => s.case_id === c.id).reduce((s, r) => s + Number(r.fixed_amount), 0);
    const extras = (adjs || []).filter(a => a.case_id === c.id).reduce((s, r) => s + Number(r.amount), 0);
    if (fixed + extras === 0) continue;
    const key  = c.guardian_name?.trim() || c.child_name?.trim() || "—";
    const type = CASE_TYPE_MAP[c.case_type] || c.case_type || "كفالة يتيم";
    if (guardianMap.has(key)) {
      const row = guardianMap.get(key)!;
      row.fixed  += fixed;
      row.extras += extras;
      row.total  += fixed + extras;
      if (!row.case_types.includes(type)) row.case_types.push(type);
      row.children.push(c.child_name?.trim() || "—");
    } else {
      guardianMap.set(key, { name: key, case_types: [type], children: [c.child_name?.trim() || "—"], fixed, extras, total: fixed + extras });
    }
  }

  const rows = [...guardianMap.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const grandFixed  = rows.reduce((s, r) => s + r.fixed,  0);
  const grandExtras = rows.reduce((s, r) => s + r.extras, 0);
  const grandTotal  = rows.reduce((s, r) => s + r.total,  0);

  await generateAreaReportPDF({ areaName, month, monthLabel: fmtMonthLabel(month), rows, grandFixed, grandExtras, grandTotal });
}
