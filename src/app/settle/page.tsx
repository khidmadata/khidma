"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  ArrowRight, Check, Trash2, ChevronDown, CheckCircle, Circle, FileText, AlertCircle,
} from "lucide-react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────
type Area        = { id: string; name: string };
type Sponsorship = {
  id: string; sponsor_id: string; case_id: string; fixed_amount: number;
  sponsors: { name: string } | null;
  cases: { child_name: string; guardian_name: string | null; area_id: string } | null;
};
type Operator    = { id: string; name: string };
type Adjustment  = {
  id: string; sponsorship_id: string; month_year: string;
  adjustment_type: string; amount: number; old_fixed_amount: number;
  reason: string | null; applied: boolean;
  sponsorships?: {
    fixed_amount: number;
    sponsors: { name: string } | null;
    cases: { child_name: string; guardian_name: string | null } | null;
  };
};

// ─── Utilities ────────────────────────────────────────────────────────────────
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

function genMonthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = -1; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value, label: fmtMonth(value) });
  }
  return opts;
}

function currentMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const d = now.getDate() >= lastDay - 6
    ? new Date(now.getFullYear(), now.getMonth() + 1, 1)
    : now;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Shared: Sponsorship Search Dropdown ─────────────────────────────────────
function SpSearch({
  sponsorships, value, onChange, onSelect,
  placeholder = "انقر للاختيار أو ابحث بالاسم...",
}: {
  sponsorships: Sponsorship[];
  value: string;
  onChange: (v: string) => void;
  onSelect: (sp: Sponsorship) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);

  const filtered = useMemo(() => {
    const q = value.trim();
    const list = q
      ? sponsorships.filter(s =>
          s.sponsors?.name?.includes(q) ||
          s.cases?.child_name?.includes(q) ||
          s.cases?.guardian_name?.includes(q)
        )
      : sponsorships;
    return list.slice(0, 25);
  }, [sponsorships, value]);

  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={placeholder}
        className="input-field"
      />
      {focused && filtered.length > 0 && (
        <div className="search-dropdown">
          {filtered.map(s => (
            <button
              key={s.id}
              onMouseDown={() => onSelect(s)}
              className="search-dropdown-item"
              style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "8px 12px" }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>{s.sponsors?.name}</span>
                <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>←</span>
                <span style={{ color: "var(--text-2)" }}>{s.cases?.child_name}</span>
                <span style={{ color: "var(--indigo)", fontSize: "0.78rem", marginRight: "auto" }}>
                  {fmt(s.fixed_amount)} ج
                </span>
              </div>
              {s.cases?.guardian_name && (
                <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>
                  وليّ الأمر: {s.cases.guardian_name}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Shared: Collected Toggle ─────────────────────────────────────────────────
function CollectedBtn({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "6px 12px", borderRadius: 100, border: "none", cursor: "pointer",
        fontSize: "0.8rem", fontWeight: 700,
        background: value ? "var(--green-light)" : "var(--surface-2)",
        color:      value ? "var(--green)"       : "var(--text-3)",
        transition: "all 0.15s",
      }}
    >
      {value ? <CheckCircle size={15} /> : <Circle size={15} />}
      {value ? "تم التحصيل" : "لم يُحصَّل"}
    </button>
  );
}

// ─── Shared: Loading ──────────────────────────────────────────────────────────
function Loader() {
  return <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)" }}>جاري التحميل...</div>;
}

// ─── Shared: Selected Sponsorship Card ───────────────────────────────────────
function SelectedCard({ sp, extra }: { sp: Sponsorship; extra: string }) {
  return (
    <div style={{ background: "var(--cream)", borderRadius: "var(--radius-sm)", padding: "0.6rem 0.875rem", fontSize: "0.875rem", border: "1px solid var(--border-light)" }}>
      <span style={{ fontWeight: 700 }}>{sp.sponsors?.name}</span>
      <span style={{ color: "var(--text-3)", margin: "0 8px" }}>←</span>
      <span>{sp.cases?.child_name}</span>
      {sp.cases?.guardian_name && (
        <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}> (وليّ: {sp.cases.guardian_name})</span>
      )}
      <span style={{ float: "left", color: "var(--indigo)", fontWeight: 700 }}>{extra}</span>
    </div>
  );
}

// ─── Shared: Adjustments List ─────────────────────────────────────────────────
function AdjList({
  items, title, renderAmount, totalLabel, totalValue, totalColor, onDelete, onToggle,
}: {
  items: Adjustment[];
  title: string;
  renderAmount: (e: Adjustment) => React.ReactNode;
  totalLabel: string;
  totalValue: string;
  totalColor: string;
  onDelete: (id: string) => void;
  onToggle: (id: string, current: boolean) => void;
}) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: "0.9rem", marginBottom: 12 }}>
        {title}
        <span style={{ fontWeight: 400, color: "var(--text-3)", marginRight: 8 }}>({items.length})</span>
      </h3>
      <div style={{ display: "grid", gap: 8 }}>
        {items.map(e => (
          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--cream)", borderRadius: "var(--radius-sm)", padding: "0.6rem 0.875rem" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: "0.875rem" }}>
                {(e.sponsorships as any)?.sponsors?.name} ← {(e.sponsorships as any)?.cases?.child_name}
                {(e.sponsorships as any)?.cases?.guardian_name && (
                  <span style={{ fontWeight: 400, fontSize: "0.75rem", color: "var(--text-3)" }}>
                    {" "}(وليّ: {(e.sponsorships as any).cases.guardian_name})
                  </span>
                )}
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-3)", marginTop: 2 }}>
                {renderAmount(e)}
                {e.reason && <span style={{ marginRight: 8 }}>— {e.reason}</span>}
              </div>
            </div>
            <button
              onClick={() => onToggle(e.id, e.applied)}
              style={{
                padding: "3px 8px", borderRadius: 100, border: "none", cursor: "pointer",
                fontSize: "0.72rem", fontWeight: 700, whiteSpace: "nowrap",
                background: e.applied ? "var(--green-light)" : "var(--surface-2)",
                color:      e.applied ? "var(--green)"       : "var(--text-3)",
              }}
            >
              {e.applied ? "✓ محصَّل" : "لم يُحصَّل"}
            </button>
            <button
              onClick={() => onDelete(e.id)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4 }}
              onMouseEnter={ev => (ev.currentTarget.style.color = "var(--red)")}
              onMouseLeave={ev => (ev.currentTarget.style.color = "var(--text-3)")}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)", fontSize: "0.875rem" }}>
        <span style={{ color: "var(--text-2)" }}>{totalLabel}</span>
        <strong style={{ color: totalColor }}>{totalValue}</strong>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function SettlePage() {
  const [step,      setStep]      = useState(1);
  const [monthYear, setMonthYear] = useState(currentMonth());
  const monthOptions = useMemo(genMonthOptions, []);

  const STEPS = [
    { n: 1, label: "زيادات دائمة"  },
    { n: 2, label: "زيادات مؤقتة" },
    { n: 3, label: "الصدقات"       },
    { n: 4, label: "التقارير"      },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <header className="app-header">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ gap: 4 }}>
          <ArrowRight size={18} />
        </Link>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div className="app-logo" style={{ fontSize: "1.1rem" }}>تسوية الشهر</div>
        </div>
        <div style={{ position: "relative" }}>
          <select value={monthYear} onChange={e => setMonthYear(e.target.value)} className="select-field"
            style={{ paddingLeft: 28, minWidth: 148, height: 38, fontSize: "0.8rem" }}>
            {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown size={13} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
        </div>
      </header>

      {/* Step indicator */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "1.25rem 1rem 0" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ display: "flex", flex: 1, alignItems: "center" }}>
              <button
                onClick={() => setStep(s.n)}
                style={{
                  width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.8rem", fontWeight: 800, flexShrink: 0,
                  background: step >= s.n ? "var(--green)" : "var(--border)",
                  color:      step >= s.n ? "white"        : "var(--text-3)",
                  transition: "background 0.2s",
                }}
              >{s.n}</button>
              <span style={{
                fontSize: "0.7rem", marginRight: 6,
                fontWeight: step >= s.n ? 700 : 400,
                color: step >= s.n ? "var(--text-1)" : "var(--text-3)",
                whiteSpace: "nowrap",
              }}>{s.label}</span>
              {i < 3 && (
                <div style={{ flex: 1, height: 2, margin: "0 6px", borderRadius: 2, background: step > s.n ? "var(--green)" : "var(--border)" }} />
              )}
            </div>
          ))}
        </div>
      </div>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "0 1rem 3rem" }}>
        {step === 1 && <StepPermanent monthYear={monthYear} onNext={() => setStep(2)} />}
        {step === 2 && <StepOneTime   monthYear={monthYear} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <StepSadaqat  monthYear={monthYear} onNext={() => setStep(4)} onBack={() => setStep(2)} />}
        {step === 4 && <StepReports  monthYear={monthYear} onBack={() => setStep(3)} />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 1 — PERMANENT INCREASES
// ═══════════════════════════════════════════════════════════════════════════════
function StepPermanent({ monthYear, onNext }: { monthYear: string; onNext: () => void }) {
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [existing,     setExisting]     = useState<Adjustment[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);

  const [search,     setSearch]     = useState("");
  const [selectedSp, setSelectedSp] = useState<Sponsorship | null>(null);
  const [newAmount,  setNewAmount]  = useState("");
  const [reason,     setReason]     = useState("");
  const [collected,  setCollected]  = useState(false);

  useEffect(() => {
    (async () => {
      const [spRes, adjRes] = await Promise.all([
        supabase.from("sponsorships")
          .select("id, sponsor_id, case_id, fixed_amount, sponsors(name), cases(child_name, guardian_name, area_id)")
          .eq("status", "active"),
        supabase.from("monthly_adjustments")
          .select("*, sponsorships(fixed_amount, sponsors(name), cases(child_name, guardian_name))")
          .eq("month_year", monthYear)
          .eq("adjustment_type", "permanent_increase"),
      ]);
      setSponsorships((spRes.data as any) || []);
      setExisting((adjRes.data as any) || []);
      setLoading(false);
    })();
  }, [monthYear]);

  async function addEntry() {
    if (!selectedSp || !newAmount || Number(newAmount) <= selectedSp.fixed_amount) return;
    setSaving(true);
    const { data, error } = await supabase.from("monthly_adjustments").insert({
      sponsorship_id:   selectedSp.id,
      case_id:          selectedSp.case_id,
      sponsor_id:       selectedSp.sponsor_id,
      month_year:       monthYear,
      adjustment_type:  "permanent_increase",
      amount:           Number(newAmount),
      old_fixed_amount: selectedSp.fixed_amount,
      reason:           reason || null,
      applied:          collected,
    })
    .select("*, sponsorships(fixed_amount, sponsors(name), cases(child_name, guardian_name))")
    .single();

    if (!error && data) {
      await supabase.from("sponsorships").update({ fixed_amount: Number(newAmount) }).eq("id", selectedSp.id);
      setSponsorships(prev => prev.map(s =>
        s.id === selectedSp.id ? { ...s, fixed_amount: Number(newAmount) } : s
      ));
      setExisting(prev => [...prev, data as any]);
    }
    if (error) alert("خطأ: " + error.message);
    setSelectedSp(null); setSearch(""); setNewAmount(""); setReason(""); setCollected(false);
    setSaving(false);
  }

  async function removeEntry(id: string) {
    await supabase.from("monthly_adjustments").delete().eq("id", id);
    setExisting(prev => prev.filter(e => e.id !== id));
  }

  async function toggleCollected(id: string, current: boolean) {
    await supabase.from("monthly_adjustments").update({ applied: !current }).eq("id", id);
    setExisting(prev => prev.map(e => e.id === id ? { ...e, applied: !current } : e));
  }

  if (loading) return <Loader />;

  const totalIncrease = existing.reduce((s, e) => s + (Number(e.amount) - Number(e.old_fixed_amount)), 0);

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>١. الزيادات الدائمة</h2>
      <p style={{ fontSize: "0.82rem", color: "var(--text-3)", marginBottom: 20, margin: "0 0 1.25rem" }}>
        تغييرات دائمة في مبلغ الكفالة — تُطبَّق من هذا الشهر فصاعداً
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: "0.9rem", marginBottom: 12 }}>إضافة زيادة دائمة</h3>
        <SpSearch
          sponsorships={sponsorships}
          value={search}
          onChange={v => { setSearch(v); setSelectedSp(null); }}
          onSelect={s => { setSelectedSp(s); setSearch(`${s.sponsors?.name} ← ${s.cases?.child_name}`); }}
        />

        {selectedSp && (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <SelectedCard sp={selectedSp} extra={`الكفالة الحالية: ${fmt(selectedSp.fixed_amount)} ج`} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label className="field-label">المبلغ الشهري الجديد</label>
                <input
                  type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)}
                  className="input-field" dir="ltr"
                  placeholder={`أكثر من ${selectedSp.fixed_amount}`}
                />
                {newAmount && Number(newAmount) > selectedSp.fixed_amount && (
                  <div style={{ fontSize: "0.72rem", color: "var(--green)", marginTop: 3 }}>
                    زيادة: +{fmt(Number(newAmount) - selectedSp.fixed_amount)} ج/شهر
                  </div>
                )}
                {newAmount && Number(newAmount) > 0 && Number(newAmount) <= selectedSp.fixed_amount && (
                  <div style={{ fontSize: "0.72rem", color: "var(--red)", marginTop: 3 }}>
                    يجب أن يكون أكبر من المبلغ الحالي
                  </div>
                )}
              </div>
              <div>
                <label className="field-label">السبب</label>
                <input value={reason} onChange={e => setReason(e.target.value)}
                  className="input-field" placeholder="مثل: زيادة سنوية..." />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <CollectedBtn value={collected} onChange={setCollected} />
              <button
                onClick={addEntry}
                disabled={saving || !newAmount || Number(newAmount) <= selectedSp.fixed_amount}
                className="btn btn-primary"
              >
                {saving ? "جاري الحفظ..." : "+ إضافة"}
              </button>
            </div>
          </div>
        )}
      </div>

      {existing.length > 0 && (
        <AdjList
          items={existing}
          title={`الزيادات الدائمة — ${fmtMonth(monthYear)}`}
          renderAmount={e => (
            <span>
              {fmt(e.old_fixed_amount)} → <strong style={{ color: "var(--green)" }}>{fmt(e.amount)}</strong> ج
            </span>
          )}
          totalLabel="إجمالي الزيادة الدائمة"
          totalValue={`+${fmt(totalIncrease)} ج/شهر`}
          totalColor="var(--green)"
          onDelete={removeEntry}
          onToggle={toggleCollected}
        />
      )}

      <button onClick={onNext} className="btn btn-primary btn-lg" style={{ width: "100%" }}>
        التالي: الزيادات المؤقتة ←
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2 — ONE-TIME INCREASES
// ═══════════════════════════════════════════════════════════════════════════════
function StepOneTime({ monthYear, onNext, onBack }: { monthYear: string; onNext: () => void; onBack: () => void }) {
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [existing,     setExisting]     = useState<Adjustment[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);

  const [search,     setSearch]     = useState("");
  const [selectedSp, setSelectedSp] = useState<Sponsorship | null>(null);
  const [amount,     setAmount]     = useState("");
  const [reason,     setReason]     = useState("");
  const [collected,  setCollected]  = useState(false);

  useEffect(() => {
    (async () => {
      const [spRes, adjRes] = await Promise.all([
        supabase.from("sponsorships")
          .select("id, sponsor_id, case_id, fixed_amount, sponsors(name), cases(child_name, guardian_name, area_id)")
          .eq("status", "active"),
        supabase.from("monthly_adjustments")
          .select("*, sponsorships(fixed_amount, sponsors(name), cases(child_name, guardian_name))")
          .eq("month_year", monthYear)
          .eq("adjustment_type", "one_time_extra"),
      ]);
      setSponsorships((spRes.data as any) || []);
      setExisting((adjRes.data as any) || []);
      setLoading(false);
    })();
  }, [monthYear]);

  async function addEntry() {
    if (!selectedSp || !amount || Number(amount) <= 0) return;
    setSaving(true);
    const { data, error } = await supabase.from("monthly_adjustments").insert({
      sponsorship_id:   selectedSp.id,
      case_id:          selectedSp.case_id,
      sponsor_id:       selectedSp.sponsor_id,
      month_year:       monthYear,
      adjustment_type:  "one_time_extra",
      amount:           Number(amount),
      old_fixed_amount: selectedSp.fixed_amount,
      reason:           reason || null,
      applied:          collected,
    })
    .select("*, sponsorships(fixed_amount, sponsors(name), cases(child_name, guardian_name))")
    .single();

    if (!error && data) setExisting(prev => [...prev, data as any]);
    if (error) alert("خطأ: " + error.message);
    setSelectedSp(null); setSearch(""); setAmount(""); setReason(""); setCollected(false);
    setSaving(false);
  }

  async function removeEntry(id: string) {
    await supabase.from("monthly_adjustments").delete().eq("id", id);
    setExisting(prev => prev.filter(e => e.id !== id));
  }

  async function toggleCollected(id: string, current: boolean) {
    await supabase.from("monthly_adjustments").update({ applied: !current }).eq("id", id);
    setExisting(prev => prev.map(e => e.id === id ? { ...e, applied: !current } : e));
  }

  if (loading) return <Loader />;

  const total = existing.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>٢. الزيادات المؤقتة</h2>
      <p style={{ fontSize: "0.82rem", color: "var(--text-3)", marginBottom: 20, margin: "0 0 1.25rem" }}>
        زيادات لهذا الشهر فقط — مصاريف دراسية، ملابس العيد، احتياجات طارئة
      </p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: "0.9rem", marginBottom: 12 }}>إضافة زيادة مؤقتة</h3>
        <SpSearch
          sponsorships={sponsorships}
          value={search}
          onChange={v => { setSearch(v); setSelectedSp(null); }}
          onSelect={s => { setSelectedSp(s); setSearch(`${s.sponsors?.name} ← ${s.cases?.child_name}`); }}
        />

        {selectedSp && (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            <SelectedCard sp={selectedSp} extra={`كفالة: ${fmt(selectedSp.fixed_amount)} ج`} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label className="field-label">مبلغ الزيادة</label>
                <input
                  type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  className="input-field" dir="ltr" placeholder="مثل: 500"
                />
              </div>
              <div>
                <label className="field-label">السبب</label>
                <input value={reason} onChange={e => setReason(e.target.value)}
                  className="input-field" placeholder="مصاريف دراسية، لبس عيد..." />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <CollectedBtn value={collected} onChange={setCollected} />
              <button
                onClick={addEntry}
                disabled={saving || !amount || Number(amount) <= 0}
                className="btn btn-primary"
              >
                {saving ? "جاري الحفظ..." : "+ إضافة"}
              </button>
            </div>
          </div>
        )}
      </div>

      {existing.length > 0 && (
        <AdjList
          items={existing}
          title={`الزيادات المؤقتة — ${fmtMonth(monthYear)}`}
          renderAmount={e => (
            <span>زيادة: <strong style={{ color: "var(--gold)" }}>+{fmt(e.amount)}</strong> ج</span>
          )}
          totalLabel="إجمالي الزيادات المؤقتة"
          totalValue={`+${fmt(total)} ج`}
          totalColor="var(--gold)"
          onDelete={removeEntry}
          onToggle={toggleCollected}
        />
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} className="btn btn-secondary" style={{ flex: 1 }}>← السابق</button>
        <button onClick={onNext} className="btn btn-primary"   style={{ flex: 1 }}>التالي: الصدقات ←</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 3 — SADAQAT
// ═══════════════════════════════════════════════════════════════════════════════
function StepSadaqat({ monthYear, onNext, onBack }: { monthYear: string; onNext: () => void; onBack: () => void }) {
  const [cases,       setCases]       = useState<any[]>([]);
  const [operators,   setOperators]   = useState<Operator[]>([]);
  const [monthInflow, setMonthInflow] = useState(0);
  const [entries,     setEntries]     = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);

  const [entryType,       setEntryType]       = useState<"kafalah" | "external">("kafalah");
  const [caseSearch,      setCaseSearch]      = useState("");
  const [caseFocused,     setCaseFocused]     = useState(false);
  const [selectedCase,    setSelectedCase]    = useState<any | null>(null);
  const [recipientName,   setRecipientName]   = useState("");
  const [recipientDetail, setRecipientDetail] = useState("");
  const [amount,          setAmount]          = useState("");
  const [reason,          setReason]          = useState("");
  const [receivedBy,      setReceivedBy]      = useState("");

  useEffect(() => {
    (async () => {
      const [cRes, opRes, inflowRes, outflowRes] = await Promise.all([
        supabase.from("cases_by_receiving").select("*"),
        supabase.from("operators").select("id, name").neq("name", "شريف"),
        supabase.from("sadaqat_pool").select("amount").eq("month_year", monthYear).eq("transaction_type", "inflow"),
        supabase.from("sadaqat_pool").select("*").eq("month_year", monthYear).eq("transaction_type", "outflow"),
      ]);
      setCases((cRes.data as any[]) || []);
      setOperators(opRes.data || []);
      const inflow = (inflowRes.data || []).reduce((s: number, r: any) => s + Number(r.amount), 0);
      setMonthInflow(inflow);
      setEntries(outflowRes.data || []);
      setLoading(false);
    })();
  }, [monthYear]);

  const filteredCases = useMemo(() => {
    const q = caseSearch.trim();
    const list = q
      ? cases.filter(c => c.child_name?.includes(q) || c.guardian_name?.includes(q) || c.area_name?.includes(q))
      : cases;
    return list.slice(0, 25);
  }, [cases, caseSearch]);

  async function addEntry() {
    if (!amount || Number(amount) <= 0) return;
    if (entryType === "external" && !recipientName.trim()) return;
    setSaving(true);

    const description = entryType === "kafalah"
      ? (selectedCase
          ? `${selectedCase.child_name}${selectedCase.guardian_name ? ` (${selectedCase.guardian_name})` : ""} — ${selectedCase.area_name}`
          : "")
      : `${recipientName}${recipientDetail ? ` — ${recipientDetail}` : ""}`;

    const { data, error } = await supabase.from("sadaqat_pool").insert({
      transaction_type:        "outflow",
      amount:                  Number(amount),
      destination_type:        entryType === "kafalah" ? "kafala_case" : "one_time_case",
      destination_case_id:     selectedCase?.id || null,
      destination_description: description || reason || null,
      month_year:              monthYear,
      reason:                  reason || null,
      approved_by:             receivedBy || null,
    }).select("*").single();

    if (!error && data) setEntries(prev => [...prev, data]);
    if (error) alert("خطأ: " + error.message);

    setSelectedCase(null); setCaseSearch(""); setRecipientName(""); setRecipientDetail("");
    setAmount(""); setReason(""); setReceivedBy("");
    setSaving(false);
  }

  async function removeEntry(id: string) {
    await supabase.from("sadaqat_pool").delete().eq("id", id);
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  if (loading) return <Loader />;

  const totalAllocated   = entries.reduce((s, e) => s + Number(e.amount), 0);
  const remaining        = monthInflow - totalAllocated;
  const isFullyAllocated = monthInflow > 0 && totalAllocated >= monthInflow;

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>٣. الصدقات</h2>
      <p style={{ fontSize: "0.82rem", color: "var(--text-3)", marginBottom: 20, margin: "0 0 1.25rem" }}>
        توزيع وارد الصدقات على المستفيدين — {fmtMonth(monthYear)}
      </p>

      {isFullyAllocated && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--green-light)", border: "1.5px solid var(--green)", borderRadius: "var(--radius)", padding: "0.875rem 1rem", marginBottom: 16 }}>
          <Check size={20} style={{ color: "var(--green)", flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, color: "var(--green)", fontSize: "0.9rem" }}>تم توزيع كامل وارد الصدقات ✓</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-2)", marginTop: 2 }}>وارد: {fmt(monthInflow)} ج — موزَّع بالكامل</div>
          </div>
        </div>
      )}

      {/* Balance summary */}
      <div className="gradient-green" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "0.68rem", fontWeight: 700, opacity: 0.65, marginBottom: 12, letterSpacing: "0.05em" }}>
          صدقات {fmtMonth(monthYear)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, textAlign: "center" }}>
          {[
            { label: "الوارد",   val: monthInflow,            note: "تبرعات مستلمة"        },
            { label: "المصروف", val: totalAllocated,         note: "تم توزيعه", gold: true },
            { label: "المتبقي",  val: Math.max(0, remaining), note: "للتوزيع"               },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: "0.68rem", opacity: 0.65, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: "1.3rem", fontWeight: 800, color: (item as any).gold ? "var(--gold-light)" : "inherit" }}>
                {fmt(item.val)}
              </div>
              <div style={{ fontSize: "0.63rem", opacity: 0.45, marginTop: 2 }}>{item.note}</div>
            </div>
          ))}
        </div>
        {monthInflow === 0 && (
          <div style={{ marginTop: 12, fontSize: "0.75rem", opacity: 0.7, textAlign: "center" }}>
            لا يوجد وارد صدقات مسجَّل لهذا الشهر
          </div>
        )}
      </div>

      {/* Add form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: "0.9rem", marginBottom: 12 }}>إضافة صرف</h3>

        {/* Type toggle */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {([["kafalah", "لكفالة موجودة"], ["external", "حالة خارجية / طارئة"]] as [string, string][]).map(([v, lbl]) => (
            <button
              key={v}
              onClick={() => {
                setEntryType(v as any);
                setSelectedCase(null); setCaseSearch(""); setRecipientName(""); setRecipientDetail("");
              }}
              className="btn"
              style={{
                flex: 1,
                background: entryType === v ? "var(--green-light)" : "var(--surface)",
                color:      entryType === v ? "var(--green)"       : "var(--text-3)",
                border:     entryType === v ? "2px solid var(--green)" : "1.5px solid var(--border)",
                fontWeight: 600, fontSize: "0.875rem",
              }}
            >{lbl}</button>
          ))}
        </div>

        {/* Kafalah case search */}
        {entryType === "kafalah" && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ position: "relative" }}>
              <input
                value={caseSearch}
                onChange={e => { setCaseSearch(e.target.value); setSelectedCase(null); }}
                onFocus={() => setCaseFocused(true)}
                onBlur={() => setTimeout(() => setCaseFocused(false), 150)}
                placeholder="ابحث باسم الطفل أو وليّ الأمر أو المنطقة..."
                className="input-field"
              />
              {caseFocused && !selectedCase && filteredCases.length > 0 && (
                <div className="search-dropdown">
                  {filteredCases.map(c => (
                    <button
                      key={c.id}
                      onMouseDown={() => {
                        setSelectedCase(c);
                        setCaseSearch(`${c.child_name} — ${c.area_name}`);
                        setCaseFocused(false);
                      }}
                      className="search-dropdown-item"
                      style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "8px 12px" }}
                    >
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ fontWeight: 700 }}>{c.child_name}</span>
                        <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}>— {c.area_name}</span>
                      </div>
                      {c.guardian_name && (
                        <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>وليّ: {c.guardian_name}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedCase && (
              <div style={{ marginTop: 6, background: "var(--cream)", borderRadius: "var(--radius-sm)", padding: "0.5rem 0.875rem", fontSize: "0.875rem", border: "1px solid var(--border-light)" }}>
                <span style={{ fontWeight: 700 }}>{selectedCase.child_name}</span>
                <span style={{ color: "var(--text-3)", margin: "0 6px" }}>—</span>
                <span>{selectedCase.area_name}</span>
                {selectedCase.guardian_name && (
                  <span style={{ color: "var(--text-3)", fontSize: "0.78rem" }}> (وليّ: {selectedCase.guardian_name})</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* External case fields */}
        {entryType === "external" && (
          <div style={{ display: "grid", gap: 10, marginBottom: 10 }}>
            <div>
              <label className="field-label">اسم المستفيد *</label>
              <input value={recipientName} onChange={e => setRecipientName(e.target.value)}
                className="input-field" placeholder="الاسم الكامل للمستفيد..." />
            </div>
            <div>
              <label className="field-label">التفاصيل / السبب</label>
              <input value={recipientDetail} onChange={e => setRecipientDetail(e.target.value)}
                className="input-field" placeholder="مثل: علاج — شراء أدوية — إيجار — مصاريف..." />
            </div>
          </div>
        )}

        {/* Amount + received by */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label className="field-label">المبلغ</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="input-field" dir="ltr" placeholder="0" />
          </div>
          <div>
            <label className="field-label">استلمه</label>
            <input value={receivedBy} onChange={e => setReceivedBy(e.target.value)}
              className="input-field" list="ops-list" placeholder="من استلم المبلغ..." />
            <datalist id="ops-list">
              {operators.map(o => <option key={o.id} value={o.name} />)}
            </datalist>
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label className="field-label">ملاحظات إضافية</label>
          <input value={reason} onChange={e => setReason(e.target.value)}
            className="input-field" placeholder="أي ملاحظات إضافية..." />
        </div>

        {Number(amount) > remaining && Number(amount) > 0 && remaining >= 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: "var(--red)", marginBottom: 8 }}>
            <AlertCircle size={13} /> المبلغ أكبر من الرصيد المتبقي ({fmt(remaining)} ج)
          </div>
        )}

        <button
          onClick={addEntry}
          disabled={saving || !amount || Number(amount) <= 0 || (entryType === "external" && !recipientName.trim())}
          className="btn btn-primary"
          style={{ width: "100%", background: "var(--green)" }}
        >
          {saving ? "جاري الحفظ..." : "+ إضافة صرف"}
        </button>
      </div>

      {/* Entries list */}
      {entries.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: "0.9rem", marginBottom: 12 }}>
            المصروفات — {fmtMonth(monthYear)}
            <span style={{ fontWeight: 400, color: "var(--text-3)", marginRight: 8 }}>({entries.length})</span>
          </h3>
          <div style={{ display: "grid", gap: 8 }}>
            {entries.map((e: any) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--cream)", borderRadius: "var(--radius-sm)", padding: "0.6rem 0.875rem" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.875rem" }}>
                    {e.destination_description || e.reason || "—"}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-3)", display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                    <span className={`badge ${e.destination_type === "kafala_case" ? "badge-neutral" : "badge-advance"}`} style={{ fontSize: "0.65rem" }}>
                      {e.destination_type === "kafala_case" ? "كفالة" : "خارجي"}
                    </span>
                    {e.approved_by && <span>استلمه: <strong>{e.approved_by}</strong></span>}
                  </div>
                </div>
                <strong style={{ color: "var(--text-1)", whiteSpace: "nowrap" }}>{fmt(e.amount)} ج</strong>
                <button
                  onClick={() => removeEntry(e.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4 }}
                  onMouseEnter={ev => (ev.currentTarget.style.color = "var(--red)")}
                  onMouseLeave={ev => (ev.currentTarget.style.color = "var(--text-3)")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)", fontSize: "0.875rem" }}>
            <span style={{ color: "var(--text-2)" }}>إجمالي المصروفات</span>
            <strong>{fmt(totalAllocated)} ج</strong>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onBack} className="btn btn-secondary" style={{ flex: 1 }}>← السابق</button>
        <button onClick={onNext} className="btn btn-primary"   style={{ flex: 1 }}>التالي: التقارير ←</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 4 — REPORTS
// ═══════════════════════════════════════════════════════════════════════════════
function StepReports({ monthYear, onBack }: { monthYear: string; onBack: () => void }) {
  const [areas,   setAreas]   = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("areas").select("*").eq("is_active", true).then(({ data }) => {
      setAreas(data || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <Loader />;

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>٤. إصدار التقارير</h2>
      <p style={{ fontSize: "0.82rem", color: "var(--text-3)", marginBottom: 24, margin: "0 0 1.5rem" }}>
        كشوف الصرف الشهرية لكل منطقة — {fmtMonth(monthYear)}
      </p>
      <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        {areas.map(area => (
          <button
            key={area.id}
            onClick={() => window.open(`/report?area=${area.id}&month=${monthYear}`, "_blank")}
            className="card"
            style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", border: "1.5px solid var(--border)", transition: "border-color 0.15s" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--green)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <FileText size={18} style={{ color: "var(--green)" }} />
              <span style={{ fontWeight: 700 }}>كشف {area.name}</span>
            </div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>فتح التقرير ↗</span>
          </button>
        ))}
      </div>
      <button onClick={onBack} className="btn btn-secondary" style={{ width: "100%" }}>← السابق</button>
    </div>
  );
}
