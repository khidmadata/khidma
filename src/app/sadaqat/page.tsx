"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  ArrowRight, TrendingUp, TrendingDown, FileText,
  Loader2, X, CheckCircle,
} from "lucide-react";
import Link from "next/link";

// ─── Constants ────────────────────────────────────────────────────────────────
const CAUSES = [
  "حالات كفالة",
  "حالات طبية",
  "مساعدة زواج",
  "سداد ديون",
  "إفطار رمضان",
  "كسوة عيد",
  "بطاطين شتاء",
  "طلاب الأزهر",
  "كراتين رمضان",
  "توصيل مياه",
  "بناء مسجد",
  "سداد ديون المنطقة",
  "توزيع وجبات",
];

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

function genMonths() {
  const opts: { value: string; label: string }[] = [{ value: "all", label: "كل الوقت" }];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value: v, label: fmtMonth(v) });
  }
  return opts;
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const fmt = (n: number) => n.toLocaleString("en");

// ─── Types ────────────────────────────────────────────────────────────────────
type Entry = {
  id: string;
  transaction_type: "inflow" | "outflow";
  amount: number;
  cause: string | null;
  donor_name: string | null;
  destination_description: string | null;
  destination_case_id: string | null;
  month_year: string;
  created_at: string;
};

type Case = { id: string; child_name: string; guardian_name: string | null };

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SadaqatPage() {
  const [tab, setTab]                   = useState<"entries" | "add" | "report">("entries");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [entries, setEntries]           = useState<Entry[]>([]);
  const [cases, setCases]               = useState<Case[]>([]);
  const [caseMap, setCaseMap]           = useState<Record<string, string>>({});
  const [loading, setLoading]           = useState(true);
  const [reload, setReload]             = useState(0);

  const monthOptions = useMemo(genMonths, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [entRes, casRes] = await Promise.all([
        supabase.from("sadaqat_pool")
          .select("id, transaction_type, amount, destination_type, donor_name, destination_description, destination_case_id, month_year, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("cases")
          .select("id, child_name, guardian_name")
          .eq("status", "active")
          .order("child_name"),
      ]);

      const casesData: Case[] = casRes.data || [];
      setCases(casesData);
      setCaseMap(Object.fromEntries(casesData.map(c => [c.id, c.child_name])));

      setEntries(
        (entRes.data || []).map((e: any) => ({
          ...e,
          cause: e.destination_type ?? null,
        }))
      );
      setLoading(false);
    })();
  }, [reload]);

  const filtered = useMemo(
    () => selectedMonth === "all" ? entries : entries.filter(e => e.month_year === selectedMonth),
    [entries, selectedMonth]
  );

  const inflows  = filtered.filter(e => e.transaction_type === "inflow");
  const outflows = filtered.filter(e => e.transaction_type === "outflow");
  const totalIn  = inflows.reduce((s, e)  => s + Number(e.amount), 0);
  const totalOut = outflows.reduce((s, e) => s + Number(e.amount), 0);

  // Overall balance is always cumulative regardless of month filter
  const allIn  = entries.filter(e => e.transaction_type === "inflow").reduce((s, e)  => s + Number(e.amount), 0);
  const allOut = entries.filter(e => e.transaction_type === "outflow").reduce((s, e) => s + Number(e.amount), 0);
  const balance = allIn - allOut;

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <header className="app-header">
        <Link href="/" className="btn btn-ghost btn-sm"><ArrowRight size={18} /></Link>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div className="app-logo" style={{ fontSize: "1.1rem" }}>صندوق الصدقات</div>
        </div>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          className="select-field"
          style={{ minWidth: 140, fontSize: "0.8rem", height: 38 }}
        >
          {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </header>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1.5px solid var(--border)", background: "var(--surface)" }}>
        {([ ["entries","الحركات"], ["add","إضافة"], ["report","تقرير"] ] as [string,string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as any)} style={{
            flex: 1, padding: "0.75rem", border: "none",
            borderBottom: tab === id ? "2.5px solid var(--green)" : "2.5px solid transparent",
            background: "none", fontWeight: tab === id ? 700 : 500,
            color: tab === id ? "var(--green)" : "var(--text-3)",
            fontSize: "0.875rem", cursor: "pointer",
          }}>
            {label}
          </button>
        ))}
      </div>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "1.25rem 1rem 5rem" }}>

        {/* Summary cards — always visible */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
          <div className="card" style={{ padding: "0.875rem", textAlign: "center" }}>
            <div style={{ fontSize: "0.65rem", color: "var(--text-3)", marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <TrendingUp size={12} /> وارد
            </div>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--green)" }}>{fmt(totalIn)} ج</div>
            {selectedMonth !== "all" && <div style={{ fontSize: "0.6rem", color: "var(--text-3)" }}>هذا الشهر</div>}
          </div>
          <div className="card" style={{ padding: "0.875rem", textAlign: "center" }}>
            <div style={{ fontSize: "0.65rem", color: "var(--text-3)", marginBottom: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
              <TrendingDown size={12} /> صادر
            </div>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--red)" }}>{fmt(totalOut)} ج</div>
            {selectedMonth !== "all" && <div style={{ fontSize: "0.6rem", color: "var(--text-3)" }}>هذا الشهر</div>}
          </div>
          <div className="card" style={{ padding: "0.875rem", textAlign: "center", background: balance >= 0 ? "var(--green-light)" : "#FEF2F2", border: `1.5px solid ${balance >= 0 ? "var(--green)" : "var(--red)"}` }}>
            <div style={{ fontSize: "0.65rem", color: "var(--text-3)", marginBottom: 4 }}>الرصيد الكلي</div>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: balance >= 0 ? "var(--green)" : "var(--red)" }}>{fmt(balance)} ج</div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)" }}>جاري التحميل...</div>
        ) : tab === "entries" ? (
          <EntriesView inflows={inflows} outflows={outflows} caseMap={caseMap} selectedMonth={selectedMonth} />
        ) : tab === "add" ? (
          <AddForm
            cases={cases}
            defaultMonth={selectedMonth === "all" ? currentMonth() : selectedMonth}
            onSaved={() => { setReload(r => r + 1); setTab("entries"); }}
          />
        ) : (
          <ReportView
            entries={filtered}
            totalIn={totalIn} totalOut={totalOut} balance={balance}
            caseMap={caseMap} selectedMonth={selectedMonth}
          />
        )}
      </main>
    </div>
  );
}

// ─── Entries View ─────────────────────────────────────────────────────────────
function EntriesView({ inflows, outflows, caseMap, selectedMonth }: {
  inflows: Entry[]; outflows: Entry[]; caseMap: Record<string, string>; selectedMonth: string;
}) {
  const [view, setView] = useState<"inflows" | "outflows">("inflows");
  const current = view === "inflows" ? inflows : outflows;

  const grouped = useMemo(() => {
    const g: Record<string, Entry[]> = {};
    current.forEach(e => {
      const k = e.month_year || "—";
      if (!g[k]) g[k] = [];
      g[k].push(e);
    });
    return Object.entries(g).sort(([a], [b]) => b.localeCompare(a));
  }, [current]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {([ ["inflows", `⬇️ الوارد (${inflows.length})`], ["outflows", `⬆️ الصادر (${outflows.length})`] ] as [string,string][]).map(([id, label]) => (
          <button key={id} onClick={() => setView(id as any)} className="btn" style={{
            flex: 1,
            background: view === id ? "var(--green-light)" : "var(--surface)",
            color: view === id ? "var(--green)" : "var(--text-3)",
            border: view === id ? "2px solid var(--green)" : "1.5px solid var(--border)",
            fontWeight: 600,
          }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {grouped.map(([month, items]) => (
          <div key={month}>
            {selectedMonth === "all" && (
              <div style={{ padding: "5px 10px", fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", background: "var(--surface-2)", borderRadius: 6, marginBottom: 5 }}>
                {fmtMonth(month)} — {fmt(items.reduce((s, e) => s + Number(e.amount), 0))} ج
              </div>
            )}
            {items.map(e => (
              <div key={e.id} className="card" style={{ padding: "0.75rem 1rem", marginBottom: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-1)" }}>
                      {view === "inflows"
                        ? (e.donor_name || "متبرع")
                        : (e.destination_description || (e.destination_case_id ? caseMap[e.destination_case_id] : null) || "—")}
                    </div>
                    {e.cause && <CauseBadge cause={e.cause} />}
                    {e.destination_case_id && view === "outflows" && caseMap[e.destination_case_id] && (
                      <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginTop: 2 }}>
                        الحالة: {caseMap[e.destination_case_id]}
                      </div>
                    )}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: "1.05rem", color: view === "inflows" ? "var(--green)" : "var(--red)", flexShrink: 0 }}>
                    {view === "inflows" ? "+" : "−"}{fmt(Number(e.amount))} ج
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
        {grouped.length === 0 && (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)", background: "var(--surface)", borderRadius: "var(--radius)", border: "1.5px solid var(--border)" }}>
            لا توجد حركات في هذه الفترة
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cause Badge ──────────────────────────────────────────────────────────────
function CauseBadge({ cause }: { cause: string }) {
  // Normalize legacy cause values from settle page
  const display = cause === "kafala_case" ? "حالات كفالة"
    : cause === "one_time_case" ? "حالات كفالة"
    : cause;
  return (
    <span style={{
      display: "inline-block", marginTop: 3,
      padding: "1px 8px", borderRadius: 100,
      fontSize: "0.66rem", fontWeight: 600,
      background: "var(--indigo-light)", color: "var(--indigo)",
    }}>
      {display}
    </span>
  );
}

// ─── Add Form ─────────────────────────────────────────────────────────────────
function AddForm({ cases, defaultMonth, onSaved }: {
  cases: Case[]; defaultMonth: string; onSaved: () => void;
}) {
  const [type,         setType]         = useState<"inflow" | "outflow">("inflow");
  const [amount,       setAmount]       = useState("");
  const [cause,        setCause]        = useState("");
  const [donorName,    setDonorName]    = useState("");
  const [description,  setDescription]  = useState("");
  const [caseSearch,   setCaseSearch]   = useState("");
  const [caseId,       setCaseId]       = useState("");
  const [showCaseDrop, setShowCaseDrop] = useState(false);
  const [month,        setMonth]        = useState(defaultMonth);
  const [notes,        setNotes]        = useState("");
  const [saving,       setSaving]       = useState(false);
  const [savedOk,      setSavedOk]      = useState(false);

  const monthOptions = useMemo(() => genMonths().filter(o => o.value !== "all"), []);

  const filteredCases = useMemo(() =>
    cases.filter(c =>
      c.child_name.includes(caseSearch) ||
      (c.guardian_name || "").includes(caseSearch)
    ).slice(0, 10),
    [cases, caseSearch]
  );

  async function save() {
    if (!amount || Number(amount) <= 0 || !cause) return;
    setSaving(true);
    const { error } = await supabase.from("sadaqat_pool").insert({
      transaction_type:        type,
      amount:                  Number(amount),
      destination_type:        cause,
      donor_name:              type === "inflow" ? (donorName.trim() || null) : null,
      destination_description: (description.trim() || notes.trim()) || null,
      destination_case_id:     caseId || null,
      month_year:              month,
    });
    if (error) { alert("خطأ: " + error.message); setSaving(false); return; }
    setSaving(false);
    setSavedOk(true);
    setTimeout(() => { setSavedOk(false); onSaved(); }, 900);
  }

  function reset() {
    setType("inflow"); setAmount(""); setCause(""); setDonorName(""); setDescription("");
    setCaseSearch(""); setCaseId(""); setNotes(""); setSavedOk(false);
  }

  if (savedOk) return (
    <div className="card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
      <CheckCircle size={48} style={{ color: "var(--green)", margin: "0 auto 16px" }} />
      <h3 style={{ marginBottom: 8 }}>تم الحفظ بنجاح</h3>
      <button onClick={reset} className="btn btn-primary" style={{ marginTop: 16 }}>إضافة أخرى</button>
    </div>
  );

  return (
    <div className="card">
      <h3 style={{ marginBottom: 16 }}>إضافة حركة صدقات</h3>

      {/* Type toggle */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
        {([
          ["inflow",  "⬇️ وارد (تبرع)",  "var(--green)", "var(--green-light)"],
          ["outflow", "⬆️ صادر (صرف)",   "var(--red)",   "#FEF2F2"],
        ] as [string, string, string, string][]).map(([id, label, color, bg]) => (
          <button key={id} onClick={() => setType(id as any)} style={{
            padding: "0.75rem", borderRadius: "var(--radius)",
            border: type === id ? `2px solid ${color}` : "1.5px solid var(--border)",
            background: type === id ? bg : "var(--surface)",
            color: type === id ? color : "var(--text-3)",
            fontWeight: 700, cursor: "pointer", fontSize: "0.875rem",
          }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {/* Month */}
        <div>
          <label className="field-label">الشهر</label>
          <select value={month} onChange={e => setMonth(e.target.value)} className="select-field">
            {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Amount */}
        <div>
          <label className="field-label">المبلغ (ج) *</label>
          <input
            type="number" value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0" min="1" className="input-field" dir="ltr"
          />
        </div>

        {/* Cause — mandatory */}
        <div>
          <label className="field-label">الوجهة / السبب *</label>
          <select value={cause} onChange={e => setCause(e.target.value)} className="select-field">
            <option value="">اختر...</option>
            {CAUSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Donor name (inflow) */}
        {type === "inflow" && (
          <div>
            <label className="field-label">اسم المتبرع (اختياري)</label>
            <input
              value={donorName} onChange={e => setDonorName(e.target.value)}
              placeholder="أو اتركه فارغاً" className="input-field"
            />
          </div>
        )}

        {/* Description (outflow) */}
        {type === "outflow" && (
          <div>
            <label className="field-label">وصف الصرف (اختياري)</label>
            <input
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="تفاصيل الصرف..." className="input-field"
            />
          </div>
        )}

        {/* Case link — optional */}
        <div>
          <label className="field-label">ربط بحالة من الجدول (اختياري)</label>
          <div style={{ position: "relative" }}>
            <input
              value={caseSearch}
              onChange={e => { setCaseSearch(e.target.value); setShowCaseDrop(true); setCaseId(""); }}
              onFocus={() => setShowCaseDrop(true)}
              onBlur={() => setTimeout(() => setShowCaseDrop(false), 150)}
              placeholder="ابحث باسم الطفل أو العائل..."
              className="input-field"
            />
            {showCaseDrop && caseSearch && filteredCases.length > 0 && (
              <div className="search-dropdown">
                {filteredCases.map(c => (
                  <button
                    key={c.id}
                    onMouseDown={() => {
                      setCaseId(c.id);
                      setCaseSearch(c.child_name + (c.guardian_name ? ` (${c.guardian_name})` : ""));
                      setShowCaseDrop(false);
                    }}
                    style={{ width: "100%", padding: "10px 14px", border: "none", borderBottom: "1px solid var(--border-light)", background: "var(--surface)", cursor: "pointer", textAlign: "right", fontSize: "0.875rem" }}
                  >
                    {c.child_name}{c.guardian_name ? ` — ${c.guardian_name}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
          {caseId && (
            <button
              onClick={() => { setCaseId(""); setCaseSearch(""); }}
              style={{ marginTop: 4, fontSize: "0.72rem", color: "var(--red)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
            >
              <X size={12} /> إزالة الربط
            </button>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="field-label">ملاحظات (اختياري)</label>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="أي تفاصيل إضافية..."
            className="textarea-field"
            style={{ minHeight: 64 }}
          />
        </div>

        <button
          onClick={save}
          disabled={saving || !amount || Number(amount) <= 0 || !cause}
          className="btn btn-primary btn-lg"
          style={{ background: type === "outflow" ? "var(--red)" : undefined }}
        >
          {saving
            ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> جاري الحفظ...</>
            : type === "inflow" ? "✓ تسجيل تبرع" : "✓ تسجيل صرف"
          }
        </button>
      </div>
    </div>
  );
}

// ─── Report View ──────────────────────────────────────────────────────────────
function ReportView({ entries, totalIn, totalOut, balance, caseMap, selectedMonth }: {
  entries: Entry[]; totalIn: number; totalOut: number; balance: number;
  caseMap: Record<string, string>; selectedMonth: string;
}) {
  const causeBreakdown = useMemo(() => {
    const bd: Record<string, { inflow: number; outflow: number }> = {};
    entries.forEach(e => {
      const c = (e.cause && e.cause !== "kafala_case" && e.cause !== "one_time_case")
        ? e.cause
        : e.cause === "kafala_case" || e.cause === "one_time_case"
          ? "حالات كفالة"
          : "غير محدد";
      if (!bd[c]) bd[c] = { inflow: 0, outflow: 0 };
      bd[c][e.transaction_type] += Number(e.amount);
    });
    return Object.entries(bd).sort(([, a], [, b]) => (b.inflow + b.outflow) - (a.inflow + a.outflow));
  }, [entries]);

  const inflows  = entries.filter(e => e.transaction_type === "inflow");
  const outflows = entries.filter(e => e.transaction_type === "outflow");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 16 }} className="no-print">
        <button
          onClick={() => window.print()}
          className="btn btn-secondary btn-sm"
          style={{ gap: 6 }}
        >
          <FileText size={14} /> طباعة / PDF
        </button>
      </div>

      {/* Report header */}
      <div className="gradient-green" style={{ marginBottom: 16, borderRadius: "var(--radius)" }}>
        <div style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: 8 }}>
          تقرير الصدقات — {fmtMonth(selectedMonth)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, textAlign: "center" }}>
          {[
            { label: "إجمالي الوارد",  val: totalIn  },
            { label: "إجمالي الصادر",  val: totalOut },
            { label: "الرصيد الكلي",   val: balance  },
          ].map(({ label, val }) => (
            <div key={label}>
              <div style={{ fontSize: "0.68rem", opacity: 0.65, marginBottom: 4 }}>{label}</div>
              <div style={{ fontWeight: 800, fontSize: "1.15rem" }}>{fmt(val)} ج</div>
            </div>
          ))}
        </div>
      </div>

      {/* By-cause breakdown */}
      {causeBreakdown.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "10px 16px", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: "0.82rem" }}>
            التفصيل حسب الوجهة
          </div>
          {causeBreakdown.map(([cause, amounts]) => (
            <div key={cause} style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{cause}</span>
              <div style={{ display: "flex", gap: 12, fontSize: "0.82rem" }}>
                {amounts.inflow  > 0 && <span style={{ color: "var(--green)", fontWeight: 700 }}>+{fmt(amounts.inflow)} ج</span>}
                {amounts.outflow > 0 && <span style={{ color: "var(--red)",   fontWeight: 700 }}>−{fmt(amounts.outflow)} ج</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inflows detail */}
      {inflows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ padding: "10px 16px", background: "var(--green-light)", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: "0.82rem", color: "var(--green)" }}>
            ⬇️ التبرعات الواردة ({inflows.length})
          </div>
          {inflows.map(e => (
            <div key={e.id} style={{ padding: "0.65rem 1rem", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>{e.donor_name || "متبرع"}</div>
                {e.cause && <CauseBadge cause={e.cause} />}
              </div>
              <span style={{ fontWeight: 700, color: "var(--green)" }}>+{fmt(Number(e.amount))} ج</span>
            </div>
          ))}
          <div style={{ padding: "8px 16px", background: "var(--surface-2)", display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
            <span style={{ color: "var(--text-3)" }}>المجموع</span>
            <strong style={{ color: "var(--green)" }}>{fmt(totalIn)} ج</strong>
          </div>
        </div>
      )}

      {/* Outflows detail */}
      {outflows.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", background: "#FEF2F2", borderBottom: "1px solid var(--border)", fontWeight: 700, fontSize: "0.82rem", color: "var(--red)" }}>
            ⬆️ المصروفات ({outflows.length})
          </div>
          {outflows.map(e => (
            <div key={e.id} style={{ padding: "0.65rem 1rem", borderBottom: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                  {e.destination_description || (e.destination_case_id ? caseMap[e.destination_case_id] : null) || "—"}
                </div>
                {e.cause && <CauseBadge cause={e.cause} />}
                {e.destination_case_id && caseMap[e.destination_case_id] && (
                  <div style={{ fontSize: "0.68rem", color: "var(--text-3)", marginTop: 2 }}>
                    الحالة: {caseMap[e.destination_case_id]}
                  </div>
                )}
              </div>
              <span style={{ fontWeight: 700, color: "var(--red)" }}>−{fmt(Number(e.amount))} ج</span>
            </div>
          ))}
          <div style={{ padding: "8px 16px", background: "var(--surface-2)", display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
            <span style={{ color: "var(--text-3)" }}>المجموع</span>
            <strong style={{ color: "var(--red)" }}>{fmt(totalOut)} ج</strong>
          </div>
        </div>
      )}

      {causeBreakdown.length === 0 && (
        <div style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-3)" }}>
          لا توجد حركات في هذه الفترة
        </div>
      )}
    </div>
  );
}
