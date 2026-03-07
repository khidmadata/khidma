"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard, CheckCircle, Circle, ChevronDown, ChevronUp,
  CalendarCheck, Plus, Pencil, Trash2, Search, X, Loader2,
} from "lucide-react";
import Link from "next/link";

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

function fmtDate(d: string) {
  if (!d) return "—";
  const [y, m] = d.split("-");
  return `${MONTHS_AR[m] || m} ${y}`;
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

const PT_LABELS: Record<string, string> = {
  annual: "سنوي", semi_annual: "نصف سنوي", quarterly: "ربع سنوي", compensation: "تعويض",
};

// ─── Types ────────────────────────────────────────────────────────────────────
type PendingSponsor = {
  sponsor_id:   string;
  sponsor_name: string;
  phone:        string | null;
  fixed:        number;
  extras:       number;
  obligation:   number;
  collected:    number;
  outstanding:  number;
  cases:        { child_name: string; guardian_name: string | null }[];
  checked:      boolean;
  amount:       number;
  received_by:  string;
  advance_paid: boolean;
};

type AdvPmt = {
  id: string;
  sponsor_id: string;
  case_id: string;
  payment_type: string;
  paid_from: string;
  paid_until: string;
  amount_per_month: number | null;
  total_paid: number | null;
  status: string;
  notes: string | null;
  sponsors: { name: string; phone?: string | null } | null;
  cases: { child_name: string } | null;
};

type Operator = { id: string; name: string };

// ═══════════════════════════════════════════════════════════════════════════════
export default function TahseelPage() {
  const monthOptions = useMemo(genMonths, []);
  const [selectedMonth,   setSelectedMonth]   = useState(currentMonth());
  const [sponsors,        setSponsors]        = useState<PendingSponsor[]>([]);
  const [operators,       setOperators]       = useState<Operator[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [confirmMode,     setConfirmMode]     = useState(false);
  const [savedOk,         setSavedOk]         = useState(false);
  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [globalReceivedBy,setGlobalReceivedBy]= useState("");

  // Advance payments
  const [advPayments,  setAdvPayments]  = useState<AdvPmt[]>([]);
  const [allSponsors,  setAllSponsors]  = useState<{ id: string; name: string }[]>([]);
  const [advSearch,    setAdvSearch]    = useState("");
  const [advView,      setAdvView]      = useState<"active" | "pending">("active");
  const [advFormOpen,  setAdvFormOpen]  = useState(false);
  const [advEditId,    setAdvEditId]    = useState<string | null>(null);
  // Form fields
  const [fSpId,        setFSpId]        = useState("");
  const [fSpSearch,    setFSpSearch]    = useState("");
  const [fSpDrop,      setFSpDrop]      = useState(false);
  const [fCaseId,      setFCaseId]      = useState("");
  const [fCases,       setFCases]       = useState<{ id: string; child_name: string }[]>([]);
  const [fType,        setFType]        = useState("annual");
  const [fFrom,        setFFrom]        = useState("");
  const [fUntil,       setFUntil]       = useState("");
  const [fAmtPerMonth, setFAmtPerMonth] = useState("");
  const [fTotalPaid,   setFTotalPaid]   = useState("");
  const [fStatus,      setFStatus]      = useState("active");
  const [fNotes,       setFNotes]       = useState("");
  const [fSaving,      setFSaving]      = useState(false);

  const advSectionRef = useRef<HTMLDivElement>(null);
  const [bulking,      setBulking]      = useState(false);
  const [bulkDone,     setBulkDone]     = useState(false);

  useEffect(() => {
    load(selectedMonth);
    setConfirmMode(false);
    setSavedOk(false);
  }, [selectedMonth]);

  async function load(month: string) {
    setLoading(true);
    const firstOfMonth = month + "-01";

    const [spRes, adjRes, colRes, opRes, advRes] = await Promise.all([
      supabase.from("sponsorships")
        .select("sponsor_id, fixed_amount, sponsors(name, phone), cases(child_name, guardian_name)")
        .eq("status", "active"),
      supabase.from("monthly_adjustments")
        .select("sponsor_id, amount")
        .eq("month_year", month)
        .eq("adjustment_type", "one_time_extra"),
      supabase.from("collections")
        .select("sponsor_id, amount")
        .eq("month_year", month),
      supabase.from("operators").select("id, name").neq("name", "شريف"),
      supabase.from("advance_payments")
        .select("*, sponsors(name, phone), cases(child_name)")
        .order("paid_until", { ascending: false }),
    ]);

    const sps: any[]       = spRes.data  || [];
    const adjs: any[]      = adjRes.data || [];
    const cols: any[]      = colRes.data || [];
    const advData: AdvPmt[] = (advRes.data || []) as AdvPmt[];

    setOperators(opRes.data || []);
    setAdvPayments(advData);

    // Compute advance-paid sponsor IDs for this month
    const advPaidIds = new Set<string>(
      advData
        .filter(a => a.status === "active" && a.paid_from <= firstOfMonth && a.paid_until >= firstOfMonth)
        .map(a => a.sponsor_id)
    );

    // Extract unique sponsors for the advance form
    const seenSp = new Set<string>();
    const uniqueSponsors: { id: string; name: string }[] = [];
    for (const sp of sps) {
      if (!seenSp.has(sp.sponsor_id)) {
        seenSp.add(sp.sponsor_id);
        uniqueSponsors.push({ id: sp.sponsor_id, name: (sp.sponsors as any)?.name || "—" });
      }
    }
    setAllSponsors(uniqueSponsors.sort((a, b) => a.name.localeCompare(b.name, "ar")));

    // Group by sponsor
    const map: Record<string, { name: string; phone: string | null; fixed: number; extras: number; collected: number; cases: any[] }> = {};
    for (const sp of sps) {
      const id = sp.sponsor_id;
      if (!map[id]) map[id] = { name: (sp.sponsors as any)?.name || "—", phone: (sp.sponsors as any)?.phone || null, fixed: 0, extras: 0, collected: 0, cases: [] };
      map[id].fixed += Number(sp.fixed_amount);
      if (sp.cases) map[id].cases.push({ child_name: (sp.cases as any).child_name, guardian_name: (sp.cases as any).guardian_name });
    }
    for (const adj of adjs) { if (map[adj.sponsor_id]) map[adj.sponsor_id].extras += Number(adj.amount); }
    for (const col of cols) { if (map[col.sponsor_id]) map[col.sponsor_id].collected += Number(col.amount); }

    const result: PendingSponsor[] = Object.entries(map)
      .map(([id, d]) => {
        const obligation  = d.fixed + d.extras;
        const outstanding = Math.max(0, obligation - d.collected);
        const adv         = advPaidIds.has(id);
        return {
          sponsor_id: id, sponsor_name: d.name, phone: d.phone,
          fixed: d.fixed, extras: d.extras, obligation, collected: d.collected,
          outstanding, cases: d.cases,
          checked: false, amount: outstanding, received_by: "",
          advance_paid: adv,
        };
      })
      .filter(r => r.outstanding > 0 || r.advance_paid)
      .sort((a, b) => {
        if (a.advance_paid && !b.advance_paid) return 1;
        if (!a.advance_paid && b.advance_paid) return -1;
        return a.sponsor_name.localeCompare(b.sponsor_name, "ar");
      });

    setSponsors(result);
    setLoading(false);
  }

  function toggleCheck(id: string) {
    setSponsors(prev => prev.map(s => s.sponsor_id === id ? { ...s, checked: !s.checked } : s));
  }
  function toggleAll(val: boolean) {
    setSponsors(prev => prev.map(s => s.advance_paid ? s : { ...s, checked: val }));
  }
  function applyGlobalReceiver(opId: string) {
    setGlobalReceivedBy(opId);
    setSponsors(prev => prev.map(s => s.checked ? { ...s, received_by: opId } : s));
  }
  function setAmount(id: string, val: string) {
    const n = Math.max(0, Number(val) || 0);
    setSponsors(prev => prev.map(s => s.sponsor_id === id ? { ...s, amount: n } : s));
  }

  const pendingSponsors  = sponsors.filter(s => !s.advance_paid);
  const advancedSponsors = sponsors.filter(s => s.advance_paid);
  const checkedSponsors  = pendingSponsors.filter(s => s.checked);
  const allChecked       = pendingSponsors.length > 0 && pendingSponsors.every(s => s.checked);

  async function confirmAndSave() {
    setSaving(true);
    const errors: string[] = [];
    for (const sp of checkedSponsors) {
      await supabase.from("collections").delete().eq("sponsor_id", sp.sponsor_id).eq("month_year", selectedMonth);
      const amount        = sp.amount;
      const fixed_portion = Math.min(amount, sp.fixed);
      const extra_portion = Math.max(0, amount - sp.fixed);
      const { error } = await supabase.from("collections").insert({
        sponsor_id: sp.sponsor_id, amount, fixed_portion, extra_portion,
        sadaqat_portion: 0, month_year: selectedMonth,
        received_by_operator_id: sp.received_by || null,
        payment_method: "cash", status: "paid",
      });
      if (error) errors.push(`${sp.sponsor_name}: ${error.message}`);
    }
    setSaving(false);
    if (errors.length) { alert("حدثت أخطاء:\n" + errors.join("\n")); }
    else { setSavedOk(true); await load(selectedMonth); setConfirmMode(false); }
  }

  // ── Advance form helpers ───────────────────────────────────────────────────
  async function loadCasesForSponsor(spId: string) {
    const { data } = await supabase
      .from("sponsorships")
      .select("case_id, cases(id, child_name)")
      .eq("sponsor_id", spId)
      .eq("status", "active");
    setFCases((data || []).map((r: any) => ({ id: r.case_id, child_name: r.cases?.child_name || "" })));
  }

  async function bulkMarkHistorical() {
    if (!confirm("سيتم تسجيل تحصيل (مدفوع) لجميع الكفلاء لكل شهر من يناير 2024 حتى فبراير 2026.\nالشهور التي سبق تسجيلها لن تُمس.\nهل تريد المتابعة؟")) return;
    setBulking(true);
    // Generate months 2024-01 → 2026-02
    const months: string[] = [];
    let cur = new Date(2024, 0, 1);
    const last = new Date(2026, 1, 1);
    while (cur <= last) {
      months.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    // Get all active sponsorships grouped by sponsor
    const { data: sps } = await supabase.from("sponsorships").select("sponsor_id, fixed_amount").eq("status", "active");
    if (!sps?.length) { setBulking(false); return; }
    const spTotals: Record<string, number> = {};
    for (const s of sps) spTotals[s.sponsor_id] = (spTotals[s.sponsor_id] || 0) + Number(s.fixed_amount);
    // Fetch existing collections for those months to avoid duplicates
    const { data: existing } = await supabase.from("collections").select("sponsor_id, month_year").in("month_year", months);
    const existingSet = new Set((existing || []).map((r: any) => `${r.sponsor_id}|${r.month_year}`));
    // Build only missing rows
    const toInsert: any[] = [];
    for (const [sponsor_id, fixed] of Object.entries(spTotals)) {
      for (const month_year of months) {
        if (!existingSet.has(`${sponsor_id}|${month_year}`)) {
          toInsert.push({ sponsor_id, amount: fixed, fixed_portion: fixed, extra_portion: 0, sadaqat_portion: 0, month_year, payment_method: "cash", status: "paid" });
        }
      }
    }
    if (toInsert.length === 0) { setBulking(false); setBulkDone(true); return; }
    const CHUNK = 500;
    let errors = 0;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const { error } = await supabase.from("collections").insert(toInsert.slice(i, i + CHUNK));
      if (error) errors++;
    }
    setBulking(false);
    setBulkDone(true);
    if (errors) alert(`اكتملت مع ${errors} أخطاء`);
    else alert(`تم! أُضيف ${toInsert.length} سجل تحصيل لشهور يناير 2024 – فبراير 2026`);
  }

  function openAdvForm(preSpId?: string, preSpName?: string) {
    setAdvEditId(null);
    setFSpId(preSpId || ""); setFSpSearch(preSpName || "");
    setFCaseId(""); setFCases([]); setFType("annual");
    setFFrom(""); setFUntil(""); setFAmtPerMonth(""); setFTotalPaid("");
    setFStatus("active"); setFNotes("");
    setAdvFormOpen(true);
    if (preSpId) loadCasesForSponsor(preSpId);
    setTimeout(() => advSectionRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  function openEditAdv(a: AdvPmt) {
    setAdvEditId(a.id);
    setFSpId(a.sponsor_id); setFSpSearch(a.sponsors?.name || "");
    setFCaseId(a.case_id);
    loadCasesForSponsor(a.sponsor_id);
    setFType(a.payment_type); setFFrom(a.paid_from); setFUntil(a.paid_until);
    setFAmtPerMonth(a.amount_per_month?.toString() || "");
    setFTotalPaid(a.total_paid?.toString() || "");
    setFStatus(a.status); setFNotes(a.notes || "");
    setAdvFormOpen(true);
    setTimeout(() => advSectionRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }

  async function saveAdv() {
    if (!fSpId || !fCaseId || !fFrom || !fUntil) return;
    setFSaving(true);
    const row = {
      sponsor_id: fSpId, case_id: fCaseId, payment_type: fType,
      paid_from: fFrom, paid_until: fUntil,
      amount_per_month: fAmtPerMonth ? Number(fAmtPerMonth) : null,
      total_paid: fTotalPaid ? Number(fTotalPaid) : null,
      status: fStatus, notes: fNotes || null,
    };
    if (advEditId) {
      const { data, error } = await supabase.from("advance_payments")
        .update(row).eq("id", advEditId)
        .select("*, sponsors(name, phone), cases(child_name)").single();
      if (error) { alert("خطأ: " + error.message); setFSaving(false); return; }
      setAdvPayments(prev => prev.map(a => a.id === advEditId ? (data as AdvPmt) : a));
      setAdvEditId(null);
    } else {
      const { data, error } = await supabase.from("advance_payments")
        .insert(row)
        .select("*, sponsors(name, phone), cases(child_name)").single();
      if (error) { alert("خطأ: " + error.message); setFSaving(false); return; }
      setAdvPayments(prev => [data as AdvPmt, ...prev]);
    }
    setAdvFormOpen(false);
    setFSaving(false);
    load(selectedMonth);
  }

  async function deleteAdv(id: string) {
    const { error } = await supabase.from("advance_payments").delete().eq("id", id);
    if (error) { alert("خطأ: " + error.message); return; }
    setAdvPayments(prev => prev.filter(a => a.id !== id));
    load(selectedMonth);
  }

  const filteredAdv = useMemo(() => {
    const q = advSearch.trim();
    return advPayments
      .filter(a => a.status === advView)
      .filter(a => !q || (a.sponsors?.name || "").includes(q) || (a.cases?.child_name || "").includes(q));
  }, [advPayments, advSearch, advView]);

  const filtSponsors = useMemo(
    () => allSponsors.filter(s => s.name.includes(fSpSearch)).slice(0, 12),
    [allSponsors, fSpSearch]
  );

  // ── Confirmation screen ──────────────────────────────────────────────────────
  if (confirmMode) {
    const opMap = Object.fromEntries(operators.map(o => [o.id, o.name]));
    const byOp: Record<string, { name: string; total: number; sponsors: string[] }> = {};
    const unassigned: { name: string; amount: number }[] = [];
    for (const sp of checkedSponsors) {
      if (sp.received_by) {
        const opName = opMap[sp.received_by] || sp.received_by;
        if (!byOp[sp.received_by]) byOp[sp.received_by] = { name: opName, total: 0, sponsors: [] };
        byOp[sp.received_by].total += sp.amount;
        byOp[sp.received_by].sponsors.push(`${sp.sponsor_name} — ${fmt(sp.amount)} ج`);
      } else {
        unassigned.push({ name: sp.sponsor_name, amount: sp.amount });
      }
    }
    const grandTotal = checkedSponsors.reduce((s, r) => s + r.amount, 0);
    return (
      <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
        <header className="app-header">
          <button onClick={() => setConfirmMode(false)} className="btn btn-ghost btn-sm" style={{ gap: 5 }}>
            <LayoutDashboard size={16} /><span style={{ fontSize: "0.78rem" }}>رجوع</span>
          </button>
          <div style={{ flex: 1, paddingRight: 12 }}>
            <div className="app-logo" style={{ fontSize: "1.1rem" }}>تأكيد التحصيل</div>
          </div>
        </header>
        <main style={{ maxWidth: 600, margin: "0 auto", padding: "1.5rem 1rem 3rem" }}>
          <p style={{ fontSize: "0.85rem", color: "var(--text-3)", marginBottom: 20 }}>
            راجع التفاصيل قبل الحفظ — {fmtMonth(selectedMonth)}
          </p>
          {Object.values(byOp).map(op => (
            <div key={op.name} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: "1rem" }}>{op.name}</span>
                <span style={{ fontWeight: 800, color: "var(--green)", fontSize: "1.1rem" }}>{fmt(op.total)} ج</span>
              </div>
              <div style={{ display: "grid", gap: 5 }}>
                {op.sponsors.map(s => (
                  <div key={s} style={{ fontSize: "0.82rem", color: "var(--text-2)", padding: "4px 10px", background: "var(--cream)", borderRadius: 6 }}>{s}</div>
                ))}
              </div>
            </div>
          ))}
          {unassigned.length > 0 && (
            <div className="card" style={{ marginBottom: 12, border: "1.5px solid var(--amber)" }}>
              <div style={{ fontWeight: 700, color: "var(--amber)", marginBottom: 8, fontSize: "0.9rem" }}>بدون مستلم محدد ({unassigned.length})</div>
              {unassigned.map(u => (
                <div key={u.name} style={{ fontSize: "0.82rem", color: "var(--text-2)", padding: "4px 10px", borderRadius: 6, marginBottom: 4 }}>{u.name} — {fmt(u.amount)} ج</div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--green)", color: "white", borderRadius: "var(--radius)", padding: "1rem 1.25rem", marginBottom: 24 }}>
            <span style={{ fontWeight: 700 }}>الإجمالي</span>
            <span style={{ fontWeight: 800, fontSize: "1.3rem" }}>{fmt(grandTotal)} ج</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <button onClick={() => setConfirmMode(false)} className="btn btn-secondary btn-lg">← تعديل</button>
            <button onClick={confirmAndSave} disabled={saving} className="btn btn-primary btn-lg">
              {saving ? "جاري الحفظ..." : "✓ تأكيد وحفظ"}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Main list ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <header className="app-header">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ gap: 5 }}>
          <LayoutDashboard size={16} /><span style={{ fontSize: "0.78rem" }}>الرئيسية</span>
        </Link>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div className="app-logo" style={{ fontSize: "1.1rem" }}>التحصيل</div>
        </div>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          style={{ width: "auto", minWidth: 120, maxWidth: 160, fontSize: "0.8rem", height: 36, padding: "0 0.6rem", border: "1.5px solid var(--border)", borderRadius: "var(--radius)", background: "var(--surface)", color: "var(--text-1)", cursor: "pointer" }}
        >
          {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </header>

      <main style={{ maxWidth: 600, margin: "0 auto", padding: "1.25rem 1rem 5rem" }}>

        {savedOk && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, background: "var(--green-light)", border: "1.5px solid var(--green)", borderRadius: "var(--radius)", padding: "0.875rem 1rem" }}>
            <CheckCircle size={20} style={{ color: "var(--green)" }} />
            <span style={{ fontWeight: 700, color: "var(--green)" }}>تم حفظ التحصيل بنجاح</span>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)" }}>جاري التحميل...</div>
        ) : (
          <>
            {/* Summary bar */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-2)", fontWeight: 600 }}>
                {pendingSponsors.length} كفيل لم يدفع
              </span>
              {advancedSponsors.length > 0 && (
                <>
                  <span style={{ color: "var(--text-3)" }}>·</span>
                  <span style={{ fontSize: "0.85rem", color: "var(--green)", fontWeight: 600 }}>
                    {advancedSponsors.length} مدفوع مسبقاً
                  </span>
                </>
              )}
              <span style={{ color: "var(--text-3)" }}>·</span>
              <span style={{ fontSize: "0.85rem", color: "var(--red)", fontWeight: 700 }}>
                {fmt(pendingSponsors.reduce((s, r) => s + r.outstanding, 0))} ج متبقي
              </span>
              {checkedSponsors.length > 0 && (
                <>
                  <span style={{ color: "var(--text-3)" }}>·</span>
                  <span style={{ fontSize: "0.82rem", color: "var(--green)", fontWeight: 700 }}>
                    {checkedSponsors.length} محدد ({fmt(checkedSponsors.reduce((s, r) => s + r.amount, 0))} ج)
                  </span>
                </>
              )}
            </div>

            {/* Select all + global received-by */}
            {pendingSponsors.length > 0 && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>
                  <input type="checkbox" checked={allChecked} onChange={e => toggleAll(e.target.checked)} style={{ width: 16, height: 16, cursor: "pointer" }} />
                  تحديد الكل
                </label>
                {checkedSponsors.length > 0 && (
                  <select value={globalReceivedBy} onChange={e => applyGlobalReceiver(e.target.value)} className="select-field" style={{ fontSize: "0.82rem", height: 34, flex: 1, minWidth: 160 }}>
                    <option value="">استلمه: — اختر للكل —</option>
                    {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                )}
              </div>
            )}

            {pendingSponsors.length === 0 && advancedSponsors.length === 0 && (
              <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)", background: "var(--surface)", borderRadius: "var(--radius)", border: "1.5px solid var(--border)" }}>
                <CheckCircle size={40} style={{ color: "var(--green)", marginBottom: 10 }} />
                <div style={{ fontWeight: 700, color: "var(--green)", fontSize: "1rem" }}>تم تحصيل الكل ✓</div>
                <div style={{ fontSize: "0.82rem", marginTop: 6 }}>لا يوجد متأخرون في {fmtMonth(selectedMonth)}</div>
              </div>
            )}

            {/* Sponsor list */}
            <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
              {sponsors.map(sp => (
                <div
                  key={sp.sponsor_id}
                  className="card"
                  style={{
                    padding: "0.75rem 1rem",
                    border: sp.advance_paid
                      ? "2px solid var(--green)"
                      : sp.checked ? "2px solid var(--green)" : "1.5px solid var(--border)",
                    background: sp.advance_paid
                      ? "var(--green-light)"
                      : sp.checked ? "var(--green-light)" : "var(--surface)",
                    opacity: sp.advance_paid ? 0.85 : 1,
                    transition: "all 0.12s",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Tick */}
                    {sp.advance_paid ? (
                      <CheckCircle size={22} style={{ color: "var(--green)", flexShrink: 0 }} />
                    ) : (
                      <button
                        onClick={() => toggleCheck(sp.sponsor_id)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, color: sp.checked ? "var(--green)" : "var(--text-3)" }}
                      >
                        {sp.checked ? <CheckCircle size={22} /> : <Circle size={22} />}
                      </button>
                    )}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-1)" }}>{sp.sponsor_name}</span>
                        {sp.advance_paid && (
                          <span style={{ fontSize: "0.65rem", fontWeight: 700, background: "var(--green)", color: "white", padding: "1px 7px", borderRadius: 100 }}>مدفوع مسبقاً</span>
                        )}
                      </div>
                      {sp.phone && <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>{sp.phone}</div>}
                      {sp.extras > 0 && (
                        <div style={{ fontSize: "0.72rem", color: "var(--indigo)", marginTop: 2 }}>
                          كفالة {fmt(sp.fixed)} + زيادة {fmt(sp.extras)} ج
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: "left", flexShrink: 0, marginLeft: 4 }}>
                      {sp.advance_paid ? (
                        <div style={{ fontWeight: 800, fontSize: "0.9rem", color: "var(--green)" }}>{fmt(sp.obligation)} ج</div>
                      ) : (
                        <>
                          <div style={{ fontWeight: 800, fontSize: "1.05rem", color: sp.checked ? "var(--green)" : "var(--red)" }}>
                            {fmt(sp.outstanding)} ج
                          </div>
                          {sp.collected > 0 && (
                            <div style={{ fontSize: "0.68rem", color: "var(--text-3)" }}>دفع {fmt(sp.collected)} من {fmt(sp.obligation)} ج</div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Quick advance button */}
                    <button
                      onClick={() => openAdvForm(sp.sponsor_id, sp.sponsor_name)}
                      title="تسجيل دفع مسبق"
                      style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", padding: "3px 6px", color: "var(--text-3)", flexShrink: 0, fontSize: "0.65rem", display: "flex", alignItems: "center", gap: 3 }}
                    >
                      <CalendarCheck size={12} /> مسبق
                    </button>

                    <button
                      onClick={() => setExpandedId(expandedId === sp.sponsor_id ? null : sp.sponsor_id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "0 2px", flexShrink: 0 }}
                    >
                      {expandedId === sp.sponsor_id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>

                  {/* Checked: amount + received_by (only for non-advance) */}
                  {sp.checked && !sp.advance_paid && (
                    <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 3 }}>المبلغ المحصل (ج)</label>
                        <input type="number" value={sp.amount || ""} onChange={e => setAmount(sp.sponsor_id, e.target.value)} min={0} className="input-field" style={{ fontSize: "0.9rem", padding: "5px 10px", height: 36 }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 3 }}>استلمه</label>
                        <select value={sp.received_by} onChange={e => setSponsors(prev => prev.map(s => s.sponsor_id === sp.sponsor_id ? { ...s, received_by: e.target.value } : s))} className="select-field" style={{ fontSize: "0.82rem", height: 36 }}>
                          <option value="">— اختر —</option>
                          {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Expanded: cases */}
                  {expandedId === sp.sponsor_id && sp.cases.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>الحالات المكفولة</div>
                      {sp.cases.map((c, i) => (
                        <div key={i} style={{ fontSize: "0.8rem", color: "var(--text-2)", padding: "3px 8px" }}>
                          • {c.child_name}{c.guardian_name ? ` (${c.guardian_name})` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Sticky save button */}
            {checkedSponsors.length > 0 && (
              <div style={{ position: "sticky", bottom: 80, zIndex: 10 }}>
                <button onClick={() => setConfirmMode(true)} className="btn btn-primary btn-lg" style={{ width: "100%", boxShadow: "0 4px 20px rgba(27,107,67,0.35)" }}>
                  تسجيل تحصيل {checkedSponsors.length} كفيل ({fmt(checkedSponsors.reduce((s, r) => s + r.amount, 0))} ج) →
                </button>
              </div>
            )}

            {/* ── Advance Payments Section ─────────────────────────────── */}
            <div ref={advSectionRef} style={{ marginTop: 32, borderTop: "2px solid var(--border)", paddingTop: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <CalendarCheck size={18} style={{ color: "var(--indigo)" }} />
                  <span style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-1)" }}>المدفوعات المسبقة</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-3)", background: "var(--surface-2)", padding: "2px 8px", borderRadius: 100 }}>
                    {advPayments.filter(a => a.status === "active").length} نشط
                  </span>
                </div>
                <button
                  onClick={() => advFormOpen ? setAdvFormOpen(false) : openAdvForm()}
                  className="btn btn-sm"
                  style={{ border: "1.5px solid var(--indigo)", color: "var(--indigo)", background: "rgba(99,102,241,0.08)", gap: 5 }}
                >
                  {advFormOpen ? <><X size={13} /> إغلاق</> : <><Plus size={13} /> إضافة</>}
                </button>
              </div>

              {/* Add / Edit form */}
              {advFormOpen && (
                <div className="card" style={{ marginBottom: 16, border: "1.5px solid var(--indigo)", background: "rgba(99,102,241,0.04)" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", marginBottom: 12, color: "var(--indigo)" }}>
                    {advEditId ? "تعديل سجل" : "إضافة دفع مسبق جديد"}
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>

                    {/* Sponsor */}
                    <div style={{ position: "relative" }}>
                      <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 3 }}>الكفيل *</label>
                      <input
                        value={fSpSearch}
                        onChange={e => { setFSpSearch(e.target.value); setFSpId(""); setFCaseId(""); setFCases([]); setFSpDrop(true); }}
                        onFocus={() => setFSpDrop(true)}
                        onBlur={() => setTimeout(() => setFSpDrop(false), 150)}
                        placeholder="ابحث عن الكفيل..."
                        className="input-field"
                      />
                      {fSpDrop && fSpSearch && filtSponsors.length > 0 && (
                        <div className="search-dropdown">
                          {filtSponsors.map(s => (
                            <button key={s.id} onClick={() => { setFSpId(s.id); setFSpSearch(s.name); setFSpDrop(false); loadCasesForSponsor(s.id); }}
                              style={{ width: "100%", padding: "8px 12px", border: "none", borderBottom: "1px solid var(--border-light)", background: "var(--surface)", cursor: "pointer", textAlign: "right", fontSize: "0.85rem" }}>
                              {s.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Case */}
                    {fSpId && (
                      <div>
                        <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 3 }}>الحالة *</label>
                        <select value={fCaseId} onChange={e => setFCaseId(e.target.value)} className="select-field">
                          <option value="">اختر الحالة...</option>
                          {fCases.map(c => <option key={c.id} value={c.id}>{c.child_name}</option>)}
                        </select>
                      </div>
                    )}

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {/* Type */}
                      <div>
                        <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 3 }}>نوع الدفع</label>
                        <select value={fType} onChange={e => setFType(e.target.value)} className="select-field">
                          <option value="annual">سنوي</option>
                          <option value="semi_annual">نصف سنوي</option>
                          <option value="quarterly">ربع سنوي</option>
                          <option value="compensation">تعويض</option>
                        </select>
                      </div>
                      {/* Status */}
                      <div>
                        <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 3 }}>الحالة</label>
                        <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="select-field">
                          <option value="active">دفع فعلاً ✓</option>
                          <option value="pending">ينوي الدفع</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 3 }}>من تاريخ *</label>
                        <input type="date" value={fFrom} onChange={e => setFFrom(e.target.value)} className="input-field" />
                      </div>
                      <div>
                        <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 3 }}>حتى تاريخ *</label>
                        <input type="date" value={fUntil} onChange={e => setFUntil(e.target.value)} className="input-field" />
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 3 }}>مبلغ/شهر (ج)</label>
                        <input type="number" value={fAmtPerMonth} onChange={e => setFAmtPerMonth(e.target.value)} placeholder="0" className="input-field" />
                      </div>
                      <div>
                        <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 3 }}>إجمالي المدفوع (ج)</label>
                        <input type="number" value={fTotalPaid} onChange={e => setFTotalPaid(e.target.value)} placeholder="0" className="input-field" />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 3 }}>ملاحظات</label>
                      <input value={fNotes} onChange={e => setFNotes(e.target.value)} placeholder="اختياري..." className="input-field" />
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={saveAdv} disabled={fSaving || !fSpId || !fCaseId || !fFrom || !fUntil} className="btn btn-primary" style={{ flex: 2 }}>
                        {fSaving ? "جاري الحفظ..." : advEditId ? "✓ حفظ التعديل" : "✓ إضافة"}
                      </button>
                      <button onClick={() => { setAdvFormOpen(false); setAdvEditId(null); }} className="btn btn-secondary" style={{ flex: 1 }}>إلغاء</button>
                    </div>
                  </div>
                </div>
              )}

              {/* View tabs + search */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["active", "pending"] as const).map(v => (
                    <button key={v} onClick={() => setAdvView(v)} className="btn btn-sm"
                      style={{ background: advView === v ? "var(--indigo)" : "var(--surface)", color: advView === v ? "white" : "var(--text-2)", border: advView === v ? "none" : "1.5px solid var(--border)" }}>
                      {v === "active" ? "دفع فعلاً" : "ينوي الدفع"}
                      <span style={{ marginRight: 4, fontSize: "0.7rem", opacity: 0.8 }}>
                        ({advPayments.filter(a => a.status === v).length})
                      </span>
                    </button>
                  ))}
                </div>
                <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
                  <Search size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
                  <input value={advSearch} onChange={e => setAdvSearch(e.target.value)} placeholder="بحث بالاسم..." className="input-field" style={{ paddingRight: 30, height: 34, fontSize: "0.82rem" }} />
                </div>
              </div>

              {/* List */}
              {filteredAdv.length === 0 ? (
                <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-3)", fontSize: "0.82rem", background: "var(--surface)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                  لا توجد سجلات
                </div>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {filteredAdv.map(a => (
                    <div key={a.id} className="card" style={{ padding: "0.7rem 1rem", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>{a.sponsors?.name || "—"}</span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>·</span>
                          <span style={{ fontSize: "0.82rem", color: "var(--indigo)" }}>{a.cases?.child_name || "—"}</span>
                          <span className="badge badge-neutral" style={{ fontSize: "0.65rem" }}>{PT_LABELS[a.payment_type] || a.payment_type}</span>
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 3 }}>
                          {fmtDate(a.paid_from)} → {fmtDate(a.paid_until)}
                          {a.total_paid ? ` · ${fmt(a.total_paid)} ج` : ""}
                        </div>
                        {a.notes && <div style={{ fontSize: "0.7rem", color: "var(--text-3)", marginTop: 2, fontStyle: "italic" }}>{a.notes}</div>}
                      </div>
                      <button onClick={() => openEditAdv(a)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: "var(--indigo)" }}>
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteAdv(a.id)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: "var(--red)" }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        {/* ── Historical bulk-settle ─────────────────────────────────────── */}
        <div style={{ marginTop: 32, borderTop: "1px solid var(--border-light)", paddingTop: 20 }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            إعداد البيانات التاريخية
          </div>
          {bulkDone ? (
            <div style={{ padding: "0.75rem 1rem", background: "var(--green-light)", border: "1.5px solid var(--green)", borderRadius: "var(--radius)", fontSize: "0.85rem", color: "var(--green)", fontWeight: 700 }}>
              ✓ تم تسجيل التحصيل التاريخي — التتبع يبدأ من مارس 2026
            </div>
          ) : (
            <button
              onClick={bulkMarkHistorical}
              disabled={bulking}
              style={{
                padding: "0.65rem 1.25rem", border: "1.5px solid var(--border)", borderRadius: "var(--radius)",
                background: "var(--surface)", color: "var(--text-2)", cursor: "pointer",
                fontSize: "0.82rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8,
                opacity: bulking ? 0.6 : 1,
              }}
            >
              {bulking
                ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> جاري التسجيل...</>
                : "⏮ تسجيل جميع التحصيلات حتى فبراير 2026 كمدفوعة"}
            </button>
          )}
          <div style={{ fontSize: "0.7rem", color: "var(--text-3)", marginTop: 6 }}>
            يضيف سجلات تحصيل (مدفوع) لجميع الكفلاء لكل شهر من يناير 2024 إلى فبراير 2026، ويتجاهل الشهور المسجّلة مسبقاً.
          </div>
        </div>
      </main>
    </div>
  );
}
