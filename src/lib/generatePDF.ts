/**
 * PDF generation for خدمة reports.
 * jsPDF + jspdf-autotable, Amiri font, full Arabic presentation-form reshaper.
 * All text is vector — no html2canvas / raster images.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/lib/supabase";

// ═══════════════════════════════════════════════════════════════════════════════
// ARABIC RESHAPER
// Converts each base code point to its correct Unicode Presentation Form
// (isolated / final / initial / medial) then reverses each line so it renders
// correctly when jsPDF draws left-to-right.
// ═══════════════════════════════════════════════════════════════════════════════

// [isolated, final, initial, medial]  — 0 means "no such form"
const _F: Record<number, readonly [number,number,number,number]> = {
  0x0622:[0x0622,0xFE82,0,0],                   // آ
  0x0623:[0x0623,0xFE84,0,0],                   // أ
  0x0624:[0x0624,0xFE86,0,0],                   // ؤ
  0x0625:[0x0625,0xFE88,0,0],                   // إ
  0x0626:[0x0626,0xFE8A,0xFE8B,0xFE8C],        // ئ
  0x0627:[0x0627,0xFE8E,0,0],                   // ا
  0x0628:[0x0628,0xFE90,0xFE91,0xFE92],        // ب
  0x0629:[0x0629,0xFE94,0,0],                   // ة
  0x062A:[0x062A,0xFE96,0xFE97,0xFE98],        // ت
  0x062B:[0x062B,0xFE9A,0xFE9B,0xFE9C],        // ث
  0x062C:[0x062C,0xFE9E,0xFE9F,0xFEA0],        // ج
  0x062D:[0x062D,0xFEA2,0xFEA3,0xFEA4],        // ح
  0x062E:[0x062E,0xFEA6,0xFEA7,0xFEA8],        // خ
  0x062F:[0x062F,0xFEAA,0,0],                   // د
  0x0630:[0x0630,0xFEAC,0,0],                   // ذ
  0x0631:[0x0631,0xFEAE,0,0],                   // ر
  0x0632:[0x0632,0xFEB0,0,0],                   // ز
  0x0633:[0x0633,0xFEB2,0xFEB3,0xFEB4],        // س
  0x0634:[0x0634,0xFEB6,0xFEB7,0xFEB8],        // ش
  0x0635:[0x0635,0xFEBA,0xFEBB,0xFEBC],        // ص
  0x0636:[0x0636,0xFEBE,0xFEBF,0xFEC0],        // ض
  0x0637:[0x0637,0xFEC2,0xFEC3,0xFEC4],        // ط
  0x0638:[0x0638,0xFEC6,0xFEC7,0xFEC8],        // ظ
  0x0639:[0x0639,0xFECA,0xFECB,0xFECC],        // ع
  0x063A:[0x063A,0xFECE,0xFECF,0xFED0],        // غ
  0x0641:[0x0641,0xFED2,0xFED3,0xFED4],        // ف
  0x0642:[0x0642,0xFED6,0xFED7,0xFED8],        // ق
  0x0643:[0x0643,0xFEDA,0xFEDB,0xFEDC],        // ك
  0x0644:[0x0644,0xFEDE,0xFEDF,0xFEE0],        // ل
  0x0645:[0x0645,0xFEE2,0xFEE3,0xFEE4],        // م
  0x0646:[0x0646,0xFEE6,0xFEE7,0xFEE8],        // ن
  0x0647:[0x0647,0xFEEA,0xFEEB,0xFEEC],        // ه
  0x0648:[0x0648,0xFEEE,0,0],                   // و
  0x0649:[0x0649,0xFEF0,0,0],                   // ى
  0x064A:[0x064A,0xFEF2,0xFEF3,0xFEF4],        // ي
};

// Letters that never connect to the letter that follows them
const _NC = new Set([
  0x0622,0x0623,0x0624,0x0625,0x0627,0x0629,
  0x062F,0x0630,0x0631,0x0632,0x0648,0x0649,
]);

/**
 * Shape Arabic text and reverse each line for LTR jsPDF rendering.
 * Pass ALL Arabic strings through this before giving them to jsPDF or autoTable.
 */
function ar(text: string): string {
  return text.split("\n").map(line => {
    const cps = [...line].map(c => c.codePointAt(0)!);
    const out: number[] = [];
    for (let i = 0; i < cps.length; i++) {
      const cp = cps[i];
      const f  = _F[cp];
      if (!f) { out.push(cp); continue; }
      const prev = i > 0 ? cps[i - 1] : -1;
      const next = i < cps.length - 1 ? cps[i + 1] : -1;
      const pConn = _F[prev] !== undefined && !_NC.has(prev);
      const nConn = _F[next] !== undefined && !_NC.has(cp);
      const idx   = pConn && nConn && f[3] ? 3
                  : pConn && f[1]           ? 1
                  : nConn && f[2]           ? 2
                  : 0;
      out.push(f[idx] || f[0]);
    }
    return out.map(cp => String.fromCodePoint(cp)).join("");
  }).join("\n");
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════════
const C = {
  green:      [30,  80, 50]  as [number,number,number],
  greenDark:  [20,  55, 35]  as [number,number,number],
  beige:      [228,221,211]  as [number,number,number],
  cream:      [248,245,240]  as [number,number,number],
  gray:       [130,130,130]  as [number,number,number],
  grayLight:  [200,198,195]  as [number,number,number],
  black:      [30,  30, 30]  as [number,number,number],
  white:      [255,255,255]  as [number,number,number],
  amber:      [180,100, 20]  as [number,number,number],
  red:        [160, 40, 40]  as [number,number,number],
  redDark:    [120, 28, 28]  as [number,number,number],
};

const W      = 210;   // A4 width mm
const H      = 297;   // A4 height mm
const ML     = 14;    // left margin mm
const MR     = 14;    // right margin mm
const IW     = W - ML - MR;  // inner width = 182mm
const FOOTER = 14;    // height reserved for footer at bottom

// ═══════════════════════════════════════════════════════════════════════════════
// FONT LOADING (cached)
// ═══════════════════════════════════════════════════════════════════════════════
let _font: string | null = null;

async function loadFont(): Promise<string> {
  if (_font) return _font;
  const buf   = await fetch("/fonts/Amiri-Regular.ttf").then(r => r.arrayBuffer());
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i += 2048)
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + 2048, bytes.byteLength)));
  _font = btoa(bin);
  return _font;
}

async function makeDoc(): Promise<jsPDF> {
  const doc  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const font = await loadFont();
  doc.addFileToVFS("Amiri-Regular.ttf", font);
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  doc.setFont("Amiri");
  return doc;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const fmt = (n: number) => Number(n).toLocaleString("en");

function todayAr(): string {
  return new Date().toLocaleDateString("ar-EG", {
    year: "numeric", month: "long", day: "numeric",
  });
}

const MONTHS_AR: Record<string,string> = {
  "01":"يناير","02":"فبراير","03":"مارس","04":"أبريل",
  "05":"مايو","06":"يونيو","07":"يوليو","08":"أغسطس",
  "09":"سبتمبر","10":"أكتوبر","11":"نوفمبر","12":"ديسمبر",
};
function toAr(s: string){ return s.replace(/[0-9]/g,d=>"٠١٢٣٤٥٦٧٨٩"[+d]); }
function fmtMonthLabel(m: string){ const[y,mo]=m.split("-"); return `${MONTHS_AR[mo]||mo} ${toAr(y)}`; }

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE CHROME — header, summary bar, footers
// ═══════════════════════════════════════════════════════════════════════════════

/** Draws the green header band. Returns the Y coordinate below it. */
function drawHeader(doc: jsPDF, title: string, subtitle: string): number {
  // Green band
  doc.setFillColor(C.green[0], C.green[1], C.green[2]);
  doc.rect(0, 0, W, 24, "F");

  // Org name
  doc.setFontSize(13);
  doc.setTextColor(C.white[0], C.white[1], C.white[2]);
  doc.setFont("Amiri");
  doc.text(ar("نظام خدمة — إدارة كفالات الأيتام"), W / 2, 10, { align: "center" });

  // Subtitle
  doc.setFontSize(9);
  doc.text(ar(subtitle), W / 2, 17.5, { align: "center" });

  // Report title (below green band)
  doc.setTextColor(C.black[0], C.black[1], C.black[2]);
  doc.setFontSize(17);
  doc.setFont("Amiri");
  doc.text(ar(title), W / 2, 34, { align: "center" });

  // Issue date
  doc.setFontSize(8);
  doc.setTextColor(C.gray[0], C.gray[1], C.gray[2]);
  doc.text(ar("تاريخ الإصدار: ") + todayAr(), W / 2, 41, { align: "center" });
  doc.setTextColor(C.black[0], C.black[1], C.black[2]);

  // Divider
  doc.setDrawColor(C.beige[0], C.beige[1], C.beige[2]);
  doc.setLineWidth(0.5);
  doc.line(ML, 45, W - MR, 45);

  return 49;
}

/** Draws a summary metrics bar. Returns Y below it. */
function drawSummary(
  doc: jsPDF,
  items: { label: string; value: string; highlight?: boolean }[],
  y: number,
): number {
  const boxH  = 26;
  const colW  = IW / items.length;
  const r     = 3;

  // Background + border
  doc.setFillColor(C.cream[0], C.cream[1], C.cream[2]);
  doc.setDrawColor(C.beige[0], C.beige[1], C.beige[2]);
  doc.setLineWidth(0.4);
  doc.roundedRect(ML, y, IW, boxH, r, r, "FD");

  items.forEach((item, i) => {
    // RTL: item[0] = rightmost column
    const cx = W - MR - colW * i - colW / 2;

    doc.setFontSize(7.5);
    doc.setTextColor(C.gray[0], C.gray[1], C.gray[2]);
    doc.setFont("Amiri");
    doc.text(ar(item.label), cx, y + 10, { align: "center" });

    doc.setFontSize(12);
    const tc = item.highlight ? C.green : C.black;
    doc.setTextColor(tc[0], tc[1], tc[2]);
    doc.text(item.value, cx, y + 20, { align: "center" });

    // Column separator
    if (i < items.length - 1) {
      doc.setDrawColor(C.grayLight[0], C.grayLight[1], C.grayLight[2]);
      doc.setLineWidth(0.3);
      doc.line(
        W - MR - colW * (i + 1), y + 4,
        W - MR - colW * (i + 1), y + boxH - 4,
      );
    }
  });

  doc.setTextColor(C.black[0], C.black[1], C.black[2]);
  return y + boxH + 6;
}

/** Stamps footer on every page: divider + page X/Y + date + confidential. */
function addFooters(doc: jsPDF) {
  const total = (doc.internal as any).getNumberOfPages() as number;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(C.grayLight[0], C.grayLight[1], C.grayLight[2]);
    doc.setLineWidth(0.35);
    doc.line(ML, H - FOOTER + 1, W - MR, H - FOOTER + 1);

    doc.setFontSize(7.5);
    doc.setFont("Amiri");
    doc.setTextColor(C.gray[0], C.gray[1], C.gray[2]);

    doc.text(ar("سري — للاستخدام الداخلي فقط"), ML, H - 5.5);
    doc.text(`${p} / ${total}`, W / 2, H - 5.5, { align: "center" });
    doc.text(todayAr(), W - MR, H - 5.5, { align: "right" });

    doc.setTextColor(C.black[0], C.black[1], C.black[2]);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED TABLE STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const BASE: Parameters<typeof autoTable>[1]["styles"] = {
  font:        "Amiri",
  fontSize:    10,
  halign:      "right",
  cellPadding: { top: 3.5, right: 9, bottom: 3.5, left: 5 },
  lineColor:   C.beige,
  lineWidth:   0.3,
  textColor:   C.black,
  overflow:    "linebreak",
};

const HEAD: Parameters<typeof autoTable>[1]["headStyles"] = {
  fillColor:  C.green,
  textColor:  C.white,
  font:       "Amiri",
  fontStyle:  "normal",
  halign:     "center",
  fontSize:   9,
  cellPadding:{ top: 4, right: 8, bottom: 4, left: 5 },
};

const FOOT: Parameters<typeof autoTable>[1]["footStyles"] = {
  fillColor:  C.beige,
  textColor:  [50,50,50] as [number,number,number],
  font:       "Amiri",
  fontStyle:  "normal",
  halign:     "center",
  fontSize:   10,
};

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 1 — Area Disbursement  كشف الصرف
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateAreaReportPDF(params: {
  areaName:   string;
  month:      string;
  monthLabel: string;
  rows: Array<{
    name: string; case_types: string[]; children: string[];
    fixed: number; extras: number; total: number;
  }>;
  grandFixed: number; grandExtras: number; grandTotal: number;
}) {
  const { areaName, month, monthLabel, rows, grandFixed, grandExtras, grandTotal } = params;
  const doc = await makeDoc();

  let y = drawHeader(doc, `${ar(areaName)} — ${ar(monthLabel)}`, "كشف الصرف الشهري للكفالات");

  y = drawSummary(doc, [
    { label: "عدد العائلات",     value: `${rows.length}` },
    { label: "إجمالي الكفالات", value: `${fmt(grandFixed)} ج` },
    { label: "إجمالي الزيادات", value: grandExtras > 0 ? `${fmt(grandExtras)} ج` : "—" },
    { label: "الإجمالي الكلي",  value: `${fmt(grandTotal)} ج`, highlight: true },
  ], y);

  // Column widths (must sum to IW = 182)
  // [total 28] [extras 26] [fixed 26] [type 38] [name auto≈64]
  autoTable(doc, {
    startY:     y,
    margin:     { left: ML, right: MR, bottom: FOOTER + 2 },
    tableWidth: IW,

    head: [[
      ar("الإجمالي"), ar("الزيادات"), ar("الكفالة"),
      ar("نوع الحالة"), ar("اسم العائل / المستفيد"),
    ]],

    body: rows.map(r => [
      fmt(r.total),
      r.extras > 0 ? fmt(r.extras) : "—",
      r.fixed  > 0 ? fmt(r.fixed)  : "—",
      ar(r.case_types.join("، ")),
      r.children.length > 1
        ? ar(r.name) + "\n" + ar(r.children.join(" · "))
        : ar(r.name),
    ]),

    foot: [[
      fmt(grandTotal), fmt(grandExtras), fmt(grandFixed),
      "", ar("الإجمالي الكلي"),
    ]],

    styles:            BASE,
    headStyles:        HEAD,
    footStyles:        { ...FOOT, fontStyle: "bold" as const },
    alternateRowStyles:{ fillColor: [252,250,247] as [number,number,number] },

    columnStyles: {
      0: { halign: "center", cellWidth: 28 },
      1: { halign: "center", cellWidth: 26 },
      2: { halign: "center", cellWidth: 26 },
      3: { halign: "center", cellWidth: 38 },
      4: { halign: "right",  cellWidth: "auto" as unknown as number },
    },

    rowPageBreak: "avoid",
    showFoot:     "lastPage",
    showHead:     "everyPage",
  });

  addFooters(doc);
  doc.save(`كشف_${areaName}_${month}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 2 — Sadaqat Ledger  تقرير الصدقات
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateSadaqatReportPDF(params: {
  month: string; monthLabel: string;
  totalIn: number; totalOut: number; balance: number;
  inflows: Array<{
    amount: number|string; donor_name?: string|null;
    destination_description?: string|null; approved_by?: string|null;
    month_year: string;
  }>;
  outflows: Array<{
    amount: number|string; destination_description?: string|null;
    approved_by?: string|null; month_year: string;
  }>;
  opMap: Record<string,string>;
}) {
  const { month, monthLabel, totalIn, totalOut, balance, inflows, outflows, opMap } = params;
  const doc = await makeDoc();

  let y = drawHeader(doc, `${ar("تقرير الصدقات")} — ${ar(monthLabel)}`, "سجل الحركات المالية لصندوق الصدقات");

  y = drawSummary(doc, [
    { label: "إجمالي الوارد",  value: `${fmt(totalIn)} ج` },
    { label: "إجمالي الصادر", value: `${fmt(totalOut)} ج` },
    { label: "الرصيد الكلي",  value: `${fmt(balance)} ج`, highlight: true },
  ], y);

  const inflowHead  = [[ ar("المبلغ"), ar("استلمه"), ar("المتبرع / الوصف"), ar("الشهر") ]];
  const outflowHead = [[ ar("المبلغ"), ar("وزَّعه"),  ar("الوصف / الوجهة"),  ar("الشهر") ]];

  const inflowGreen  = [38,100,60]  as [number,number,number];
  const outflowRed   = [140,45,45]  as [number,number,number];

  const colStyles = {
    0: { halign: "center" as const, cellWidth: 32 },
    1: { halign: "center" as const, cellWidth: 32 },
    2: { halign: "right"  as const },
    3: { halign: "center" as const, cellWidth: 24 },
  };

  // ── Section label helper
  function sectionLabel(text: string, color: [number,number,number]) {
    doc.setFontSize(10);
    doc.setFont("Amiri");
    doc.setTextColor(color[0], color[1], color[2]);
    const cur = (doc as any).lastAutoTable?.finalY ?? y;
    doc.text(ar(text), W - MR, cur + 8, { align: "right" });
    doc.setTextColor(C.black[0], C.black[1], C.black[2]);
    return cur + 12;
  }

  // ── Inflows
  if (inflows.length > 0) {
    y = sectionLabel("الوارد — التبرعات", C.green);
    autoTable(doc, {
      startY: y, margin: { left: ML, right: MR, bottom: FOOTER + 2 }, tableWidth: IW,
      head: inflowHead,
      body: inflows.map(e => [
        `${fmt(Number(e.amount))} ج`,
        ar(opMap[e.approved_by||""] || "—"),
        ar(e.donor_name || e.destination_description || "—"),
        e.month_year,
      ]),
      foot: [[ `${fmt(totalIn)} ج`, "", ar("إجمالي الوارد"), "" ]],
      styles: BASE, headStyles: { ...HEAD, fillColor: inflowGreen }, footStyles: FOOT,
      alternateRowStyles: { fillColor: [248,253,250] as [number,number,number] },
      columnStyles: colStyles, rowPageBreak: "avoid", showFoot: "lastPage", showHead: "everyPage",
    });
    y = ((doc as any).lastAutoTable.finalY as number) + 10;
  }

  // ── Outflows
  if (outflows.length > 0) {
    y = sectionLabel("الصادر — المصروفات", C.red);
    autoTable(doc, {
      startY: y, margin: { left: ML, right: MR, bottom: FOOTER + 2 }, tableWidth: IW,
      head: outflowHead,
      body: outflows.map(e => [
        `${fmt(Number(e.amount))} ج`,
        ar(opMap[e.approved_by||""] || "—"),
        ar(e.destination_description || "—"),
        e.month_year,
      ]),
      foot: [[ `${fmt(totalOut)} ج`, "", ar("إجمالي الصادر"), "" ]],
      styles: BASE, headStyles: { ...HEAD, fillColor: outflowRed }, footStyles: FOOT,
      alternateRowStyles: { fillColor: [255,250,250] as [number,number,number] },
      columnStyles: colStyles, rowPageBreak: "avoid", showFoot: "lastPage", showHead: "everyPage",
    });
  }

  addFooters(doc);
  doc.save(`تقرير_الصدقات_${month}.pdf`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE — fetch + generate in one call (for settle / archive pages)
// ═══════════════════════════════════════════════════════════════════════════════
const CASE_TYPE_MAP: Record<string,string> = {
  orphan:"كفالة يتيم",student:"طالب علم",medical:"حالات مرضية",
  special:"حالات خاصة",vulnerable:"كفالة يتيم",
  "كفالة يتيم":"كفالة يتيم","طالب علم":"طالب علم",
  "حالات مرضية":"حالات مرضية","حالات خاصة":"حالات خاصة",
};

export async function downloadAreaReportPDF(areaId: string, areaName: string, month: string) {
  const { data: cases } = await supabase
    .from("cases").select("id,guardian_name,child_name,case_type")
    .eq("area_id", areaId).eq("status", "active");

  if (!cases?.length) { alert("لا توجد حالات نشطة"); return; }
  const ids = cases.map(c => c.id);

  const [{ data: sps }, { data: adjs }] = await Promise.all([
    supabase.from("sponsorships").select("case_id,fixed_amount").in("case_id", ids).eq("status","active"),
    supabase.from("monthly_adjustments").select("case_id,amount")
      .eq("month_year", month).in("case_id", ids).eq("adjustment_type","one_time_extra"),
  ]);

  const gMap = new Map<string,{name:string;case_types:string[];children:string[];fixed:number;extras:number;total:number}>();
  for (const c of cases) {
    const fixed  = (sps  ||[]).filter(s=>s.case_id===c.id).reduce((s,r)=>s+Number(r.fixed_amount),0);
    const extras = (adjs||[]).filter(a=>a.case_id===c.id).reduce((s,r)=>s+Number(r.amount),0);
    if (!fixed && !extras) continue;
    const key  = c.guardian_name?.trim() || c.child_name?.trim() || "—";
    const type = CASE_TYPE_MAP[c.case_type] || c.case_type || "كفالة يتيم";
    if (gMap.has(key)) {
      const row = gMap.get(key)!;
      row.fixed+=fixed; row.extras+=extras; row.total+=fixed+extras;
      if (!row.case_types.includes(type)) row.case_types.push(type);
      row.children.push(c.child_name?.trim()||"—");
    } else {
      gMap.set(key,{name:key,case_types:[type],children:[c.child_name?.trim()||"—"],fixed,extras,total:fixed+extras});
    }
  }

  const rows       = [...gMap.values()].sort((a,b)=>a.name.localeCompare(b.name,"ar"));
  const grandFixed  = rows.reduce((s,r)=>s+r.fixed,0);
  const grandExtras = rows.reduce((s,r)=>s+r.extras,0);
  const grandTotal  = rows.reduce((s,r)=>s+r.total,0);

  await generateAreaReportPDF({ areaName, month, monthLabel: fmtMonthLabel(month), rows, grandFixed, grandExtras, grandTotal });
}
