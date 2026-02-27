"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  Users, DollarSign, CheckCircle, Clock, ChevronDown,
  Search, ArrowUpDown, Building2, FileText, TrendingUp,
  TrendingDown, Eye, Plus
} from "lucide-react";

// ─── Types ───
type Sponsor = {
  id: string;
  legacy_id: number;
  name: string;
  phone: string | null;
  responsible_operator_id: string | null;
  paid_through_sponsor_id: string | null;
  is_active: boolean;
};

type Sponsorship = {
  id: string;
  sponsor_id: string;
  case_id: string;
  fixed_amount: number;
  status: string;
  cases: { child_name: string; area_id: string; status: string } | null;
};

type Area = {
  id: string;
  name: string;
};

type Operator = {
  id: string;
  name: string;
};

type SadaqatEntry = {
  id: string;
  transaction_type: string;
  amount: number;
  donor_name: string | null;
  destination_description: string | null;
  destination_type: string | null;
  month_year: string;
  running_balance: number;
  created_at: string;
};

type AdvancePayment = {
  id: string;
  sponsor_id: string;
  case_id: string;
  payment_type: string;
  paid_until: string;
  status: string;
  sponsors: { name: string } | null;
  cases: { child_name: string } | null;
};

// ─── Helpers ───
const fmt = (n: number) => n.toLocaleString("en");

function Badge({ status }: { status: string }) {
  if (status === "paid") return <span className="badge-paid">مدفوع ✓</span>;
  if (status === "partial") return <span className="badge-partial">جزئي</span>;
  return <span className="badge-unpaid">لم يدفع</span>;
}

function ProgressBar({ value, max, color = "bg-emerald-500" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="bg-stone-100 rounded-full h-2 w-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color = "text-emerald-600" }: {
  icon: any; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} className="text-stone-400" />
        <span className="text-xs text-stone-500 font-medium">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-stone-400 mt-1">{sub}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════
export default function Home() {
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  // Data state
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [sadaqat, setSadaqat] = useState<SadaqatEntry[]>([]);
  const [advances, setAdvances] = useState<AdvancePayment[]>([]);

  // Load all data
  useEffect(() => {
    async function load() {
      setLoading(true);
      const [spRes, shRes, arRes, opRes, saRes, avRes] = await Promise.all([
        supabase.from("sponsors").select("*").eq("is_active", true).order("legacy_id"),
        supabase.from("sponsorships").select("*, cases(child_name, area_id, status)").eq("status", "active"),
        supabase.from("areas").select("*"),
        supabase.from("operators").select("*"),
        supabase.from("sadaqat_pool").select("*").order("created_at"),
        supabase.from("advance_payments").select("*, sponsors(name), cases(child_name)").eq("status", "active"),
      ]);
      setSponsors(spRes.data || []);
      setSponsorships(shRes.data || []);
      setAreas(arRes.data || []);
      setOperators(opRes.data || []);
      setSadaqat(saRes.data || []);
      setAdvances(avRes.data || []);
      setLoading(false);
    }
    load();
  }, []);

  // Computed data
  const areaMap = useMemo(() => Object.fromEntries(areas.map(a => [a.id, a.name])), [areas]);
  const opMap = useMemo(() => Object.fromEntries(operators.map(o => [o.id, o.name])), [operators]);
  const ptMap = useMemo(() => Object.fromEntries(sponsors.map(s => [s.id, s.name])), [sponsors]);

  const sponsorData = useMemo(() => {
    return sponsors.map(s => {
      const sships = sponsorships.filter(sh => sh.sponsor_id === s.id);
      const obligation = sships.reduce((sum, sh) => sum + Number(sh.fixed_amount), 0);
      const caseCount = sships.length;
      const byArea: Record<string, number> = {};
      sships.forEach(sh => {
        const areaId = sh.cases?.area_id || "unknown";
        byArea[areaId] = (byArea[areaId] || 0) + Number(sh.fixed_amount);
      });
      return {
        ...s,
        obligation,
        caseCount,
        byArea,
        status: "unpaid" as string, // Will be updated when collections are implemented
        responsible: s.responsible_operator_id ? opMap[s.responsible_operator_id] : "—",
        paidThrough: s.paid_through_sponsor_id ? ptMap[s.paid_through_sponsor_id] : "—",
      };
    }).filter(s => s.obligation > 0);
  }, [sponsors, sponsorships, opMap, ptMap]);

  const totalObligation = sponsorData.reduce((s, sp) => s + sp.obligation, 0);
  const totalSadaqatIn = sadaqat.filter(s => s.transaction_type === "inflow").reduce((s, e) => s + Number(e.amount), 0);
  const totalSadaqatOut = sadaqat.filter(s => s.transaction_type === "outflow").reduce((s, e) => s + Number(e.amount), 0);
  const sadaqatBalance = totalSadaqatIn - totalSadaqatOut;

  // Area breakdown
  const areaBreakdown = useMemo(() => {
    const breakdown: Record<string, { cases: number; total: number }> = {};
    sponsorships.forEach(sh => {
      const areaId = sh.cases?.area_id;
      if (!areaId) return;
      if (!breakdown[areaId]) breakdown[areaId] = { cases: 0, total: 0 };
      breakdown[areaId].cases += 1;
      breakdown[areaId].total += Number(sh.fixed_amount);
    });
    return breakdown;
  }, [sponsorships]);

  const TABS = [
    { id: "overview", label: "نظرة عامة", icon: TrendingUp },
    { id: "sponsors", label: "أرصدة الكفلاء", icon: Users },
    { id: "sadaqat", label: "صندوق الصدقات", icon: DollarSign },
    { id: "locations", label: "التوزيع الشهري", icon: Building2 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center">
          <div className="text-4xl font-bold text-stone-800 mb-2">خدمة</div>
          <div className="text-stone-400 animate-pulse">جاري التحميل...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-stone-900 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">خدمة</h1>
          <p className="text-xs text-stone-400">نظام إدارة الكفالات والصدقات</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/collect"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Plus size={16} />
            تحصيل
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Plus size={16} />
            تسجيل جديد
          </Link>
          <Link
            href="/settle"
            className="px-4 py-2 bg-stone-700 hover:bg-stone-600 text-white text-sm font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <FileText size={16} />
            تسوية الشهر
          </Link>
        </div>
      </header>

      {/* Tab Bar */}
      <nav className="bg-white border-b border-stone-200 flex gap-0 px-4 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
              tab === t.id
                ? "text-stone-900 border-stone-900"
                : "text-stone-400 border-transparent hover:text-stone-600"
            }`}
          >
            <t.icon size={14} className="inline ml-1.5 -mt-0.5" />
            {t.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="max-w-5xl mx-auto p-6">
        {tab === "overview" && (
          <OverviewTab
            sponsorData={sponsorData}
            totalObligation={totalObligation}
            sadaqatBalance={sadaqatBalance}
            totalSadaqatIn={totalSadaqatIn}
            totalSadaqatOut={totalSadaqatOut}
            areaBreakdown={areaBreakdown}
            areaMap={areaMap}
          />
        )}
        {tab === "sponsors" && (
          <SponsorsTab
            sponsorData={sponsorData}
            areaMap={areaMap}
            advances={advances}
          />
        )}
        {tab === "sadaqat" && (
          <SadaqatTab
            sadaqat={sadaqat}
            sadaqatBalance={sadaqatBalance}
            totalSadaqatIn={totalSadaqatIn}
            totalSadaqatOut={totalSadaqatOut}
          />
        )}
        {tab === "locations" && (
          <LocationsTab
            areaBreakdown={areaBreakdown}
            areaMap={areaMap}
            totalObligation={totalObligation}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-stone-400 border-t border-stone-100">
        خدمة v1.0 — متصل بقاعدة البيانات
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════
function OverviewTab({ sponsorData, totalObligation, sadaqatBalance, totalSadaqatIn, totalSadaqatOut, areaBreakdown, areaMap }: any) {
  const totalDisbursement = Object.values(areaBreakdown).reduce((s: number, a: any) => s + a.total, 0);

  return (
    <div>
      <h2 className="text-lg font-bold text-stone-800 mb-5">تسوية فبراير ٢٠٢٦</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Users} label="الكفلاء النشطين" value={sponsorData.length} color="text-indigo-600" />
        <StatCard icon={DollarSign} label="الالتزام الشهري" value={fmt(totalObligation)} sub="ج.م" color="text-stone-800" />
        <StatCard icon={CheckCircle} label="صندوق الصدقات" value={fmt(sadaqatBalance)} sub="ج.م رصيد متاح" color="text-emerald-600" />
        <StatCard icon={Building2} label="إجمالي التوزيع" value={fmt(totalDisbursement)} sub="ج.م" color="text-indigo-600" />
      </div>

      {/* Sadaqat Summary */}
      <div className="bg-gradient-to-br from-emerald-900 to-emerald-950 rounded-2xl p-6 text-white mb-6">
        <h3 className="text-sm font-medium text-emerald-300 mb-3">💰 صندوق الصدقات</h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-xs text-emerald-400">إجمالي الوارد</div>
            <div className="text-xl font-bold">{fmt(totalSadaqatIn)}</div>
          </div>
          <div>
            <div className="text-xs text-emerald-400">إجمالي المنصرف</div>
            <div className="text-xl font-bold">{fmt(totalSadaqatOut)}</div>
          </div>
          <div>
            <div className="text-xs text-emerald-400">الرصيد الحالي</div>
            <div className="text-2xl font-bold">{fmt(sadaqatBalance)}</div>
          </div>
        </div>
      </div>

      {/* Areas */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200">
        <h3 className="text-base font-bold text-stone-800 mb-4">🏘️ التوزيع حسب الموقع</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(areaBreakdown).map(([areaId, data]: [string, any]) => (
            <div key={areaId} className="bg-stone-50 rounded-xl p-4 border border-stone-100">
              <div className="flex justify-between items-start mb-2">
                <div className="font-bold text-stone-800">{areaMap[areaId] || areaId}</div>
                <div className="text-lg font-bold text-indigo-600">{fmt(data.total)} <span className="text-xs text-stone-400">ج.م</span></div>
              </div>
              <div className="text-xs text-stone-400 mb-2">{data.cases} حالة</div>
              <ProgressBar value={data.total} max={totalDisbursement} color="bg-indigo-500" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// SPONSORS TAB
// ═══════════════════════════════════════════
function SponsorsTab({ sponsorData, areaMap, advances }: any) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("obligation");

  const filtered = useMemo(() => {
    let list = sponsorData;
    if (search) list = list.filter((s: any) => s.name.includes(search) || s.paidThrough.includes(search));
    return [...list].sort((a: any, b: any) => {
      if (sortBy === "obligation") return b.obligation - a.obligation;
      if (sortBy === "name") return a.name.localeCompare(b.name, "ar");
      if (sortBy === "cases") return b.caseCount - a.caseCount;
      return 0;
    });
  }, [sponsorData, search, sortBy]);

  return (
    <div>
      <h2 className="text-lg font-bold text-stone-800 mb-1">أرصدة الكفلاء</h2>
      <p className="text-xs text-stone-400 mb-5">الالتزام الشهري لكل كفيل وعدد الحالات</p>

      {/* Controls */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            placeholder="بحث بالاسم..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pr-9 pl-3 py-2 rounded-lg border border-stone-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-300"
          />
        </div>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="px-3 py-2 rounded-lg border border-stone-200 text-sm bg-white"
        >
          <option value="obligation">ترتيب: الالتزام</option>
          <option value="name">ترتيب: الاسم</option>
          <option value="cases">ترتيب: عدد الحالات</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-stone-50 sticky top-0 z-10">
                {["#", "الكفيل", "يدفع من خلال", "المسئول", "الحالات", "الالتزام الشهري"].map(h => (
                  <th key={h} className="px-3 py-3 text-right text-xs font-semibold text-stone-500 border-b-2 border-stone-200 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s: any, i: number) => (
                <tr key={s.id} className="border-b border-stone-50 hover:bg-stone-50/50 transition-colors">
                  <td className="px-3 py-2.5 text-stone-400 text-xs">{s.legacy_id}</td>
                  <td className="px-3 py-2.5 font-semibold text-stone-800">{s.name}</td>
                  <td className="px-3 py-2.5 text-stone-500 text-xs">{s.paidThrough}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      s.responsible === "يوسف" ? "bg-blue-50 text-blue-700" : 
                      s.responsible === "نشوى" ? "bg-purple-50 text-purple-700" : "text-stone-400"
                    }`}>
                      {s.responsible}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-stone-600">{s.caseCount}</td>
                  <td className="px-3 py-2.5 font-bold text-indigo-600">{fmt(s.obligation)} ج.م</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 bg-stone-50 border-t border-stone-200 flex justify-between text-xs text-stone-500">
          <span>عرض {filtered.length} كفيل</span>
          <span>إجمالي: <strong className="text-stone-800">{fmt(filtered.reduce((s: number, sp: any) => s + sp.obligation, 0))} ج.م</strong></span>
        </div>
      </div>

      {/* Advance Payments */}
      {advances.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-stone-200 mt-5">
          <h3 className="text-sm font-bold text-stone-800 mb-1">📅 مدفوعات مقدمة</h3>
          <p className="text-xs text-stone-400 mb-3">كفلاء دفعوا مقدماً - سنوي / نصف سنوي</p>
          <div className="overflow-x-auto max-h-[250px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-stone-50">
                  {["الطفل", "الكفيل", "النوع", "مدفوع حتى"].map(h => (
                    <th key={h} className="px-3 py-2 text-right font-semibold text-stone-500 border-b border-stone-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {advances.map((a: AdvancePayment) => (
                  <tr key={a.id} className="border-b border-stone-50">
                    <td className="px-3 py-2">{a.cases?.child_name}</td>
                    <td className="px-3 py-2 font-semibold">{a.sponsors?.name}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        a.payment_type === "annual" ? "bg-emerald-50 text-emerald-700" :
                        a.payment_type === "semi_annual" ? "bg-blue-50 text-blue-700" :
                        "bg-amber-50 text-amber-700"
                      }`}>
                        {a.payment_type === "annual" ? "سنوي" : a.payment_type === "semi_annual" ? "نصف سنوي" : a.payment_type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-stone-500" dir="ltr">{a.paid_until?.split("T")[0]}</td>
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

// ═══════════════════════════════════════════
// SADAQAT TAB
// ═══════════════════════════════════════════
function SadaqatTab({ sadaqat, sadaqatBalance, totalSadaqatIn, totalSadaqatOut }: any) {
  const [view, setView] = useState<"inflows" | "outflows">("inflows");

  const inflows = sadaqat.filter((s: SadaqatEntry) => s.transaction_type === "inflow");
  const outflows = sadaqat.filter((s: SadaqatEntry) => s.transaction_type === "outflow");
  const current = view === "inflows" ? inflows : outflows;

  // Group by month
  const grouped = useMemo(() => {
    const groups: Record<string, SadaqatEntry[]> = {};
    current.forEach((e: SadaqatEntry) => {
      const key = e.month_year || "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return Object.entries(groups).reverse();
  }, [current]);

  return (
    <div>
      <h2 className="text-lg font-bold text-stone-800 mb-1">صندوق الصدقات</h2>
      <p className="text-xs text-stone-400 mb-5">رصيد الصدقات المتراكم والحركات</p>

      {/* Balance Card */}
      <div className="bg-gradient-to-br from-emerald-900 to-emerald-950 rounded-2xl p-7 text-white mb-6 relative overflow-hidden">
        <div className="absolute -top-6 -left-6 text-[100px] opacity-5">💰</div>
        <div className="text-xs text-emerald-400 mb-2">الرصيد الحالي للصدقات</div>
        <div className="text-4xl font-extrabold mb-5">{fmt(sadaqatBalance)} <span className="text-lg text-emerald-400">ج.م</span></div>
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="text-[10px] text-emerald-500">إجمالي الوارد</div>
            <div className="text-lg font-bold flex items-center gap-1"><TrendingUp size={14} /> {fmt(totalSadaqatIn)}</div>
          </div>
          <div>
            <div className="text-[10px] text-emerald-500">إجمالي المنصرف</div>
            <div className="text-lg font-bold flex items-center gap-1"><TrendingDown size={14} /> {fmt(totalSadaqatOut)}</div>
          </div>
        </div>
      </div>

      {/* Toggle */}
      <div className="flex gap-2 mb-4">
        {[
          { id: "inflows" as const, label: "⬇️ الوارد", count: inflows.length },
          { id: "outflows" as const, label: "⬆️ المنصرف", count: outflows.length },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              view === t.id
                ? "bg-emerald-50 text-emerald-800 border-2 border-emerald-600"
                : "bg-white text-stone-500 border border-stone-200"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Ledger */}
      <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
        <div className="max-h-[500px] overflow-y-auto">
          {grouped.map(([month, entries]) => (
            <div key={month}>
              <div className="px-4 py-2 bg-stone-50 border-b border-stone-200 flex justify-between sticky top-0 z-10">
                <span className="text-xs font-bold text-stone-600">{month}</span>
                <span className={`text-xs font-bold ${view === "inflows" ? "text-emerald-600" : "text-red-600"}`}>
                  {view === "inflows" ? "+" : "-"}{fmt((entries as SadaqatEntry[]).reduce((s, e) => s + Number(e.amount), 0))} ج.م
                </span>
              </div>
              {(entries as SadaqatEntry[]).map(e => (
                <div key={e.id} className="px-4 py-3 flex justify-between items-center border-b border-stone-50">
                  <div>
                    <div className="text-sm font-semibold text-stone-800">{e.donor_name || e.destination_description || "—"}</div>
                    {e.destination_type && <div className="text-[10px] text-stone-400 mt-0.5">{e.destination_type}</div>}
                  </div>
                  <div className={`font-bold text-sm ${view === "inflows" ? "text-emerald-600" : "text-red-600"}`}>
                    {view === "inflows" ? "+" : "-"}{fmt(Number(e.amount))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {grouped.length === 0 && (
            <div className="p-8 text-center text-stone-400 text-sm">لا توجد حركات</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// LOCATIONS TAB
// ═══════════════════════════════════════════
function LocationsTab({ areaBreakdown, areaMap, totalObligation }: any) {
  const totalAll = Object.values(areaBreakdown).reduce((s: number, a: any) => s + a.total, 0);

  const areaColors: Record<string, string> = {};
  const colorList = ["indigo", "amber", "emerald", "pink"];
  Object.keys(areaBreakdown).forEach((id, i) => {
    areaColors[id] = colorList[i % colorList.length];
  });

  return (
    <div>
      <h2 className="text-lg font-bold text-stone-800 mb-1">التوزيع الشهري</h2>
      <p className="text-xs text-stone-400 mb-5">المبالغ المستحقة لكل موقع - فبراير ٢٠٢٦</p>

      {/* Total Card */}
      <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 rounded-2xl p-7 text-white mb-6 text-center">
        <div className="text-xs text-indigo-400">إجمالي التوزيع لفبراير ٢٠٢٦</div>
        <div className="text-4xl font-extrabold mt-1">{fmt(totalAll)} <span className="text-base text-indigo-400">ج.م</span></div>
        <div className="text-xs text-indigo-500 mt-1">
          {Object.values(areaBreakdown).reduce((s: number, a: any) => s + a.cases, 0)} حالة
        </div>
      </div>

      {/* Area Cards */}
      <div className="grid grid-cols-1 gap-4">
        {Object.entries(areaBreakdown).map(([areaId, data]: [string, any]) => {
          const pct = totalAll > 0 ? ((data.total / totalAll) * 100).toFixed(1) : "0";
          return (
            <div key={areaId} className="bg-white rounded-2xl p-6 border border-stone-200">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-lg font-bold text-stone-800">{areaMap[areaId] || "غير محدد"}</div>
                  <div className="text-xs text-stone-400">{data.cases} حالة • {pct}% من الإجمالي</div>
                </div>
                <div className="text-left">
                  <div className="text-2xl font-extrabold text-indigo-600">{fmt(data.total)}</div>
                  <div className="text-xs text-stone-400">ج.م</div>
                </div>
              </div>
              <ProgressBar value={data.total} max={totalAll} color="bg-indigo-500" />
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200 mt-6">
        <h3 className="text-sm font-bold text-stone-800 mb-4">📋 ملخص التسوية</h3>
        <div className="space-y-0 text-sm">
          {[
            { label: "إجمالي الالتزام الشهري", value: fmt(totalObligation), bold: false },
            { label: "إجمالي التوزيع المطلوب", value: fmt(totalAll), bold: true, color: "text-indigo-600" },
          ].map((row, i) => (
            <div key={i} className="flex justify-between py-2.5 border-b border-stone-50">
              <span className="text-stone-600">{row.label}</span>
              <strong className={row.color || "text-stone-800"}>{row.value} ج.م</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
