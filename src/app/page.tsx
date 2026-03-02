"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  Users, DollarSign, TrendingUp, TrendingDown, Building2,
  Search, Plus, FileText, ChevronDown
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────
type Sponsor = {
  id: string; legacy_id: number; name: string; phone: string | null;
  responsible_operator_id: string | null; paid_through_sponsor_id: string | null;
};
type Sponsorship = {
  id: string; sponsor_id: string; case_id: string; fixed_amount: number;
  cases: { child_name: string; area_id: string } | null;
};
type Area     = { id: string; name: string };
type Operator = { id: string; name: string; role: string };
type SadaqatEntry = {
  id: string; transaction_type: string; amount: number;
  donor_name: string | null; destination_description: string | null;
  destination_type: string | null; month_year: string; created_at: string;
};
type AdvancePayment = {
  id: string; sponsor_id: string; case_id: string; payment_type: string;
  paid_until: string; status: string;
  sponsors: { name: string } | null; cases: { child_name: string } | null;
};
type MonthCollection = { sponsor_id: string; total: number };
type DisbursementRow  = { area_id: string; fixed_total: number; extras_total: number };

// ─── Utilities ───────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString("en");

const MONTHS_AR: Record<string, string> = {
  "01":"يناير","02":"فبراير","03":"مارس","04":"أبريل",
  "05":"مايو","06":"يونيو","07":"يوليو","08":"أغسطس",
  "09":"سبتمبر","10":"أكتوبر","11":"نوفمبر","12":"ديسمبر",
};

function fmtMonth(m: string) {
  if (m === "all") return "كل الوقت";
  const [y, mo] = m.split("-");
  return `${MONTHS_AR[mo] || mo} ${y}`;
}

function genMonthOptions() {
  const opts: { value: string; label: string }[] = [{ value: "all", label: "كل الوقت ★" }];
  const now = new Date();
  // Start from 1 month ahead so the working month is always available
  for (let i = -1; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value, label: fmtMonth(value) });
  }
  return opts;
}

function currentMonth() {
  const now = new Date();
  // In the last 7 days of the month, default to next month (prepare ahead)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const d = now.getDate() >= lastDay - 6
    ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
    : now;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function StatusBadge({ paid, obligation }: { paid: number; obligation: number }) {
  if (paid >= obligation && obligation > 0) return <span className="badge badge-paid">مدفوع ✓</span>;
  if (paid > 0)                             return <span className="badge badge-partial">جزئي</span>;
  return <span className="badge badge-unpaid">لم يدفع</span>;
}

function ProgressBar({ value, max, color = "var(--green)" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = "var(--green)" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="stat-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--green-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon size={16} color="var(--green)" />
        </div>
        <span style={{ fontSize: "0.75rem", color: "var(--text-3)", fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: "1.6rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════
export default function Home() {
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());

  // Static data
  const [sponsors,     setSponsors]     = useState<Sponsor[]>([]);
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [areas,        setAreas]        = useState<Area[]>([]);
  const [operators,    setOperators]    = useState<Operator[]>([]);
  const [sadaqat,      setSadaqat]      = useState<SadaqatEntry[]>([]);
  const [advances,     setAdvances]     = useState<AdvancePayment[]>([]);

  // Month-specific
  const [monthCollections,   setMonthCollections]   = useState<MonthCollection[]>([]);
  const [monthDisbursements, setMonthDisbursements] = useState<DisbursementRow[]>([]);
  const [monthLoading,       setMonthLoading]       = useState(false);

  const monthOptions = useMemo(genMonthOptions, []);

  // Initial load
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [spRes, shRes, arRes, opRes, saRes, avRes] = await Promise.all([
        // legacy_id=126 is the virtual "صدقات" account — not a real sponsor, excluded from obligation
        supabase.from("sponsors").select("*").eq("is_active", true).neq("legacy_id", 126).order("legacy_id"),
        supabase.from("sponsorships").select("*, cases(child_name, area_id)").eq("status", "active"),
        supabase.from("areas").select("*"),
        supabase.from("operators").select("*").neq("name", "شريف"),
        supabase.from("sadaqat_pool").select("*").order("created_at"),
        supabase.from("advance_payments").select("*, sponsors(name), cases(child_name)").eq("status", "active"),
      ]);
      const activeSponsors = spRes.data || [];
      // Only count sponsorships belonging to real (non-صدقات) sponsors
      const validSponsorIds = new Set(activeSponsors.map((s: Sponsor) => s.id));
      setSponsors(activeSponsors);
      setSponsorships((shRes.data || []).filter(sh => validSponsorIds.has(sh.sponsor_id)));
      setAreas(arRes.data || []);
      setOperators(opRes.data || []);
      setSadaqat(saRes.data || []);
      setAdvances(avRes.data || []);
      setLoading(false);
    })();
  }, []);

  // Month-specific collections + disbursements
  useEffect(() => {
    if (selectedMonth === "all") {
      setMonthCollections([]);
      setMonthDisbursements([]);
      return;
    }
    setMonthLoading(true);
    Promise.all([
      supabase.from("collections").select("sponsor_id, amount")
        .eq("month_year", selectedMonth).eq("status", "confirmed"),
      supabase.from("disbursements").select("area_id, fixed_total, extras_total")
        .eq("month_year", selectedMonth),
    ]).then(([collRes, disbRes]) => {
      const grouped: Record<string, number> = {};
      (collRes.data || []).forEach(c => { grouped[c.sponsor_id] = (grouped[c.sponsor_id] || 0) + Number(c.amount); });
      setMonthCollections(Object.entries(grouped).map(([sponsor_id, total]) => ({ sponsor_id, total })));
      setMonthDisbursements((disbRes.data || []) as DisbursementRow[]);
      setMonthLoading(false);
    });
  }, [selectedMonth]);

  // Computed maps
  const areaMap  = useMemo(() => Object.fromEntries(areas.map(a => [a.id, a.name])), [areas]);
  const opMap    = useMemo(() => Object.fromEntries(operators.map(o => [o.id, o.name])), [operators]);
  const ptMap    = useMemo(() => Object.fromEntries(sponsors.map(s => [s.id, s.name])), [sponsors]);
  const collMap  = useMemo(() => Object.fromEntries(monthCollections.map(c => [c.sponsor_id, c.total])), [monthCollections]);

  // Sponsor data with payment status
  const sponsorData = useMemo(() => sponsors.map(s => {
    const sships     = sponsorships.filter(sh => sh.sponsor_id === s.id);
    const obligation = sships.reduce((sum, sh) => sum + Number(sh.fixed_amount), 0);
    const paid       = collMap[s.id] || 0;
    const byArea: Record<string, number> = {};
    sships.forEach(sh => {
      const aId = sh.cases?.area_id || "unknown";
      byArea[aId] = (byArea[aId] || 0) + Number(sh.fixed_amount);
    });
    return {
      ...s,
      obligation,
      paid,
      caseCount:  sships.length,
      byArea,
      responsible: s.responsible_operator_id ? opMap[s.responsible_operator_id] : "—",
      paidThrough: s.paid_through_sponsor_id  ? ptMap[s.paid_through_sponsor_id]  : "—",
    };
  }).filter(s => s.obligation > 0), [sponsors, sponsorships, opMap, ptMap, collMap]);

  // Financial totals
  const totalObligation = sponsorData.reduce((s, sp) => s + sp.obligation, 0);
  const totalCollected  = monthCollections.reduce((s, c) => s + c.total, 0);
  // Collection tracking starts March 2026. For all earlier months treat as 100% collected.
  const COLLECTION_START = "2026-03";
  const effectiveCollected = (selectedMonth !== "all" && selectedMonth < COLLECTION_START)
    ? totalObligation
    : totalCollected;

  const filteredSadaqat = selectedMonth === "all" ? sadaqat : sadaqat.filter(s => s.month_year === selectedMonth);
  const sadaqatIn  = filteredSadaqat.filter(s => s.transaction_type === "inflow").reduce((s, e)  => s + Number(e.amount), 0);
  const sadaqatOut = filteredSadaqat.filter(s => s.transaction_type === "outflow").reduce((s, e) => s + Number(e.amount), 0);
  const sadaqatBal = selectedMonth === "all"
    ? sadaqat.filter(s => s.transaction_type === "inflow").reduce((s, e) => s + Number(e.amount), 0)
    - sadaqat.filter(s => s.transaction_type === "outflow").reduce((s, e) => s + Number(e.amount), 0)
    : sadaqatIn - sadaqatOut;

  // Area breakdown from current sponsorships (always-current baseline)
  const areaBreakdown = useMemo(() => {
    const bd: Record<string, { cases: number; total: number }> = {};
    sponsorships.forEach(sh => {
      const aId = sh.cases?.area_id;
      if (!aId) return;
      if (!bd[aId]) bd[aId] = { cases: 0, total: 0 };
      bd[aId].cases++;
      bd[aId].total += Number(sh.fixed_amount);
    });
    return bd;
  }, [sponsorships]);

  // Area breakdown for selected month — uses historical disbursements when available
  const areaBreakdownForMonth = useMemo(() => {
    if (selectedMonth !== "all" && monthDisbursements.length > 0) {
      const bd: Record<string, { cases: number; total: number; fixed: number; extras: number }> = {};
      monthDisbursements.forEach(d => {
        bd[d.area_id] = {
          cases: areaBreakdown[d.area_id]?.cases || 0,
          fixed: Number(d.fixed_total),
          extras: Number(d.extras_total),
          total: Number(d.fixed_total) + Number(d.extras_total),
        };
      });
      return bd;
    }
    // Fallback: current sponsorships (no extras breakdown for "all")
    const bd: Record<string, { cases: number; total: number; fixed: number; extras: number }> = {};
    Object.entries(areaBreakdown).forEach(([aId, data]) => {
      bd[aId] = { cases: data.cases, total: data.total, fixed: data.total, extras: 0 };
    });
    return bd;
  }, [selectedMonth, monthDisbursements, areaBreakdown]);

  const paidCount = sponsorData.filter(s => s.paid >= s.obligation && s.obligation > 0).length;

  const TABS = [
    { id: "overview",   label: "نظرة عامة",        icon: TrendingUp   },
    { id: "sponsors",   label: "أرصدة الكفلاء",    icon: Users        },
    { id: "sadaqat",    label: "صندوق الصدقات",     icon: DollarSign   },
    { id: "locations",  label: "التوزيع الشهري",    icon: Building2    },
  ];

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cream)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--green)", marginBottom: 8 }}>خدمة</div>
        <div style={{ color: "var(--text-3)", fontSize: "0.9rem" }}>جاري التحميل...</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      {/* ── Header ── */}
      <header className="app-header">
        <div>
          <div className="app-logo">خدمة</div>
          <span className="app-logo-sub">نظام إدارة الكفالات</span>
        </div>
        {/* Desktop actions */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div className="hidden md:flex" style={{ display: "flex", gap: 8 }}>
            <Link href="/collect"  className="btn btn-primary btn-sm"><Plus size={15} />تحصيل</Link>
            <Link href="/register" className="btn btn-secondary btn-sm"><Plus size={15} />تسجيل</Link>
            <Link href="/settle"   className="btn btn-secondary btn-sm"><FileText size={15} />تسوية الشهر</Link>
          </div>
          {/* Month selector */}
          <div style={{ position: "relative" }}>
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="select-field"
              style={{ paddingLeft: 32, minWidth: 150, height: 40, fontSize: "0.82rem" }}
            >
              {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
          </div>
        </div>
      </header>

      {/* ── Tab bar ── */}
      <div className="tab-bar" style={{ paddingRight: 8 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`tab-item${tab === t.id ? " active" : ""}`}>
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Month label ── */}
      {monthLoading && (
        <div style={{ textAlign: "center", padding: "6px", fontSize: "0.75rem", color: "var(--text-3)", background: "var(--green-light)" }}>
          جاري تحديث بيانات {fmtMonth(selectedMonth)}...
        </div>
      )}

      {/* ── Content ── */}
      <main style={{ maxWidth: 1060, margin: "0 auto", padding: "1.5rem 1rem" }}>
        {tab === "overview"  && <OverviewTab  sponsorData={sponsorData} totalObligation={totalObligation} totalCollected={effectiveCollected} paidCount={paidCount} sadaqatBal={sadaqatBal} sadaqatIn={sadaqatIn} sadaqatOut={sadaqatOut} areaBreakdown={areaBreakdownForMonth} areaMap={areaMap} selectedMonth={selectedMonth} />}
        {tab === "sponsors"  && <SponsorsTab  sponsorData={sponsorData} advances={advances} selectedMonth={selectedMonth} />}
        {tab === "sadaqat"   && <SadaqatTab   sadaqat={sadaqat} sadaqatBal={sadaqatBal} sadaqatIn={sadaqatIn} sadaqatOut={sadaqatOut} selectedMonth={selectedMonth} />}
        {tab === "locations" && <LocationsTab areaBreakdown={areaBreakdownForMonth} areaMap={areaMap} totalObligation={totalObligation} selectedMonth={selectedMonth} />}
      </main>

      <footer style={{ textAlign: "center", padding: "1.5rem", fontSize: "0.72rem", color: "var(--text-3)", borderTop: "1px solid var(--border-light)" }}>
        خدمة v2.0 — {fmtMonth(selectedMonth)}
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════════════════
function OverviewTab({ sponsorData, totalObligation, totalCollected, paidCount, sadaqatBal, sadaqatIn, sadaqatOut, areaBreakdown, areaMap, selectedMonth }: any) {
  const totalDisb = Object.values(areaBreakdown).reduce((s: number, a: any) => s + a.total, 0);
  const isMonthly = selectedMonth !== "all";

  return (
    <div>
      <div style={{ marginBottom: 24, display: "flex", alignItems: "baseline", gap: 12 }}>
        <h2 style={{ margin: 0 }}>{isMonthly ? `تقرير ${fmtMonth(selectedMonth)}` : "نظرة إجمالية"}</h2>
        {isMonthly && (
          <span style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>
            {paidCount} من {sponsorData.length} كفيل دفعوا
          </span>
        )}
      </div>

      {/* Stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard icon={Users}      label="الكفلاء النشطون"   value={sponsorData.length}          color="var(--indigo)" sub="عدد الكفلاء المسجلين في النظام" />
        <StatCard icon={DollarSign} label="الالتزام الشهري"   value={fmt(totalObligation) + " ج"} color="var(--text-1)" sub="إجمالي ما يلتزم به الكفلاء من دفع شهرياً" />
        {isMonthly
          ? <StatCard icon={TrendingUp}  label="تم تحصيله"      value={fmt(totalCollected) + " ج"} color="var(--green)"  sub="المبلغ المستلم فعلياً حتى الآن هذا الشهر" />
          : <StatCard icon={DollarSign}  label="رصيد الصدقات"   value={fmt(sadaqatBal) + " ج"}     color="var(--green)"  sub="الرصيد التراكمي المتاح للتوزيع من الصدقات" />
        }
        <StatCard icon={Building2} label="إجمالي التوزيع"   value={fmt(totalDisb) + " ج"}         color="var(--indigo)" sub="مجموع الكفالات المستحقة للمستفيدين بحسب المناطق" />
      </div>

      {/* Collection progress (month mode) */}
      {isMonthly && totalCollected > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>نسبة التحصيل</span>
            <span style={{ fontWeight: 800, color: "var(--green)", fontSize: "1.1rem" }}>
              {totalObligation > 0 ? Math.round((totalCollected / totalObligation) * 100) : 0}٪
            </span>
          </div>
          <ProgressBar value={totalCollected} max={totalObligation} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: "0.75rem", color: "var(--text-3)" }}>
            <span>تم: {fmt(totalCollected)} ج.م</span>
            <span>المتبقي: {fmt(Math.max(0, totalObligation - totalCollected))} ج.م</span>
          </div>
        </div>
      )}

      {/* Sadaqat card */}
      <div className="gradient-green" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", opacity: 0.7, marginBottom: 12, textTransform: "uppercase" }}>
          💰 صندوق الصدقات
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            { label: "إجمالي الوارد", val: sadaqatIn,  note: "تبرعات مستلمة" },
            { label: "إجمالي الصادر", val: sadaqatOut, note: "موزّع على حالات" },
            { label: "الرصيد الحالي", val: sadaqatBal, note: "المتبقي للتوزيع", large: true },
          ].map((item, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.68rem", opacity: 0.65, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: item.large ? "1.5rem" : "1.1rem", fontWeight: 800 }}>
                {fmt(item.val)}
              </div>
              <div style={{ fontSize: "0.63rem", opacity: 0.45, marginTop: 2 }}>{item.note}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Areas */}
      <div className="card">
        <h3 style={{ marginBottom: 16, fontSize: "0.9rem" }}>🏘️ التوزيع حسب الموقع</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {Object.entries(areaBreakdown).map(([aId, data]: [string, any]) => {
            const cardEl = (
              <div style={{ background: "var(--cream)", borderRadius: "var(--radius)", padding: "1rem", border: "1px solid var(--border-light)", cursor: isMonthly ? "pointer" : "default" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>{areaMap[aId] || "—"}</span>
                  <span style={{ fontWeight: 800, color: "var(--indigo)", fontSize: "0.95rem" }}>{fmt(data.total)}</span>
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginBottom: 4 }}>{data.cases} حالة</div>
                {isMonthly && (
                  <div style={{ fontSize: "0.7rem", color: "var(--amber)", marginBottom: 6 }}>
                    كفالات {fmt(data.fixed)} + زيادات {fmt(data.extras)}
                  </div>
                )}
                <ProgressBar value={data.total} max={totalDisb} color="var(--indigo)" />
              </div>
            );
            return isMonthly
              ? <Link key={aId} href={`/report?area=${aId}&month=${selectedMonth}`} style={{ textDecoration: "none", color: "inherit" }}>{cardEl}</Link>
              : <div key={aId}>{cardEl}</div>;
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SPONSORS TAB
// ═══════════════════════════════════════════════════════════════════════
function SponsorsTab({ sponsorData, advances, selectedMonth }: any) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("obligation");

  const filtered = useMemo(() => {
    let list = sponsorData;
    if (search) list = list.filter((s: any) =>
      s.name.includes(search) || (s.paidThrough !== "—" && s.paidThrough.includes(search))
    );
    return [...list].sort((a: any, b: any) => {
      if (sortBy === "obligation") return b.obligation - a.obligation;
      if (sortBy === "name")       return a.name.localeCompare(b.name, "ar");
      if (sortBy === "cases")      return b.caseCount - a.caseCount;
      return 0;
    });
  }, [sponsorData, search, sortBy]);

  const isMonthly = selectedMonth !== "all";
  const totalShown = filtered.reduce((s: number, sp: any) => s + sp.obligation, 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>أرصدة الكفلاء</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>{filtered.length} كفيل</span>
      </div>
      <p style={{ fontSize: "0.82rem", color: "var(--text-3)", marginBottom: 16, margin: "0 0 1rem" }}>
        {isMonthly ? `حالة السداد — ${fmtMonth(selectedMonth)}` : "الالتزام الشهري وعدد الحالات"}
      </p>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
          <input placeholder="بحث بالاسم..." value={search} onChange={e => setSearch(e.target.value)}
            className="input-field" style={{ paddingRight: 32, height: 40 }} />
        </div>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="select-field" style={{ width: "auto", minWidth: 160, height: 40 }}>
          <option value="obligation">ترتيب: الالتزام</option>
          <option value="name">ترتيب: الاسم</option>
          <option value="cases">ترتيب: عدد الحالات</option>
        </select>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>الكفيل</th>
                <th>يدفع من خلال</th>
                <th>المسئول</th>
                <th style={{ textAlign: "center" }}>الحالات</th>
                <th style={{ textAlign: "center" }}>الالتزام</th>
                {isMonthly && <th style={{ textAlign: "center" }}>حالة السداد</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: any) => (
                <tr key={s.id}>
                  <td style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>{s.legacy_id}</td>
                  <td style={{ fontWeight: 700, color: "var(--text-1)" }}>{s.name}</td>
                  <td style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>{s.paidThrough}</td>
                  <td>
                    <span style={{
                      padding: "2px 8px", borderRadius: 100, fontSize: "0.72rem", fontWeight: 600,
                      background: s.responsible === "يوسف" ? "var(--indigo-light)" : s.responsible === "نشوى" ? "#F3EFF9" : "var(--surface-2)",
                      color:      s.responsible === "يوسف" ? "var(--indigo)"       : s.responsible === "نشوى" ? "#7B4FAD"   : "var(--text-3)",
                    }}>{s.responsible}</span>
                  </td>
                  <td style={{ textAlign: "center" }}>{s.caseCount}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: "var(--gold)" }}>{fmt(s.obligation)} ج</td>
                  {isMonthly && (
                    <td style={{ textAlign: "center" }}>
                      <StatusBadge paid={s.paid} obligation={s.obligation} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "0.75rem 1rem", background: "var(--surface-2)", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-3)" }}>
          <span>عرض {filtered.length} كفيل</span>
          <span>إجمالي: <strong style={{ color: "var(--text-1)" }}>{fmt(totalShown)} ج.م</strong></span>
        </div>
      </div>

      {/* Advance payments */}
      {advances.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: "0.9rem", marginBottom: 4 }}>📅 مدفوعات مقدمة</h3>
          <p style={{ fontSize: "0.78rem", color: "var(--text-3)", marginBottom: 12 }}>كفلاء دفعوا سنوياً أو نصف سنوياً مقدماً</p>
          <div style={{ overflowX: "auto", maxHeight: 240, overflowY: "auto" }}>
            <table className="data-table" style={{ fontSize: "0.8rem" }}>
              <thead>
                <tr>
                  <th>الطفل</th><th>الكفيل</th><th>النوع</th><th>مدفوع حتى</th>
                </tr>
              </thead>
              <tbody>
                {advances.map((a: AdvancePayment) => (
                  <tr key={a.id}>
                    <td>{a.cases?.child_name}</td>
                    <td style={{ fontWeight: 600 }}>{a.sponsors?.name}</td>
                    <td>
                      <span className={`badge ${a.payment_type === "annual" ? "badge-paid" : a.payment_type === "semi_annual" ? "badge-advance" : "badge-neutral"}`}>
                        {a.payment_type === "annual" ? "سنوي" : a.payment_type === "semi_annual" ? "نصف سنوي" : a.payment_type}
                      </span>
                    </td>
                    <td dir="ltr" style={{ color: "var(--text-3)" }}>{a.paid_until?.split("T")[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SADAQAT TAB
// ═══════════════════════════════════════════════════════════════════════
function SadaqatTab({ sadaqat, sadaqatBal, sadaqatIn, sadaqatOut, selectedMonth }: any) {
  const [view, setView] = useState<"inflows" | "outflows">("inflows");

  const all = selectedMonth === "all" ? sadaqat : sadaqat.filter((s: SadaqatEntry) => s.month_year === selectedMonth);
  const inflows  = all.filter((s: SadaqatEntry) => s.transaction_type === "inflow");
  const outflows = all.filter((s: SadaqatEntry) => s.transaction_type === "outflow");
  const current  = view === "inflows" ? inflows : outflows;

  const grouped = useMemo(() => {
    const groups: Record<string, SadaqatEntry[]> = {};
    current.forEach((e: SadaqatEntry) => {
      const k = e.month_year || "—";
      if (!groups[k]) groups[k] = [];
      groups[k].push(e);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [current]);

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>صندوق الصدقات</h2>
      <p style={{ fontSize: "0.82rem", color: "var(--text-3)", marginBottom: 20, margin: "0 0 1.25rem" }}>
        {selectedMonth === "all" ? "الرصيد التراكمي منذ البداية" : `حركات ${fmtMonth(selectedMonth)}`}
      </p>

      {/* Balance card */}
      <div className="gradient-green" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, opacity: 0.65, letterSpacing: "0.06em", marginBottom: 14 }}>
          الرصيد الحالي للصدقات
        </div>
        <div style={{ fontSize: "2.5rem", fontWeight: 900, marginBottom: 16 }}>
          {fmt(sadaqatBal)} <span style={{ fontSize: "1rem", opacity: 0.6 }}>ج.م</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: "0.68rem", opacity: 0.6, marginBottom: 2 }}>إجمالي الوارد</div>
            <div style={{ fontWeight: 800, fontSize: "1.1rem", display: "flex", alignItems: "center", gap: 6 }}>
              <TrendingUp size={15} /> {fmt(sadaqatIn)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.68rem", opacity: 0.6, marginBottom: 2 }}>إجمالي المنصرف</div>
            <div style={{ fontWeight: 800, fontSize: "1.1rem", display: "flex", alignItems: "center", gap: 6 }}>
              <TrendingDown size={15} /> {fmt(sadaqatOut)}
            </div>
          </div>
        </div>
      </div>

      {/* Toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {([["inflows", "⬇️ الوارد", inflows.length], ["outflows", "⬆️ الصادر", outflows.length]] as [string, string, number][]).map(([id, label, count]) => (
          <button key={id} onClick={() => setView(id as any)} className="btn" style={{
            flex: 1,
            background: view === id ? "var(--green-light)" : "var(--surface)",
            color: view === id ? "var(--green)" : "var(--text-3)",
            border: view === id ? "2px solid var(--green)" : "1.5px solid var(--border)",
            fontWeight: 600, fontSize: "0.875rem",
          }}>
            {label} ({count})
          </button>
        ))}
      </div>

      {/* Ledger */}
      <div className="card" style={{ padding: 0, overflow: "hidden", maxHeight: 500, overflowY: "auto" }}>
        {grouped.map(([month, entries]) => (
          <div key={month}>
            <div style={{ padding: "8px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 5 }}>
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-2)" }}>{month}</span>
              <span style={{ fontSize: "0.78rem", fontWeight: 700, color: view === "inflows" ? "var(--green)" : "var(--red)" }}>
                {view === "inflows" ? "+" : "−"}{fmt((entries as SadaqatEntry[]).reduce((s, e) => s + Number(e.amount), 0))} ج
              </span>
            </div>
            {(entries as SadaqatEntry[]).map(e => (
              <div key={e.id} style={{ padding: "0.75rem 1rem", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-light)" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text-1)" }}>
                    {e.donor_name || e.destination_description || "—"}
                  </div>
                  {e.destination_type && <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 2 }}>{e.destination_type}</div>}
                </div>
                <div style={{ fontWeight: 700, color: view === "inflows" ? "var(--green)" : "var(--red)" }}>
                  {view === "inflows" ? "+" : "−"}{fmt(Number(e.amount))}
                </div>
              </div>
            ))}
          </div>
        ))}
        {grouped.length === 0 && (
          <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-3)", fontSize: "0.875rem" }}>
            لا توجد حركات في هذه الفترة
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// LOCATIONS TAB
// ═══════════════════════════════════════════════════════════════════════
function LocationsTab({ areaBreakdown, areaMap, totalObligation, selectedMonth }: any) {
  const totalFixed  = Object.values(areaBreakdown).reduce((s: number, a: any) => s + (a.fixed  || 0), 0);
  const totalExtras = Object.values(areaBreakdown).reduce((s: number, a: any) => s + (a.extras || 0), 0);
  const totalAll    = Object.values(areaBreakdown).reduce((s: number, a: any) => s + a.total, 0);
  const totalCases  = Object.values(areaBreakdown).reduce((s: number, a: any) => s + a.cases, 0);
  const isHistorical = selectedMonth !== "all";

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>التوزيع الشهري</h2>
      <p style={{ fontSize: "0.82rem", color: "var(--text-3)", marginBottom: 20, margin: "0 0 1.25rem" }}>
        {isHistorical ? `المبالغ المنصرفة فعلياً — ${fmtMonth(selectedMonth)}` : "المبالغ المستحقة لكل موقع بناءً على الكفالات النشطة"}
      </p>

      {/* Total */}
      <div className="gradient-indigo" style={{ marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, opacity: 0.65, letterSpacing: "0.06em", marginBottom: 8 }}>
          إجمالي التوزيع {isHistorical ? fmtMonth(selectedMonth) : "الشهري"}
        </div>
        <div style={{ fontSize: "2.5rem", fontWeight: 900, marginBottom: 4 }}>
          {fmt(totalAll)} <span style={{ fontSize: "1rem", opacity: 0.6 }}>ج.م</span>
        </div>
        {isHistorical && totalExtras > 0 ? (
          <div style={{ fontSize: "0.78rem", opacity: 0.7 }}>
            كفالات: {fmt(totalFixed)} &nbsp;+&nbsp; زيادات: {fmt(totalExtras)}
          </div>
        ) : (
          <div style={{ fontSize: "0.78rem", opacity: 0.6 }}>{totalCases} حالة نشطة</div>
        )}
      </div>

      {/* Area cards */}
      <div style={{ display: "grid", gap: 12 }}>
        {Object.entries(areaBreakdown).map(([aId, data]: [string, any]) => {
          const pct = totalAll > 0 ? (data.total / totalAll * 100).toFixed(1) : "0";
          const cardEl = (
            <div className="card" style={{ cursor: isHistorical ? "pointer" : "default" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: "1.05rem", marginBottom: 2 }}>{areaMap[aId] || "غير محدد"}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
                    {data.cases} حالة &nbsp;·&nbsp; {pct}٪ من الإجمالي
                  </div>
                  {isHistorical && (
                    <div style={{ fontSize: "0.72rem", color: "var(--amber)", marginTop: 4 }}>
                      كفالات {fmt(data.fixed)} &nbsp;+&nbsp; زيادات {fmt(data.extras)} &nbsp;=&nbsp; <strong>{fmt(data.total)}</strong>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "var(--indigo)" }}>{fmt(data.total)}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>ج.م</div>
                </div>
              </div>
              <ProgressBar value={data.total} max={totalAll} color="var(--indigo)" />
            </div>
          );
          return isHistorical
            ? <Link key={aId} href={`/report?area=${aId}&month=${selectedMonth}`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>{cardEl}</Link>
            : <div key={aId}>{cardEl}</div>;
        })}
      </div>

      {/* Summary */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: "0.9rem", marginBottom: 16 }}>📋 ملخص التسوية</h3>
        {[
          { label: "إجمالي الالتزام الشهري",  value: fmt(totalObligation), color: "var(--text-1)", note: "ما يلتزم به الكفلاء من دفع" },
          { label: "إجمالي التوزيع المطلوب",   value: fmt(totalAll),        color: "var(--indigo)", note: "ما يُصرف للمستفيدين عبر المناطق" },
        ].map((row, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.65rem 0", borderBottom: "1px solid var(--border-light)" }}>
            <div>
              <div style={{ color: "var(--text-2)", fontSize: "0.875rem" }}>{row.label}</div>
              <div style={{ color: "var(--text-3)", fontSize: "0.7rem", marginTop: 1 }}>{row.note}</div>
            </div>
            <strong style={{ color: row.color }}>{row.value} ج.م</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

