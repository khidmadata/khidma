"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { Printer, Filter } from "lucide-react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("en");

const MONTHS_AR: Record<string, string> = {
  "01":"يناير","02":"فبراير","03":"مارس","04":"أبريل",
  "05":"مايو","06":"يونيو","07":"يوليو","08":"أغسطس",
  "09":"سبتمبر","10":"أكتوبر","11":"نوفمبر","12":"ديسمبر",
};

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return `${MONTHS_AR[mo] || mo} ${y}`;
}

function toArabicNumerals(str: string) {
  return str.replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
}

function genMonths() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value, label: fmtMonth(value) });
  }
  return opts;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type SponsorRow = {
  sponsor_id: string;
  sponsor_name: string;
  phone: string | null;
  fixed:     number;  // sum of active sponsorships
  extras:    number;  // one_time_extra for this month
  obligation: number; // fixed + extras
  collected:  number; // from collections table
  outstanding: number; // obligation - collected
  received_by: string; // operator name
  status: "paid" | "partial" | "unpaid";
};

type FilterStatus = "all" | "unpaid" | "partial" | "paid";

// ═══════════════════════════════════════════════════════════════════════════════
export default function TahseelPage() {
  const monthOptions = useMemo(genMonths, []);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [rows, setRows] = useState<SponsorRow[]>([]);
  const [opMap, setOpMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load(selectedMonth);
  }, [selectedMonth]);

  async function load(month: string) {
    setLoading(true);

    const [spRes, adjRes, colRes, opRes] = await Promise.all([
      // All active sponsorships with sponsor info
      supabase.from("sponsorships")
        .select("sponsor_id, fixed_amount, sponsors(name, phone)")
        .eq("status", "active"),
      // One-time extras for this month
      supabase.from("monthly_adjustments")
        .select("sponsor_id, amount")
        .eq("month_year", month)
        .eq("adjustment_type", "one_time_extra"),
      // Collections for this month
      supabase.from("collections")
        .select("sponsor_id, amount, received_by_operator_id")
        .eq("month_year", month),
      // Operators
      supabase.from("operators").select("id, name"),
    ]);

    const sps: any[]  = spRes.data  || [];
    const adjs: any[] = adjRes.data || [];
    const cols: any[] = colRes.data || [];
    const ops: any[]  = opRes.data  || [];

    const oMap: Record<string, string> = {};
    ops.forEach((o: any) => { oMap[o.id] = o.name; });
    setOpMap(oMap);

    // Group sponsorships by sponsor_id
    const sponsorFixed: Record<string, { name: string; phone: string | null; fixed: number }> = {};
    for (const sp of sps) {
      const id = sp.sponsor_id;
      if (!sponsorFixed[id]) {
        sponsorFixed[id] = {
          name:  (sp.sponsors as any)?.name  || "—",
          phone: (sp.sponsors as any)?.phone || null,
          fixed: 0,
        };
      }
      sponsorFixed[id].fixed += Number(sp.fixed_amount);
    }

    // Group extras by sponsor_id
    const sponsorExtras: Record<string, number> = {};
    for (const adj of adjs) {
      sponsorExtras[adj.sponsor_id] = (sponsorExtras[adj.sponsor_id] || 0) + Number(adj.amount);
    }

    // Group collections by sponsor_id
    const sponsorCollected: Record<string, { amount: number; received_by: string }> = {};
    for (const col of cols) {
      const existing = sponsorCollected[col.sponsor_id];
      const amt = Number(col.amount);
      if (!existing) {
        sponsorCollected[col.sponsor_id] = {
          amount: amt,
          received_by: oMap[col.received_by_operator_id] || "",
        };
      } else {
        existing.amount += amt;
        if (!existing.received_by && col.received_by_operator_id) {
          existing.received_by = oMap[col.received_by_operator_id] || "";
        }
      }
    }

    // Build rows (only sponsors with active sponsorships)
    const result: SponsorRow[] = Object.entries(sponsorFixed).map(([sponsorId, data]) => {
      const extras    = sponsorExtras[sponsorId] || 0;
      const obligation = data.fixed + extras;
      const collected  = sponsorCollected[sponsorId]?.amount || 0;
      const outstanding = Math.max(0, obligation - collected);
      const status: "paid" | "partial" | "unpaid" =
        collected >= obligation && obligation > 0 ? "paid" :
        collected > 0 ? "partial" : "unpaid";
      return {
        sponsor_id:   sponsorId,
        sponsor_name: data.name,
        phone:        data.phone,
        fixed:        data.fixed,
        extras,
        obligation,
        collected,
        outstanding,
        received_by:  sponsorCollected[sponsorId]?.received_by || "",
        status,
      };
    }).sort((a, b) => {
      // Sort: unpaid first, then partial, then paid; within each group by name
      const order = { unpaid: 0, partial: 1, paid: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return a.sponsor_name.localeCompare(b.sponsor_name, "ar");
    });

    setRows(result);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (filterStatus === "all") return rows;
    return rows.filter(r => r.status === filterStatus);
  }, [rows, filterStatus]);

  const totalObligation = rows.reduce((s, r) => s + r.obligation, 0);
  const totalCollected  = rows.reduce((s, r) => s + r.collected,  0);
  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  const unpaidCount  = rows.filter(r => r.status === "unpaid").length;
  const partialCount = rows.filter(r => r.status === "partial").length;

  const statusColors = {
    paid:    { bg: "var(--green-light)",  color: "var(--green)",  label: "مكتمل"   },
    partial: { bg: "var(--amber-light)",  color: "var(--amber)",  label: "جزئي"    },
    unpaid:  { bg: "var(--red-light)",    color: "var(--red)",    label: "لم يُحصَّل" },
  };

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; padding: 0 !important; }
          .print-wrap { padding: 12px !important; }
          table { font-size: 10px !important; }
          th, td { padding: 5px 7px !important; }
        }
        @page { size: A4 landscape; margin: 10mm; }
      `}</style>

      {/* Header */}
      <header className="app-header no-print">
        <Link href="/" className="btn btn-ghost btn-sm">
          <ArrowRight size={18} />
        </Link>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div className="app-logo" style={{ fontSize: "1.1rem" }}>التحصيل</div>
        </div>
        <button onClick={() => window.print()} className="btn btn-primary btn-sm" style={{ gap: 4 }}>
          <Printer size={14} /> طباعة / PDF
        </button>
      </header>

      <div className="print-wrap" style={{ maxWidth: 1000, margin: "0 auto", padding: "1.25rem 1rem 3rem" }}>

        {/* Month selector + filter */}
        <div className="no-print" style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="select-field"
            style={{ minWidth: 160 }}
          >
            {monthOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 6 }}>
            {([
              ["all",     "الكل"],
              ["unpaid",  "لم يُحصَّل"],
              ["partial", "جزئي"],
              ["paid",    "مكتمل"],
            ] as [FilterStatus, string][]).map(([v, lbl]) => (
              <button
                key={v}
                onClick={() => setFilterStatus(v)}
                className="btn btn-sm"
                style={{
                  background: filterStatus === v ? "var(--green)" : "var(--surface)",
                  color:      filterStatus === v ? "white"        : "var(--text-2)",
                  border:     filterStatus === v ? "none"         : "1.5px solid var(--border)",
                  fontWeight: 600,
                }}
              >{lbl}</button>
            ))}
          </div>
        </div>

        {/* Print title */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>
            كشف التحصيل — {fmtMonth(selectedMonth)}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-3)", marginTop: 2 }}>
            أُنتج بتاريخ {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "الإجمالي المطلوب", val: totalObligation, color: "var(--text-1)",  note: `${rows.length} كفيل` },
            { label: "تم تحصيله",         val: totalCollected,  color: "var(--green)",   note: `${rows.filter(r=>r.status==="paid").length} مكتمل` },
            { label: "المتبقي",           val: totalOutstanding, color: "var(--red)",     note: `${unpaidCount} لم يُحصَّل، ${partialCount} جزئي` },
          ].map(item => (
            <div key={item.label} className="card" style={{ textAlign: "center", padding: "1rem" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginBottom: 6 }}>{item.label}</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, color: item.color }}>{fmt(item.val)}</div>
              <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginTop: 4 }}>{item.note}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)" }}>جاري التحميل...</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ background: "#F0EDE7" }}>
                  <th style={{ padding: "10px 12px", textAlign: "right",   fontWeight: 700, color: "var(--text-2)" }}>الكفيل</th>
                  <th style={{ padding: "10px 10px", textAlign: "center",  fontWeight: 700, color: "var(--text-2)" }}>الكفالة</th>
                  <th style={{ padding: "10px 10px", textAlign: "center",  fontWeight: 700, color: "var(--text-2)" }}>الزيادات</th>
                  <th style={{ padding: "10px 10px", textAlign: "center",  fontWeight: 700, color: "var(--text-2)", background: "#EDE8E1" }}>المطلوب</th>
                  <th style={{ padding: "10px 10px", textAlign: "center",  fontWeight: 700, color: "var(--text-2)" }}>المحصَّل</th>
                  <th style={{ padding: "10px 10px", textAlign: "center",  fontWeight: 700, color: "var(--text-2)" }}>المتبقي</th>
                  <th style={{ padding: "10px 10px", textAlign: "center",  fontWeight: 700, color: "var(--text-2)" }}>استلمه</th>
                  <th style={{ padding: "10px 10px", textAlign: "center",  fontWeight: 700, color: "var(--text-2)" }}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const sc = statusColors[r.status];
                  return (
                    <tr key={r.sponsor_id} style={{ background: i % 2 === 0 ? "white" : "var(--cream)", borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "9px 12px" }}>
                        <div style={{ fontWeight: 700, color: "var(--text-1)" }}>{r.sponsor_name}</div>
                        {r.phone && <div style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>{r.phone}</div>}
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--text-2)" }}>{fmt(r.fixed)}</td>
                      <td style={{ padding: "9px 10px", textAlign: "center", color: r.extras > 0 ? "var(--amber)" : "var(--text-3)" }}>
                        {r.extras > 0 ? `+${fmt(r.extras)}` : "—"}
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "center", fontWeight: 700, color: "var(--text-1)", background: i % 2 === 0 ? "#F4F0EA" : "#EDE8E1" }}>
                        {fmt(r.obligation)}
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "center", color: r.collected > 0 ? "var(--green)" : "var(--text-3)", fontWeight: r.collected > 0 ? 700 : 400 }}>
                        {r.collected > 0 ? fmt(r.collected) : "—"}
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "center", color: r.outstanding > 0 ? "var(--red)" : "var(--text-3)", fontWeight: r.outstanding > 0 ? 700 : 400 }}>
                        {r.outstanding > 0 ? fmt(r.outstanding) : "—"}
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "center", color: "var(--text-2)", fontSize: "0.78rem" }}>
                        {r.received_by || "—"}
                      </td>
                      <td style={{ padding: "9px 10px", textAlign: "center" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "3px 10px", borderRadius: 100,
                          fontSize: "0.72rem", fontWeight: 700,
                          background: sc.bg, color: sc.color,
                        }}>
                          {sc.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#E4DDD3", fontWeight: 800 }}>
                  <td style={{ padding: "10px 12px", color: "var(--text-1)" }}>
                    الإجمالي ({filtered.length} كفيل)
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "center" }}>
                    {fmt(filtered.reduce((s, r) => s + r.fixed, 0))}
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "center", color: "var(--amber)" }}>
                    {filtered.reduce((s,r)=>s+r.extras,0) > 0
                      ? `+${fmt(filtered.reduce((s,r)=>s+r.extras,0))}`
                      : "—"}
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "center", color: "var(--text-1)", background: "#D8D2C8" }}>
                    {fmt(filtered.reduce((s, r) => s + r.obligation, 0))}
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "center", color: "var(--green)" }}>
                    {fmt(filtered.reduce((s, r) => s + r.collected, 0))}
                  </td>
                  <td style={{ padding: "10px 10px", textAlign: "center", color: "var(--red)" }}>
                    {fmt(filtered.reduce((s, r) => s + r.outstanding, 0))}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {filtered.length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-3)", fontSize: "0.875rem" }}>
            لا توجد بيانات للعرض
          </div>
        )}
      </div>
    </>
  );
}
