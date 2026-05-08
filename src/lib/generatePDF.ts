/**
 * PDF generation — html2canvas capture of a professionally designed A4 template.
 * Uses Tajawal (already loaded by the app) so Arabic renders exactly as in the browser.
 */

import jsPDF from "jspdf";
import { supabase } from "@/lib/supabase";

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number) => Number(n).toLocaleString("en");

function todayAr(): string {
  return new Date().toLocaleDateString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
  });
}

const MONTHS_AR: Record<string, string> = {
  "01":"يناير","02":"فبراير","03":"مارس","04":"أبريل",
  "05":"مايو","06":"يونيو","07":"يوليو","08":"أغسطس",
  "09":"سبتمبر","10":"أكتوبر","11":"نوفمبر","12":"ديسمبر",
};
function toAr(s: string) { return s.replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[+d]); }
function fmtMonthLabel(m: string) {
  const [y, mo] = m.split("-");
  return `${MONTHS_AR[mo] || mo} ${toAr(y)}`;
}

// ─── Core capture ────────────────────────────────────────────────────────────

const FONT = "'Tajawal', sans-serif";
const A4_W_PX = 794;   // 210 mm @ 96 dpi
const A4_H_PX = 1123;  // 297 mm @ 96 dpi
const SCALE   = 2;     // retina quality

async function htmlToPDF(html: string, fileName: string) {
  const { default: html2canvas } = await import("html2canvas");

  const wrap = document.createElement("div");
  wrap.style.cssText = [
    `position:fixed`,
    `top:-99999px`,
    `left:-99999px`,
    `width:${A4_W_PX}px`,
    `direction:rtl`,
    `font-family:${FONT}`,
    `background:#fff`,
  ].join(";");
  wrap.innerHTML = html;
  document.body.appendChild(wrap);

  // Let fonts and layout settle
  await document.fonts.ready;
  await new Promise(r => setTimeout(r, 80));

  try {
    const totalH = wrap.scrollHeight;

    // Compute safe page-break points (never split a table row)
    const wrapTop   = wrap.getBoundingClientRect().top;
    const breaks: number[] = [0];
    let limit = A4_H_PX;

    for (const row of Array.from(wrap.querySelectorAll("tbody tr"))) {
      const rc        = row.getBoundingClientRect();
      const rowTop    = rc.top    - wrapTop;
      const rowBottom = rc.bottom - wrapTop;
      if (rowBottom > limit) {
        breaks.push(rowTop);
        limit = rowTop + A4_H_PX;
      }
    }
    breaks.push(totalH + 1);

    // Capture full-height canvas once
    const full = await html2canvas(wrap, {
      scale:       SCALE,
      useCORS:     true,
      allowTaint:  true,
      logging:     false,
      width:       A4_W_PX,
      height:      totalH,
      windowWidth: A4_W_PX,
    });

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    for (let p = 0; p < breaks.length - 1; p++) {
      if (p > 0) doc.addPage();

      const y1 = Math.round(breaks[p]     * SCALE);
      const y2 = Math.min( Math.round(breaks[p + 1] * SCALE), full.height);
      const sh = y2 - y1;
      if (sh <= 0) continue;

      const slice = document.createElement("canvas");
      slice.width  = full.width;
      slice.height = sh;
      slice.getContext("2d")!
        .drawImage(full, 0, y1, full.width, sh, 0, 0, full.width, sh);

      const imgH_mm = (sh / (A4_W_PX * SCALE)) * 210;
      doc.addImage(slice.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, 210, imgH_mm);
    }

    doc.save(fileName);
  } finally {
    document.body.removeChild(wrap);
  }
}

// ─── Shared HTML parts ───────────────────────────────────────────────────────

function pageHeader(title: string, subtitle: string): string {
  return `
  <div style="background:#1E5032;color:#fff;padding:22px 44px;text-align:center;">
    <div style="font-size:17px;font-weight:700;">${title}</div>
    <div style="font-size:11px;opacity:.80;margin-top:5px;">${subtitle}</div>
  </div>`;
}

function summaryBar(items: { label: string; value: string; green?: boolean }[]): string {
  const cells = items.map((it, i) => `
    <div style="flex:1;padding:14px 8px;text-align:center;${i < items.length - 1 ? "border-left:1px solid #E4DDD3;" : ""}">
      <div style="font-size:11px;color:#888;margin-bottom:5px;">${it.label}</div>
      <div style="font-size:17px;font-weight:700;color:${it.green ? "#1E5032" : "#1A1A1A"};">${it.value}</div>
    </div>`).join("");
  return `
  <div style="margin:0 44px 22px;border:1.5px solid #E4DDD3;border-radius:7px;overflow:hidden;display:flex;">
    ${cells}
  </div>`;
}

function pageFooter(): string {
  return `
  <div style="margin:20px 44px 24px;padding-top:10px;border-top:1px solid #E4DDD3;
    display:flex;justify-content:space-between;font-size:10px;color:#aaa;">
    <span>سري — للاستخدام الداخلي فقط</span>
    <span>أُنتج من نظام خدمة — ${todayAr()}</span>
  </div>`;
}

function tableHead(cols: { label: string; center?: boolean }[]): string {
  const ths = cols.map(c =>
    `<th style="padding:11px 13px;font-weight:600;font-size:12px;white-space:nowrap;
      text-align:${c.center ? "center" : "right"};">${c.label}</th>`
  ).join("");
  return `<thead><tr style="background:#1E5032;color:#fff;">${ths}</tr></thead>`;
}

// ─── Report 1 — Area disbursement ────────────────────────────────────────────

export async function generateAreaReportPDF(params: {
  areaName: string;
  month: string;
  monthLabel: string;
  rows: Array<{
    name: string; case_types: string[]; children: string[];
    fixed: number; extras: number; total: number;
  }>;
  grandFixed: number; grandExtras: number; grandTotal: number;
}) {
  const { areaName, monthLabel, month, rows, grandFixed, grandExtras, grandTotal } = params;

  const bodyRows = rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? "#fff" : "#FAFAF8"};border-bottom:1px solid #EEE9E2;">
      <td style="padding:10px 13px;text-align:right;font-weight:700;color:#1A1A1A;">
        ${r.name}
        ${r.children.length > 1 ? `<div style="font-size:11px;color:#aaa;font-weight:400;margin-top:2px;text-align:right;">${r.children.join(" · ")}</div>` : ""}
      </td>
      <td style="padding:10px 13px;text-align:center;font-size:12px;color:#666;">${r.case_types.join("، ")}</td>
      <td style="padding:10px 13px;text-align:center;color:#555;">${r.fixed > 0 ? fmt(r.fixed) : "—"}</td>
      <td style="padding:10px 13px;text-align:center;color:${r.extras > 0 ? "#B46414" : "#bbb"};">${r.extras > 0 ? fmt(r.extras) : "—"}</td>
      <td style="padding:10px 13px;text-align:center;font-weight:700;color:#1E5032;">${fmt(r.total)}</td>
    </tr>`).join("");

  const html = `
  <div style="font-family:${FONT};direction:rtl;background:#fff;color:#1A1A1A;font-size:13px;line-height:1.55;">

    ${pageHeader("نظام خدمة — إدارة كفالات الأيتام", "كشف الصرف الشهري للكفالات")}

    <div style="text-align:center;padding:22px 44px 14px;">
      <div style="font-size:22px;font-weight:800;">${areaName} — ${monthLabel}</div>
      <div style="font-size:11px;color:#999;margin-top:5px;">تاريخ الإصدار: ${todayAr()}</div>
    </div>

    ${summaryBar([
      { label: "عدد العائلات",     value: String(rows.length) },
      { label: "إجمالي الكفالات", value: `${fmt(grandFixed)} ج` },
      { label: "إجمالي الزيادات", value: grandExtras > 0 ? `${fmt(grandExtras)} ج` : "—" },
      { label: "الإجمالي الكلي",  value: `${fmt(grandTotal)} ج`, green: true },
    ])}

    <div style="margin:0 44px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        ${tableHead([
          { label: "اسم العائل / المستفيد" },
          { label: "نوع الحالة",          center: true },
          { label: "الكفالة",             center: true },
          { label: "الزيادات",            center: true },
          { label: "الإجمالي",            center: true },
        ])}
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr style="background:#E4DDD3;font-weight:800;font-size:13px;">
            <td colspan="2" style="padding:11px 13px;text-align:center;">الإجمالي الكلي</td>
            <td style="padding:11px 13px;text-align:center;">${fmt(grandFixed)}</td>
            <td style="padding:11px 13px;text-align:center;">${fmt(grandExtras)}</td>
            <td style="padding:11px 13px;text-align:center;font-size:15px;color:#1E5032;">${fmt(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    ${pageFooter()}
  </div>`;

  await htmlToPDF(html, `كشف_${areaName}_${month}.pdf`);
}

// ─── Report 2 — Sadaqat ledger ───────────────────────────────────────────────

export async function generateSadaqatReportPDF(params: {
  month: string; monthLabel: string;
  totalIn: number; totalOut: number; balance: number;
  inflows: Array<{
    amount: number | string; donor_name?: string | null;
    destination_description?: string | null; approved_by?: string | null;
    month_year: string;
  }>;
  outflows: Array<{
    amount: number | string; destination_description?: string | null;
    approved_by?: string | null; month_year: string;
  }>;
  opMap: Record<string, string>;
}) {
  const { month, monthLabel, totalIn, totalOut, balance, inflows, outflows, opMap } = params;

  function sectionTitle(text: string, color: string): string {
    return `<div style="margin:22px 44px 8px;font-size:13px;font-weight:700;color:${color};">${text}</div>`;
  }

  function ledgerTable(
    head: string[], rows: string[][], footRow: string[], accentColor: string,
  ): string {
    const ths = head.map(h =>
      `<th style="padding:10px 13px;font-size:12px;font-weight:600;text-align:center;">${h}</th>`
    ).join("");
    const trs = rows.map((r, i) => {
      const tds = r.map(c =>
        `<td style="padding:9px 13px;text-align:center;color:#444;">${c}</td>`
      ).join("");
      return `<tr style="background:${i % 2 === 0 ? "#fff" : "#FAFAF8"};border-bottom:1px solid #EEE9E2;">${tds}</tr>`;
    }).join("");
    const ftds = footRow.map(c =>
      `<td style="padding:10px 13px;text-align:center;font-weight:700;">${c}</td>`
    ).join("");
    return `
    <div style="margin:0 44px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:${accentColor};color:#fff;">${ths}</tr></thead>
        <tbody>${trs}</tbody>
        <tfoot><tr style="background:#E4DDD3;">${ftds}</tr></tfoot>
      </table>
    </div>`;
  }

  const inflowRows = inflows.map(e => [
    `${fmt(Number(e.amount))} ج`,
    opMap[e.approved_by || ""] || "—",
    e.donor_name || e.destination_description || "—",
    e.month_year,
  ]);

  const outflowRows = outflows.map(e => [
    `${fmt(Number(e.amount))} ج`,
    opMap[e.approved_by || ""] || "—",
    e.destination_description || "—",
    e.month_year,
  ]);

  const html = `
  <div style="font-family:${FONT};direction:rtl;background:#fff;color:#1A1A1A;font-size:13px;line-height:1.55;">

    ${pageHeader("نظام خدمة — صندوق الصدقات", "سجل الحركات المالية")}

    <div style="text-align:center;padding:22px 44px 14px;">
      <div style="font-size:22px;font-weight:800;">تقرير الصدقات — ${monthLabel}</div>
      <div style="font-size:11px;color:#999;margin-top:5px;">تاريخ الإصدار: ${todayAr()}</div>
    </div>

    ${summaryBar([
      { label: "إجمالي الوارد",  value: `${fmt(totalIn)} ج` },
      { label: "إجمالي الصادر", value: `${fmt(totalOut)} ج` },
      { label: "الرصيد الكلي",  value: `${fmt(balance)} ج`, green: true },
    ])}

    ${inflows.length > 0 ? `
      ${sectionTitle("الوارد — التبرعات", "#1E6640")}
      ${ledgerTable(
        ["المبلغ", "استلمه", "المتبرع / الوصف", "الشهر"],
        inflowRows,
        [`${fmt(totalIn)} ج`, "", "إجمالي الوارد", ""],
        "#1E6640",
      )}` : ""}

    ${outflows.length > 0 ? `
      ${sectionTitle("الصادر — المصروفات", "#8B2222")}
      ${ledgerTable(
        ["المبلغ", "وزَّعه", "الوصف / الوجهة", "الشهر"],
        outflowRows,
        [`${fmt(totalOut)} ج`, "", "إجمالي الصادر", ""],
        "#8B2222",
      )}` : ""}

    ${pageFooter()}
  </div>`;

  await htmlToPDF(html, `تقرير_الصدقات_${month}.pdf`);
}

// ─── Convenience — fetch data then generate (settle / archive pages) ─────────

const CASE_TYPE_MAP: Record<string, string> = {
  orphan: "كفالة يتيم", student: "طالب علم", medical: "حالات مرضية",
  special: "حالات خاصة", vulnerable: "كفالة يتيم",
  "كفالة يتيم": "كفالة يتيم", "طالب علم": "طالب علم",
  "حالات مرضية": "حالات مرضية", "حالات خاصة": "حالات خاصة",
};

export async function downloadAreaReportPDF(areaId: string, areaName: string, month: string) {
  const { data: cases } = await supabase
    .from("cases").select("id,guardian_name,child_name,case_type")
    .eq("area_id", areaId).eq("status", "active");

  if (!cases?.length) { alert("لا توجد حالات نشطة"); return; }
  const ids = cases.map(c => c.id);

  const [{ data: sps }, { data: adjs }] = await Promise.all([
    supabase.from("sponsorships").select("case_id,fixed_amount").in("case_id", ids).eq("status", "active"),
    supabase.from("monthly_adjustments").select("case_id,amount")
      .eq("month_year", month).in("case_id", ids).eq("adjustment_type", "one_time_extra"),
  ]);

  const gMap = new Map<string, {
    name: string; case_types: string[]; children: string[];
    fixed: number; extras: number; total: number;
  }>();

  for (const c of cases) {
    const fixed  = (sps  || []).filter(s => s.case_id === c.id).reduce((s, r) => s + Number(r.fixed_amount), 0);
    const extras = (adjs || []).filter(a => a.case_id === c.id).reduce((s, r) => s + Number(r.amount), 0);
    if (!fixed && !extras) continue;
    const key  = c.guardian_name?.trim() || c.child_name?.trim() || "—";
    const type = CASE_TYPE_MAP[c.case_type] || c.case_type || "كفالة يتيم";
    if (gMap.has(key)) {
      const row = gMap.get(key)!;
      row.fixed += fixed; row.extras += extras; row.total += fixed + extras;
      if (!row.case_types.includes(type)) row.case_types.push(type);
      row.children.push(c.child_name?.trim() || "—");
    } else {
      gMap.set(key, {
        name: key, case_types: [type],
        children: [c.child_name?.trim() || "—"],
        fixed, extras, total: fixed + extras,
      });
    }
  }

  const rows       = [...gMap.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const grandFixed  = rows.reduce((s, r) => s + r.fixed,  0);
  const grandExtras = rows.reduce((s, r) => s + r.extras, 0);
  const grandTotal  = rows.reduce((s, r) => s + r.total,  0);

  await generateAreaReportPDF({
    areaName, month, monthLabel: fmtMonthLabel(month),
    rows, grandFixed, grandExtras, grandTotal,
  });
}
