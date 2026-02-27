"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Printer, ArrowRight } from "lucide-react";

// ─── Helpers ───────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("en");

const MONTHS_AR: Record<string, string> = {
  "01": "يناير", "02": "فبراير", "03": "مارس",    "04": "أبريل",
  "05": "مايو",  "06": "يونيو",  "07": "يوليو",   "08": "أغسطس",
  "09": "سبتمبر","10": "أكتوبر","11": "نوفمبر","12": "ديسمبر",
};

function toArabicNumerals(str: string) {
  return str.replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
}

function fmtMonth(month: string) {
  const [year, m] = month.split("-");
  return `${MONTHS_AR[m] || m} ${toArabicNumerals(year)}`;
}

const CASE_TYPE_MAP: Record<string, string> = {
  orphan:           "كفالة يتيم",
  student:          "طالب علم",
  medical:          "حالات مرضية",
  special:          "حالات خاصة",
  vulnerable:       "كفالة يتيم",
  "كفالة يتيم":     "كفالة يتيم",
  "طالب علم":       "طالب علم",
  "حالات مرضية":   "حالات مرضية",
  "حالات خاصة":    "حالات خاصة",
};

type ReportRow = {
  name: string;
  case_type: string;
  fixed: number;
  extras: number;
  total: number;
};

// ─── Main component (needs Suspense) ───────────────────────────────────
function ReportContent() {
  const params = useSearchParams();
  const areaId = params.get("area") || "";
  const month  = params.get("month") || "";

  const [loading, setLoading] = useState(true);
  const [areaName, setAreaName] = useState("");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!areaId || !month) { setError("معاملات مفقودة"); setLoading(false); return; }
    load();
  }, [areaId, month]);

  async function load() {
    setLoading(true);
    try {
      // 1. Area name
      const { data: area } = await supabase.from("areas").select("name").eq("id", areaId).single();
      setAreaName(area?.name || "");

      // 2. Active cases in area
      const { data: cases } = await supabase
        .from("cases")
        .select("id, guardian_name, child_name, case_type")
        .eq("area_id", areaId)
        .eq("status", "active");

      if (!cases?.length) { setRows([]); setLoading(false); return; }

      const caseIds = cases.map(c => c.id);

      // 3. Sponsorship fixed amounts per case
      const { data: sps } = await supabase
        .from("sponsorships")
        .select("case_id, fixed_amount")
        .in("case_id", caseIds)
        .eq("status", "active");

      // 4. Monthly adjustments (extras for this month)
      const { data: adjs } = await supabase
        .from("monthly_adjustments")
        .select("case_id, amount")
        .eq("month_year", month)
        .in("case_id", caseIds)
        .eq("adjustment_type", "one_time_extra");

      // 5. Build rows
      const result: ReportRow[] = cases
        .map(c => {
          const fixed  = (sps  || []).filter(s => s.case_id === c.id).reduce((s, r) => s + Number(r.fixed_amount), 0);
          const extras = (adjs || []).filter(a => a.case_id === c.id).reduce((s, r) => s + Number(r.amount), 0);
          return {
            name:      c.guardian_name || c.child_name || "—",
            case_type: CASE_TYPE_MAP[c.case_type] || c.case_type || "كفالة يتيم",
            fixed, extras,
            total: fixed + extras,
          };
        })
        .filter(r => r.total > 0)
        .sort((a, b) => a.name.localeCompare(b.name, "ar"));

      setRows(result);
    } catch (e: any) {
      setError(e.message || "خطأ في التحميل");
    }
    setLoading(false);
  }

  const grandFixed  = rows.reduce((s, r) => s + r.fixed,  0);
  const grandExtras = rows.reduce((s, r) => s + r.extras, 0);
  const grandTotal  = rows.reduce((s, r) => s + r.total,  0);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "IBM Plex Sans Arabic, sans-serif", background: "var(--cream)" }}>
      <div style={{ textAlign: "center", color: "var(--text-3)" }}>جاري تحميل التقرير...</div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "var(--red)", textAlign: "center" }}>{error}</div>
    </div>
  );

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; padding: 0 !important; margin: 0 !important; }
          .report-wrap { padding: 12px !important; }
          table { font-size: 11px !important; }
          th, td { padding: 5px 8px !important; }
          .report-title-box { padding: 6px 30px !important; font-size: 16px !important; }
        }
        @page { size: A4; margin: 12mm; }
      `}</style>

      {/* Controls bar */}
      <div className="no-print" style={{
        background: "var(--surface)", borderBottom: "1px solid var(--border)",
        padding: "0 1.5rem", height: 60,
        display: "flex", alignItems: "center", gap: 12,
        boxShadow: "var(--shadow-sm)",
      }}>
        <Link href="/settle" className="btn btn-ghost btn-sm" style={{ gap: 4 }}>
          <ArrowRight size={16} /> العودة
        </Link>
        <div style={{ flex: 1, textAlign: "center" }}>
          <span style={{ fontWeight: 700, color: "var(--text-1)", fontSize: "0.9rem" }}>
            {areaName} — {fmtMonth(month)}
          </span>
          <span style={{ color: "var(--text-3)", fontSize: "0.75rem", marginRight: 8 }}>
            ({rows.length} حالة)
          </span>
        </div>
        <button onClick={() => window.print()} className="btn btn-primary btn-sm">
          <Printer size={15} /> طباعة / PDF
        </button>
      </div>

      {/* Report body */}
      <div className="report-wrap" style={{ maxWidth: 820, margin: "28px auto", padding: "0 20px" }}>

        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div className="report-title-box" style={{
            display: "inline-block",
            border: "2.5px solid var(--text-1)",
            borderRadius: 6,
            padding: "8px 48px",
            fontSize: "1.2rem",
            fontWeight: 800,
            color: "var(--text-1)",
            letterSpacing: "0.01em",
          }}>
            {areaName} - {fmtMonth(month)}
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ fontSize: "0.85rem" }}>
            <thead>
              <tr>
                <th style={{ background: "#F0EDE7", color: "var(--text-2)", padding: "10px 14px" }}>اسم العائل / الطالب / المستفيد</th>
                <th style={{ background: "#F0EDE7", color: "var(--text-2)", padding: "10px 14px", whiteSpace: "nowrap" }}>نوع الحالة</th>
                <th style={{ background: "#F0EDE7", color: "var(--text-2)", padding: "10px 14px", textAlign: "center" }}>SUM of المبلغ</th>
                <th style={{ background: "#F0EDE7", color: "var(--text-2)", padding: "10px 14px", textAlign: "center" }}>SUM of زيادات</th>
                <th style={{ background: "#E4DDD3", color: "var(--text-1)", padding: "10px 14px", textAlign: "center", fontWeight: 800 }}>SUM of اجمالي</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "white" : "var(--cream)" }}>
                  <td style={{ fontWeight: 700, color: "var(--text-1)", padding: "9px 14px" }}>{r.name}</td>
                  <td style={{ color: "var(--text-2)", padding: "9px 14px", fontSize: "0.8rem" }}>{r.case_type}</td>
                  <td style={{ textAlign: "center", padding: "9px 14px", color: "var(--text-2)" }}>{r.fixed > 0 ? fmt(r.fixed) : ""}</td>
                  <td style={{ textAlign: "center", padding: "9px 14px", color: r.extras > 0 ? "var(--amber)" : "var(--text-3)" }}>
                    {fmt(r.extras)}
                  </td>
                  <td style={{ textAlign: "center", padding: "9px 14px", fontWeight: 700, color: "var(--text-1)" }}>{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "#E4DDD3" }}>
                <td colSpan={2} style={{ padding: "10px 14px", fontWeight: 800, fontSize: "0.9rem", color: "var(--text-1)" }}>
                  Grand Total
                </td>
                <td style={{ textAlign: "center", padding: "10px 14px", fontWeight: 800, color: "var(--text-1)" }}>{fmt(grandFixed)}</td>
                <td style={{ textAlign: "center", padding: "10px 14px", fontWeight: 800, color: "var(--text-1)" }}>{fmt(grandExtras)}</td>
                <td style={{ textAlign: "center", padding: "10px 14px", fontWeight: 800, fontSize: "1rem", color: "var(--green)" }}>{fmt(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {grandExtras === 0 && (
          <div style={{
            marginTop: 16, padding: "10px 16px",
            background: "var(--amber-light)", border: "1px solid var(--border)",
            borderRadius: "var(--radius)", fontSize: "0.8rem", color: "var(--amber)",
          }}>
            ملاحظة: عمود الزيادات فارغ لأن تعديلات هذا الشهر لم تُدخل بعد عبر صفحة التسوية.
          </div>
        )}

        <div style={{ marginTop: 24, fontSize: "0.75rem", color: "var(--text-3)", textAlign: "center", borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          أُنتج هذا التقرير من نظام خدمة — {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>
    </>
  );
}

// ─── Page export with Suspense wrapper ──────────────────────────────────
export default function ReportPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "IBM Plex Sans Arabic, sans-serif" }}>
        <span style={{ color: "var(--text-3)" }}>جاري التحميل...</span>
      </div>
    }>
      <ReportContent />
    </Suspense>
  );
}
