"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { LayoutDashboard, Search } from "lucide-react";

const CASE_TYPE_AR: Record<string, string> = {
  orphan:   "كفالة يتيم",
  student:  "طالب علم",
  medical:  "حالة مرضية",
  special:  "حالة خاصة",
  one_time: "مساعدة لمرة",
};

const fmt = (n: number) => n.toLocaleString("en");

type CaseRow = {
  sponsorship_id: string;
  case_id:        string;
  child_name:     string;
  guardian_name:  string | null;
  area_name:      string;
  area_id:        string;
  case_type:      string;
  fixed_amount:   number;
  sponsor_name:   string;
  sponsor_id:     string;
  sponsor_phone:  string | null;
  operator_name:  string | null;
  paid_through:   string | null;
  needs_level:    string | null;
};

export default function CasesPage() {
  const [rows,      setRows]      = useState<CaseRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [areaFilter,setAreaFilter]= useState("all");

  useEffect(() => {
    (async () => {
      // Fetch all active sponsorships with nested case, area, sponsor, operator, paid_through
      const { data, error } = await supabase
        .from("sponsorships")
        .select(`
          id,
          fixed_amount,
          sponsor_id,
          cases!inner(id, child_name, guardian_name, case_type, needs_level, status, area_id, areas(id, name)),
          sponsors!inner(id, name, phone, responsible_operator_id, paid_through_sponsor_id,
            operators(name),
            paid_through:sponsors!paid_through_sponsor_id(name)
          )
        `)
        .eq("status", "active");

      if (error) { console.error(error); setLoading(false); return; }

      const built: CaseRow[] = (data || [])
        .filter((r: any) => r.cases?.status === "active")
        .map((r: any) => ({
          sponsorship_id: r.id,
          case_id:        r.cases.id,
          child_name:     r.cases.child_name,
          guardian_name:  r.cases.guardian_name || null,
          area_id:        r.cases.area_id,
          area_name:      r.cases.areas?.name || "—",
          case_type:      r.cases.case_type,
          fixed_amount:   Number(r.fixed_amount),
          sponsor_name:   r.sponsors.name,
          sponsor_id:     r.sponsors.id,
          sponsor_phone:  r.sponsors.phone || null,
          operator_name:  r.sponsors.operators?.name || null,
          paid_through:   Array.isArray(r.sponsors.paid_through)
            ? r.sponsors.paid_through[0]?.name || null
            : r.sponsors.paid_through?.name || null,
          needs_level:    r.cases.needs_level || null,
        }));

      setRows(built);
      setLoading(false);
    })();
  }, []);

  const areas = useMemo(() => [...new Set(rows.map(r => r.area_name))].sort((a, b) => a.localeCompare(b, "ar")), [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (areaFilter !== "all") r = r.filter(row => row.area_name === areaFilter);
    if (search.trim()) {
      const q = search.trim();
      r = r.filter(row =>
        row.child_name.includes(q) ||
        (row.guardian_name || "").includes(q) ||
        row.sponsor_name.includes(q) ||
        (row.paid_through || "").includes(q) ||
        (row.operator_name || "").includes(q)
      );
    }
    return [...r].sort((a, b) => a.child_name.localeCompare(b.child_name, "ar"));
  }, [rows, search, areaFilter]);

  const areaStats = useMemo(() => {
    const stats: Record<string, { caseIds: Set<string>; cases: number; total: number }> = {};
    rows.forEach(r => {
      if (!stats[r.area_name]) stats[r.area_name] = { caseIds: new Set(), cases: 0, total: 0 };
      if (!stats[r.area_name].caseIds.has(r.case_id)) {
        stats[r.area_name].caseIds.add(r.case_id);
        stats[r.area_name].cases++;
      }
      stats[r.area_name].total += r.fixed_amount;
    });
    return stats;
  }, [rows]);

  const grandTotal  = rows.reduce((s, r) => s + r.fixed_amount, 0);
  const grandCases  = new Set(rows.map(r => r.case_id)).size;

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <header className="app-header">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ gap: 5 }}>
          <LayoutDashboard size={16} />
          <span style={{ fontSize: "0.78rem" }}>الرئيسية</span>
        </Link>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div className="app-logo" style={{ fontSize: "1.1rem" }}>قاعدة بيانات الحالات</div>
        </div>
        <Link href="/register" className="btn btn-primary btn-sm">+ إضافة</Link>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.25rem 1rem 5rem" }}>

        {/* Area overview cards */}
        {!loading && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            {/* Grand total */}
            <div className="gradient-green" style={{ borderRadius: "var(--radius)", padding: "1rem" }}>
              <div style={{ fontSize: "0.68rem", opacity: 0.7, marginBottom: 4 }}>إجمالي</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 900 }}>{grandCases}</div>
              <div style={{ fontSize: "0.72rem", opacity: 0.85 }}>حالة — {fmt(grandTotal)} ج/شهر</div>
            </div>
            {Object.entries(areaStats)
              .sort(([a], [b]) => a.localeCompare(b, "ar"))
              .map(([name, stat]) => (
              <div
                key={name}
                className="card"
                style={{
                  cursor: "pointer",
                  border: areaFilter === name ? "2px solid var(--green)" : "1px solid var(--border)",
                  background: areaFilter === name ? "var(--green-light)" : undefined,
                }}
                onClick={() => setAreaFilter(prev => prev === name ? "all" : name)}
              >
                <div style={{ fontWeight: 800, fontSize: "1rem", color: areaFilter === name ? "var(--green)" : "var(--text-1)", marginBottom: 4 }}>{name}</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "var(--indigo)" }}>{stat.cases}</div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 2 }}>{fmt(stat.total)} ج/شهر</div>
              </div>
            ))}
          </div>
        )}

        {/* Search + area filter bar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={15} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الكفيل..."
              className="input-field"
              style={{ paddingRight: 32 }}
            />
          </div>
          <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className="select-field" style={{ minWidth: 130 }}>
            <option value="all">كل المناطق</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Count */}
        {!loading && (
          <div style={{ fontSize: "0.78rem", color: "var(--text-3)", marginBottom: 10 }}>
            {new Set(filtered.map(r => r.case_id)).size} حالة{areaFilter !== "all" ? ` في ${areaFilter}` : ""}{search ? ` — نتائج "${search}"` : ""}
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)" }}>جاري التحميل...</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table" style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th>اسم المستفيد</th>
                  <th>العائل</th>
                  <th>المنطقة</th>
                  <th>النوع</th>
                  <th>الكفيل</th>
                  <th>يدفع عبر</th>
                  <th>مسئول</th>
                  <th style={{ textAlign: "center" }}>الكفالة</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.sponsorship_id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{row.child_name}</div>
                      <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginTop: 2, fontFamily: "monospace" }}>
                        {row.case_id.slice(0, 8)}
                      </div>
                    </td>
                    <td style={{ color: "var(--text-2)", fontSize: "0.85rem" }}>{row.guardian_name || "—"}</td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontSize: "0.72rem" }}>{row.area_name}</span>
                    </td>
                    <td style={{ fontSize: "0.8rem", color: "var(--text-2)" }}>{CASE_TYPE_AR[row.case_type] || row.case_type}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.sponsor_name}</div>
                      {row.sponsor_phone && (
                        <div style={{ fontSize: "0.7rem", color: "var(--text-3)", direction: "ltr", textAlign: "right" }}>{row.sponsor_phone}</div>
                      )}
                    </td>
                    <td style={{ fontSize: "0.82rem", color: row.paid_through ? "var(--text-1)" : "var(--text-3)" }}>
                      {row.paid_through || "مباشر"}
                    </td>
                    <td style={{ fontSize: "0.82rem", color: "var(--text-2)" }}>{row.operator_name || "—"}</td>
                    <td style={{ textAlign: "center", fontWeight: 800, color: "var(--green)", fontSize: "0.95rem" }}>
                      {fmt(row.fixed_amount)} ج
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background: "var(--surface)", fontWeight: 700 }}>
                    <td colSpan={7} style={{ textAlign: "right", color: "var(--text-2)", fontSize: "0.82rem" }}>
                      الإجمالي ({new Set(filtered.map(r => r.case_id)).size} حالة)
                    </td>
                    <td style={{ textAlign: "center", color: "var(--green)", fontWeight: 900 }}>
                      {fmt(filtered.reduce((s, r) => s + r.fixed_amount, 0))} ج
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-3)" }}>لا توجد نتائج</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
