/**
 * PDF generation utility for خدمة reports.
 * Uses html2canvas to capture browser-rendered Arabic text (Tajawal font, proper shaping),
 * then jsPDF to assemble a multi-page PDF.
 * All functions must be called client-side only.
 */

import jsPDF from "jspdf";
import { supabase } from "@/lib/supabase";

// ─── Constants ────────────────────────────────────────────────────────────────
const A4_W   = 794;   // A4 width in px at 96dpi
const A4_H   = 1123;  // A4 height in px at 96dpi
const SCALE  = 2;     // Render at 2× for sharp text

const GREEN = "#1e5032";
const BEIGE = "#e4ddd3";
const LIGHT = "#f8f5f0";

const fmt = (n: number) => Number(n).toLocaleString("en");

function todayAr() {
  return new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
}

// ─── Core renderer ────────────────────────────────────────────────────────────
async function renderHTMLToPDF(html: string, filename: string) {
  // Mount off-screen at A4 width so the browser lays it out correctly
  const wrap = document.createElement("div");
  wrap.style.cssText = `position:fixed;left:-9999px;top:0;width:${A4_W}px;background:#fff;`;
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  try {
    await document.fonts.ready;

    // ── Measure row positions BEFORE capturing (fixed layout is stable) ──────
    const wrapTop  = wrap.getBoundingClientRect().top; // 0 for position:fixed;top:0
    const dataRows = [...wrap.querySelectorAll("tbody tr")] as HTMLElement[];

    // Walk rows and record page-break points: whenever the next row's bottom
    // would exceed the current page's A4 height, start a new page at that row's top.
    const BOTTOM_PAD = 50; // px buffer so the footer note isn't clipped
    const pageBreaks: number[] = [0];
    let pageStart = 0;

    for (const row of dataRows) {
      const rect      = row.getBoundingClientRect();
      const rowTop    = rect.top    - wrapTop;
      const rowBottom = rect.bottom - wrapTop;
      if (rowBottom > pageStart + A4_H - BOTTOM_PAD && rowTop > pageStart) {
        pageBreaks.push(rowTop);
        pageStart = rowTop;
      }
    }
    pageBreaks.push(wrap.scrollHeight + BOTTOM_PAD);

    // ── Capture the full content as one canvas ───────────────────────────────
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(wrap, {
      scale: SCALE,
      useCORS: true,
      backgroundColor: "#ffffff",
      width:      A4_W,
      height:     wrap.scrollHeight,
      windowWidth: A4_W,
      logging: false,
    });

    // ── Assemble PDF — one page per measured section ─────────────────────────
    const pdf   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW    = 210;
    const PH    = 297;
    const total = pageBreaks.length - 1;

    for (let p = 0; p < total; p++) {
      if (p > 0) pdf.addPage();

      const srcY     = Math.round(pageBreaks[p]                          * SCALE);
      const srcH     = Math.round((pageBreaks[p + 1] - pageBreaks[p])   * SCALE);
      const clampedH = Math.min(srcH, canvas.height - srcY);
      const pageH    = Math.round(A4_H * SCALE);

      // Draw this section into a full-A4 canvas (white-padded at bottom)
      const pc  = document.createElement("canvas");
      pc.width  = canvas.width;
      pc.height = pageH;
      const ctx = pc.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pc.width, pc.height);
      ctx.drawImage(canvas, 0, srcY, canvas.width, clampedH, 0, 0, canvas.width, clampedH);

      pdf.addImage(pc.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, PW, PH);

      // Page number (Helvetica — digits only, no Arabic shaping needed)
      pdf.setFont("helvetica");
      pdf.setFontSize(7.5);
      pdf.setTextColor(150, 150, 150);
      pdf.text(`${p + 1} / ${total}`, PW / 2, PH - 4, { align: "center" });
      pdf.setTextColor(0, 0, 0);
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(wrap);
  }
}

// ─── Shared HTML pieces ───────────────────────────────────────────────────────
function htmlHeader(title: string, subtitle: string) {
  return `
    <div style="background:${GREEN};color:#fff;text-align:center;padding:16px 20px;">
      <div style="font-size:16px;font-weight:800;margin-bottom:5px;">نظام خدمة — إدارة كفالات الأيتام</div>
      <div style="font-size:12px;opacity:0.8;">${subtitle}</div>
    </div>
    <div style="text-align:center;padding:18px 0 6px;font-size:22px;font-weight:900;">${title}</div>
    <div style="text-align:center;font-size:11px;color:#aaa;margin-bottom:14px;">تاريخ الإصدار: ${todayAr()}</div>
    <div style="margin:0 18px 16px;border-top:1.5px solid ${BEIGE};"></div>
  `;
}

function htmlFooterNote() {
  return `
    <div style="margin:18px;padding-top:10px;border-top:1px solid ${BEIGE};display:flex;justify-content:space-between;font-size:10.5px;color:#aaa;">
      <span>سري — للاستخدام الداخلي فقط</span>
      <span>${todayAr()}</span>
    </div>
  `;
}

function htmlWrap(inner: string) {
  return `<div style="direction:rtl;font-family:'Tajawal','Arial',sans-serif;font-size:13px;color:#222;background:#fff;">${inner}</div>`;
}

// ─── Summary box ──────────────────────────────────────────────────────────────
function htmlSummary(items: { label: string; value: string; highlight?: boolean }[]) {
  const cells = items.map((it, i) => `
    <div style="flex:1;padding:14px 10px;text-align:center;${i < items.length - 1 ? "border-left:1px solid #ddd6cc;" : ""}">
      <div style="font-size:10px;color:#999;margin-bottom:6px;">${it.label}</div>
      <div style="font-size:${it.highlight ? "17px" : "15px"};font-weight:${it.highlight ? "900" : "700"};color:${it.highlight ? GREEN : "#222"};">${it.value}</div>
    </div>
  `).join("");

  return `
    <div style="margin:0 18px 18px;display:flex;background:${LIGHT};border:1.5px solid ${BEIGE};border-radius:8px;overflow:hidden;">
      ${cells}
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 1 — Area Disbursement (كشف الصرف)
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateAreaReportPDF(params: {
  areaName: string;
  month: string;
  monthLabel: string;
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

  const rowsHTML = rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? "#fff" : "#fcfaf7"};">
      <td style="padding:9px 14px;border-bottom:1px solid #ece7df;">
        <span style="font-weight:700;">${r.name}</span>
        ${r.children.length > 1 ? `<div style="font-size:11px;color:#aaa;margin-top:2px;">${r.children.join(" · ")}</div>` : ""}
      </td>
      <td style="padding:9px 14px;border-bottom:1px solid #ece7df;text-align:center;color:#666;font-size:12px;">${r.case_types.join("، ")}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #ece7df;text-align:center;">${r.fixed > 0 ? fmt(r.fixed) : "—"}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #ece7df;text-align:center;color:${r.extras > 0 ? "#b45309" : "#ccc"};">${r.extras > 0 ? fmt(r.extras) : "—"}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #ece7df;text-align:center;font-weight:700;color:${GREEN};">${fmt(r.total)}</td>
    </tr>
  `).join("");

  const html = htmlWrap(`
    ${htmlHeader(`${areaName} — ${monthLabel}`, "كشف الصرف الشهري للكفالات")}
    ${htmlSummary([
      { label: "عدد العائلات",     value: `${rows.length} عائلة` },
      { label: "إجمالي الكفالات", value: `${fmt(grandFixed)} ج` },
      { label: "إجمالي الزيادات", value: grandExtras > 0 ? `${fmt(grandExtras)} ج` : "—" },
      { label: "الإجمالي الكلي",  value: `${fmt(grandTotal)} ج`, highlight: true },
    ])}
    <table style="width:calc(100% - 36px);margin:0 18px;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr>
          <th style="background:${GREEN};color:#fff;padding:10px 14px;text-align:right;font-weight:700;">اسم العائل / المستفيد</th>
          <th style="background:${GREEN};color:#fff;padding:10px 14px;text-align:center;font-weight:700;width:120px;">نوع الحالة</th>
          <th style="background:${GREEN};color:#fff;padding:10px 14px;text-align:center;font-weight:700;width:90px;">الكفالة</th>
          <th style="background:${GREEN};color:#fff;padding:10px 14px;text-align:center;font-weight:700;width:90px;">الزيادات</th>
          <th style="background:${GREEN};color:#fff;padding:10px 14px;text-align:center;font-weight:700;width:90px;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>${rowsHTML}</tbody>
      <tfoot>
        <tr style="background:${BEIGE};font-weight:900;font-size:14px;">
          <td colspan="2" style="padding:10px 14px;">الإجمالي الكلي</td>
          <td style="padding:10px 14px;text-align:center;">${fmt(grandFixed)}</td>
          <td style="padding:10px 14px;text-align:center;">${fmt(grandExtras)}</td>
          <td style="padding:10px 14px;text-align:center;color:${GREEN};">${fmt(grandTotal)}</td>
        </tr>
      </tfoot>
    </table>
    ${htmlFooterNote()}
  `);

  await renderHTMLToPDF(html, `كشف_${areaName}_${month}.pdf`);
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

  const inflowRows = inflows.map((e, i) => `
    <tr style="background:${i % 2 === 0 ? "#fff" : "#f6fdf8"};">
      <td style="padding:8px 14px;border-bottom:1px solid #e0ede6;">${e.donor_name || e.destination_description || "—"}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #e0ede6;text-align:center;">${opMap[e.approved_by || ""] || "—"}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #e0ede6;text-align:center;">${e.month_year}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #e0ede6;text-align:center;font-weight:700;color:#16a34a;">${fmt(Number(e.amount))} ج</td>
    </tr>
  `).join("");

  const outflowRows = outflows.map((e, i) => `
    <tr style="background:${i % 2 === 0 ? "#fff" : "#fff8f8"};">
      <td style="padding:8px 14px;border-bottom:1px solid #f0dede;">${e.destination_description || "—"}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #f0dede;text-align:center;">${opMap[e.approved_by || ""] || "—"}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #f0dede;text-align:center;">${e.month_year}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #f0dede;text-align:center;font-weight:700;color:#dc2626;">${fmt(Number(e.amount))} ج</td>
    </tr>
  `).join("");

  const thGreen = `background:#26643c;color:#fff;padding:10px 14px;font-weight:700;`;
  const thRed   = `background:#8c2d2d;color:#fff;padding:10px 14px;font-weight:700;`;

  const html = htmlWrap(`
    ${htmlHeader(`تقرير الصدقات — ${monthLabel}`, "سجل الحركات المالية لصندوق الصدقات")}
    ${htmlSummary([
      { label: "إجمالي الوارد",  value: `${fmt(totalIn)} ج` },
      { label: "إجمالي الصادر", value: `${fmt(totalOut)} ج` },
      { label: "الرصيد الكلي",  value: `${fmt(balance)} ج`, highlight: true },
    ])}

    ${inflows.length > 0 ? `
      <div style="margin:0 18px 6px;color:#16a34a;font-weight:700;font-size:14px;">الوارد — التبرعات</div>
      <table style="width:calc(100% - 36px);margin:0 18px 20px;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr>
            <th style="${thGreen};text-align:right;">المتبرع / الوصف</th>
            <th style="${thGreen};text-align:center;width:110px;">استلمه</th>
            <th style="${thGreen};text-align:center;width:90px;">الشهر</th>
            <th style="${thGreen};text-align:center;width:100px;">المبلغ</th>
          </tr>
        </thead>
        <tbody>${inflowRows}</tbody>
        <tfoot>
          <tr style="background:${BEIGE};font-weight:800;">
            <td colspan="3" style="padding:9px 14px;">إجمالي الوارد</td>
            <td style="padding:9px 14px;text-align:center;color:#16a34a;">${fmt(totalIn)} ج</td>
          </tr>
        </tfoot>
      </table>
    ` : ""}

    ${outflows.length > 0 ? `
      <div style="margin:0 18px 6px;color:#dc2626;font-weight:700;font-size:14px;">الصادر — المصروفات</div>
      <table style="width:calc(100% - 36px);margin:0 18px 20px;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr>
            <th style="${thRed};text-align:right;">الوصف / الوجهة</th>
            <th style="${thRed};text-align:center;width:110px;">وزَّعه</th>
            <th style="${thRed};text-align:center;width:90px;">الشهر</th>
            <th style="${thRed};text-align:center;width:100px;">المبلغ</th>
          </tr>
        </thead>
        <tbody>${outflowRows}</tbody>
        <tfoot>
          <tr style="background:${BEIGE};font-weight:800;">
            <td colspan="3" style="padding:9px 14px;">إجمالي الصادر</td>
            <td style="padding:9px 14px;text-align:center;color:#dc2626;">${fmt(totalOut)} ج</td>
          </tr>
        </tfoot>
      </table>
    ` : ""}

    ${htmlFooterNote()}
  `);

  await renderHTMLToPDF(html, `تقرير_الصدقات_${month}.pdf`);
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

function toAr(str: string) {
  return str.replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
}

function fmtMonthLabel(month: string) {
  const [year, m] = month.split("-");
  return `${MONTHS_AR[m] || m} ${toAr(year)}`;
}

export async function downloadAreaReportPDF(areaId: string, areaName: string, month: string) {
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
