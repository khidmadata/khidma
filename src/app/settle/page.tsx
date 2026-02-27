"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowRight, Check, Loader2, AlertCircle, Trash2, FileText, ChevronDown } from "lucide-react";
import Link from "next/link";

type Area        = { id: string; name: string };
type CaseRow     = { id: string; child_name: string; guardian_name: string; area_name: string; area_id: string; needs_level: string; is_medical_case: boolean; has_students: boolean; total_fixed_receiving: number; sponsor_count: number };
type Sponsorship = { id: string; sponsor_id: string; case_id: string; fixed_amount: number; sponsors: { name: string } | null; cases: { child_name: string; area_id: string } | null };

const fmt = (n: number) => n.toLocaleString("en");

const MONTHS_AR: Record<string, string> = {
  "01":"يناير","02":"فبراير","03":"مارس","04":"أبريل",
  "05":"مايو","06":"يونيو","07":"يوليو","08":"أغسطس",
  "09":"سبتمبر","10":"أكتوبر","11":"نوفمبر","12":"ديسمبر",
};

function genMonthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value, label: `${MONTHS_AR[value.split("-")[1]]} ${value.split("-")[0]}` });
  }
  return opts;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SettlePage() {
  const [step,      setStep]      = useState(1);
  const [monthYear, setMonthYear] = useState(currentMonth());
  const monthOptions = useMemo(genMonthOptions, []);

  const STEPS = [
    { n: 1, label: "تعديلات الشهر" },
    { n: 2, label: "توزيع الصدقات" },
    { n: 3, label: "إصدار التقارير" },
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
        {/* Month selector */}
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
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
          {STEPS.map((s, i) => (
            <div key={s.n} style={{ display: "flex", flex: 1, alignItems: "center" }}>
              <button onClick={() => setStep(s.n)} style={{
                width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.875rem", fontWeight: 800, flexShrink: 0,
                background: step >= s.n ? "var(--green)" : "var(--border)",
                color: step >= s.n ? "white" : "var(--text-3)",
                transition: "background 0.2s",
              }}>{s.n}</button>
              <span style={{
                fontSize: "0.75rem", marginRight: 8, fontWeight: step >= s.n ? 700 : 400,
                color: step >= s.n ? "var(--text-1)" : "var(--text-3)",
              }}>{s.label}</span>
              {i < 2 && <div style={{ flex: 1, height: 2, margin: "0 10px", background: step > s.n ? "var(--green)" : "var(--border)", borderRadius: 2 }} />}
            </div>
          ))}
        </div>
      </div>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "0 1rem 3rem" }}>
        {step === 1 && <Step1Adjustments monthYear={monthYear} onNext={() => setStep(2)} />}
        {step === 2 && <Step2Allocation  monthYear={monthYear} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <Step3Reports     monthYear={monthYear} onBack={() => setStep(2)} />}
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════
// STEP 1: MONTHLY ADJUSTMENTS
// ═══════════════════════════════════════════
function Step1Adjustments({ monthYear, onNext }: { monthYear: string; onNext: () => void }) {
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [adjustments,  setAdjustments]  = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);

  const [spSearch,   setSpSearch]   = useState("");
  const [selectedSp, setSelectedSp] = useState<Sponsorship | null>(null);
  const [adjType,    setAdjType]    = useState("one_time_extra");
  const [adjAmount,  setAdjAmount]  = useState("");
  const [adjReason,  setAdjReason]  = useState("");

  useEffect(() => {
    (async () => {
      const [spRes, adjRes] = await Promise.all([
        supabase.from("sponsorships").select("id, sponsor_id, case_id, fixed_amount, sponsors(name), cases(child_name, area_id)").eq("status", "active"),
        supabase.from("monthly_adjustments").select("*").eq("month_year", monthYear),
      ]);
      setSponsorships((spRes.data as any) || []);
      setAdjustments(adjRes.data || []);
      setLoading(false);
    })();
  }, [monthYear]);

  const filteredSp = useMemo(() => {
    if (!spSearch) return [];
    return sponsorships.filter(s => s.sponsors?.name?.includes(spSearch) || s.cases?.child_name?.includes(spSearch)).slice(0, 15);
  }, [sponsorships, spSearch]);

  async function addAdjustment() {
    if (!selectedSp || !adjAmount) return;
    setSaving(true);
    const { data, error } = await supabase.from("monthly_adjustments").insert({
      sponsorship_id: selectedSp.id, case_id: selectedSp.case_id, sponsor_id: selectedSp.sponsor_id,
      month_year: monthYear, adjustment_type: adjType, amount: Number(adjAmount),
      old_fixed_amount: selectedSp.fixed_amount, reason: adjReason || null,
    }).select("*").single();
    if (error) { alert("خطأ: " + error.message); setSaving(false); return; }
    if (adjType === "permanent_increase" && data) {
      await supabase.from("sponsorships").update({ fixed_amount: Number(adjAmount) }).eq("id", selectedSp.id);
      await supabase.from("sponsorship_history").insert({
        sponsorship_id: selectedSp.id, change_type: "amount_change",
        old_value: selectedSp.fixed_amount.toString(), new_value: adjAmount,
        reason: adjReason || `تعديل شهر ${monthYear}`,
      });
    }
    if (data) setAdjustments(prev => [...prev, data]);
    setSelectedSp(null); setSpSearch(""); setAdjAmount(""); setAdjReason("");
    setSaving(false);
  }

  async function removeAdj(id: string) {
    await supabase.from("monthly_adjustments").delete().eq("id", id);
    setAdjustments(prev => prev.filter(a => a.id !== id));
  }

  if (loading) return <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)" }}>جاري التحميل...</div>;

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>١. تعديلات الشهر</h2>
      <p style={{ fontSize: "0.82rem", color: "var(--text-3)", marginBottom: 20, margin: "0 0 1.25rem" }}>
        إضافة زيادات مؤقتة أو تعديل دائم للمبلغ الشهري
      </p>

      {/* Add form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: "0.9rem", marginBottom: 14 }}>إضافة تعديل</h3>
        <input value={spSearch} onChange={e => { setSpSearch(e.target.value); setSelectedSp(null); }}
          placeholder="ابحث باسم الكفيل أو الطفل..." className="input-field" style={{ marginBottom: 8 }} />

        {spSearch && !selectedSp && filteredSp.length > 0 && (
          <div className="search-dropdown" style={{ marginBottom: 12 }}>
            {filteredSp.map(s => (
              <button key={s.id} onClick={() => { setSelectedSp(s); setSpSearch(`${s.sponsors?.name} ← ${s.cases?.child_name}`); }}
                style={{ width: "100%", padding: "10px 14px", border: "none", borderBottom: "1px solid var(--border-light)", background: "var(--surface)", cursor: "pointer", textAlign: "right", fontSize: "0.875rem" }}>
                <span style={{ fontWeight: 600 }}>{s.sponsors?.name}</span>
                <span style={{ color: "var(--text-3)", margin: "0 6px" }}>←</span>
                <span>{s.cases?.child_name}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--indigo)", marginRight: 8 }}>({fmt(s.fixed_amount)} ج.م)</span>
              </button>
            ))}
          </div>
        )}

        {selectedSp && (
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <div style={{ padding: "0.75rem 1rem", background: "var(--cream)", borderRadius: "var(--radius)", fontSize: "0.875rem", border: "1px solid var(--border-light)" }}>
              <span style={{ fontWeight: 700 }}>{selectedSp.sponsors?.name}</span>
              <span style={{ color: "var(--text-3)", margin: "0 6px" }}>←</span>
              <span>{selectedSp.cases?.child_name}</span>
              <span style={{ color: "var(--indigo)", fontWeight: 700, marginRight: 8 }}>المبلغ الحالي: {fmt(selectedSp.fixed_amount)} ج.م</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label className="field-label">نوع التعديل</label>
                <select value={adjType} onChange={e => setAdjType(e.target.value)} className="select-field">
                  <option value="one_time_extra">زيادة هذا الشهر فقط</option>
                  <option value="permanent_increase">تعديل دائم (هذا الشهر + المستقبل)</option>
                </select>
              </div>
              <div>
                <label className="field-label">{adjType === "one_time_extra" ? "مبلغ الزيادة" : "المبلغ الشهري الجديد"}</label>
                <input type="number" value={adjAmount} onChange={e => setAdjAmount(e.target.value)}
                  className="input-field" dir="ltr"
                  placeholder={adjType === "one_time_extra" ? "مثل: 500" : `مثل: ${selectedSp.fixed_amount + 200}`} />
              </div>
            </div>
            <input value={adjReason} onChange={e => setAdjReason(e.target.value)}
              placeholder="السبب (مثل: مصاريف دراسية، لبس العيد...)" className="input-field" />
            <button onClick={addAdjustment} disabled={saving || !adjAmount} className="btn btn-primary">
              {saving ? "جاري الحفظ..." : "+ إضافة التعديل"}
            </button>
          </div>
        )}
      </div>

      {/* Adjustments list */}
      {adjustments.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: "0.9rem", marginBottom: 14 }}>تعديلات {monthYear} ({adjustments.length})</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {adjustments.map(adj => (
              <div key={adj.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--cream)", borderRadius: "var(--radius-sm)", padding: "0.6rem 0.875rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`badge ${adj.adjustment_type === "permanent_increase" ? "badge-advance" : "badge-neutral"}`}>
                    {adj.adjustment_type === "permanent_increase" ? "دائم" : "مرة واحدة"}
                  </span>
                  <span style={{ fontWeight: 700, color: "var(--text-1)" }}>{fmt(adj.amount)} ج.م</span>
                  {adj.reason && <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>— {adj.reason}</span>}
                </div>
                <button onClick={() => removeAdj(adj.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onNext} className="btn btn-primary btn-lg" style={{ width: "100%" }}>
        التالي: توزيع الصدقات ←
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════
// STEP 2: SADAQAT ALLOCATION
// ═══════════════════════════════════════════
function Step2Allocation({ monthYear, onNext, onBack }: { monthYear: string; onNext: () => void; onBack: () => void }) {
  const [cases,       setCases]       = useState<CaseRow[]>([]);
  const [monthInflow, setMonthInflow] = useState(0);
  const [allocations, setAllocations] = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);

  const [targetType,   setTargetType]   = useState("kafala_case");
  const [targetCaseId, setTargetCaseId] = useState("");
  const [allocAmount,  setAllocAmount]  = useState("");
  const [allocReason,  setAllocReason]  = useState("");
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    (async () => {
      const [cRes, poolRes, aRes] = await Promise.all([
        supabase.from("cases_by_receiving").select("*"),
        supabase.from("sadaqat_pool").select("transaction_type, amount").eq("month_year", monthYear),
        supabase.from("sadaqat_allocations").select("*").eq("month_year", monthYear),
      ]);
      setCases((cRes.data as CaseRow[]) || []);
      const pool = poolRes.data || [];
      const inflow = pool.filter(r => r.transaction_type === "inflow").reduce((s, r) => s + Number(r.amount), 0);
      setMonthInflow(inflow);
      setAllocations(aRes.data || []);
      setLoading(false);
    })();
  }, [monthYear]);

  const totalAllocated    = allocations.reduce((s, a) => s + Number(a.amount), 0);
  const remaining         = monthInflow - totalAllocated;
  const isFullyAllocated  = monthInflow > 0 && totalAllocated >= monthInflow;

  async function addAllocation() {
    if (!allocAmount || Number(allocAmount) <= 0) return;
    setSaving(true);
    const { data, error } = await supabase.from("sadaqat_allocations").insert({
      month_year: monthYear, target_type: targetType, target_case_id: targetCaseId || null,
      amount: Number(allocAmount), reason: allocReason || null, priority_category: targetType,
    }).select("*").single();
    if (!error && data) {
      const targetCase = cases.find(c => c.id === targetCaseId);
      await supabase.from("sadaqat_pool").insert({
        transaction_type: "outflow", amount: Number(allocAmount), destination_type: targetType,
        destination_case_id: targetCaseId || null,
        destination_description: targetCase ? `${targetCase.child_name} — ${targetCase.area_name}` : allocReason,
        month_year: monthYear, reason: allocReason || null,
      });
      setAllocations(prev => [...prev, data]);
    }
    if (error) alert("خطأ: " + error.message);
    setTargetCaseId(""); setAllocAmount(""); setAllocReason("");
    setSaving(false);
  }

  async function removeAlloc(id: string) {
    await supabase.from("sadaqat_allocations").delete().eq("id", id);
    setAllocations(prev => prev.filter(a => a.id !== id));
  }

  if (loading) return <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)" }}>جاري التحميل...</div>;

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>٢. توزيع الصدقات</h2>
      <p style={{ fontSize: "0.82rem", color: "var(--text-3)", marginBottom: 20, margin: "0 0 1.25rem" }}>
        تخصيص أموال الصدقات للحالات المحتاجة
      </p>

      {/* Fully allocated checkmark */}
      {isFullyAllocated && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--green-light)", border: "1.5px solid var(--green)", borderRadius: "var(--radius)", padding: "0.875rem 1rem", marginBottom: 16 }}>
          <Check size={20} style={{ color: "var(--green)", flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, color: "var(--green)", fontSize: "0.9rem" }}>تم توزيع كامل وارد الصدقات ✓</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-2)", marginTop: 2 }}>وارد هذا الشهر: {fmt(monthInflow)} ج.م — موزّع بالكامل</div>
          </div>
        </div>
      )}

      {/* Balance card */}
      <div className="gradient-green" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "0.68rem", fontWeight: 700, opacity: 0.65, marginBottom: 12, letterSpacing: "0.05em" }}>
          صدقات هذا الشهر — {monthYear}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, textAlign: "center" }}>
          {[
            { label: "الوارد هذا الشهر", val: monthInflow,     highlight: false },
            { label: "تم تخصيصه",         val: totalAllocated, highlight: true  },
            { label: "المتبقي",             val: Math.max(0, remaining), highlight: false },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: "0.68rem", opacity: 0.65, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: "1.3rem", fontWeight: 800, color: item.highlight ? "var(--gold-light)" : "inherit" }}>
                {fmt(item.val)}
              </div>
            </div>
          ))}
        </div>
        {monthInflow === 0 && (
          <div style={{ marginTop: 12, fontSize: "0.75rem", opacity: 0.7, textAlign: "center" }}>
            لا يوجد وارد صدقات مسجّل لهذا الشهر بعد
          </div>
        )}
      </div>

      {/* Priority guide */}
      <div style={{ background: "var(--amber-light)", border: "1px solid #E8C87A", borderRadius: "var(--radius)", padding: "0.875rem 1rem", marginBottom: 16, fontSize: "0.8rem", color: "var(--amber)" }}>
        <strong>ترتيب الأولوية:</strong> ١. حالات محتاجة → ٢. أقل استلاماً → ٣. جميع الكفالات → ٤. حالات مرضية → ٥. طلاب
      </div>

      {/* Allocation form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: "0.9rem", marginBottom: 14 }}>إضافة تخصيص</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <label className="field-label">النوع</label>
            <select value={targetType} onChange={e => setTargetType(e.target.value)} className="select-field">
              <option value="cases_in_need">حالات محتاجة</option>
              <option value="lowest_receiving">أقل استلاماً</option>
              <option value="all_kafalat">جميع الكفالات</option>
              <option value="medical">حالات مرضية</option>
              <option value="students">طلاب</option>
              <option value="external">سبب خارجي</option>
            </select>
          </div>
          <div>
            <label className="field-label">المبلغ</label>
            <input type="number" value={allocAmount} onChange={e => setAllocAmount(e.target.value)}
              className="input-field" dir="ltr" />
          </div>
        </div>

        {["cases_in_need","lowest_receiving","medical","students"].includes(targetType) && (
          <div style={{ marginBottom: 10 }}>
            <label className="field-label">الحالة (اختياري — اتركها فارغة للتوزيع العام)</label>
            <select value={targetCaseId} onChange={e => setTargetCaseId(e.target.value)} className="select-field">
              <option value="">توزيع عام</option>
              {cases
                .filter(c => {
                  if (targetType === "medical")  return c.is_medical_case;
                  if (targetType === "students") return c.has_students;
                  return true;
                })
                .map(c => (
                  <option key={c.id} value={c.id}>
                    {c.child_name} — {c.area_name} (يستلم: {fmt(c.total_fixed_receiving)} ج.م)
                  </option>
                ))}
            </select>
          </div>
        )}

        <input value={allocReason} onChange={e => setAllocReason(e.target.value)} placeholder="السبب / التفاصيل..."
          className="input-field" style={{ marginBottom: 10 }} />

        <button onClick={addAllocation} disabled={saving || !allocAmount || Number(allocAmount) <= 0 || Number(allocAmount) > remaining}
          className="btn btn-primary" style={{ background: "var(--green)", width: "100%" }}>
          {saving ? "جاري الحفظ..." : "+ إضافة تخصيص"}
        </button>
        {Number(allocAmount) > remaining && Number(allocAmount) > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: "var(--red)", marginTop: 8 }}>
            <AlertCircle size={13} /> المبلغ أكبر من المتبقي
          </div>
        )}
      </div>

      {/* Allocations list */}
      {allocations.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: "0.9rem", marginBottom: 14 }}>التخصيصات ({allocations.length})</h3>
          <div style={{ display: "grid", gap: 6 }}>
            {allocations.map(a => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--cream)", borderRadius: "var(--radius-sm)", padding: "0.6rem 0.875rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="badge badge-paid" style={{ fontSize: "0.68rem" }}>
                    {a.target_type === "cases_in_need" ? "محتاجة" : a.target_type === "lowest_receiving" ? "أقل استلاماً" :
                     a.target_type === "medical" ? "مرضية" : a.target_type === "students" ? "طلاب" :
                     a.target_type === "external" ? "خارجي" : "كفالات"}
                  </span>
                  <span style={{ fontWeight: 700, color: "var(--text-1)" }}>{fmt(a.amount)} ج.م</span>
                  {a.reason && <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>— {a.reason}</span>}
                </div>
                <button onClick={() => removeAlloc(a.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4 }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, marginTop: 8, borderTop: "1px solid var(--border)", fontSize: "0.875rem" }}>
            <span style={{ color: "var(--text-2)", fontWeight: 600 }}>إجمالي المخصص</span>
            <span style={{ fontWeight: 800, color: "var(--green)" }}>{fmt(totalAllocated)} ج.م</span>
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

// ═══════════════════════════════════════════
// STEP 3: REPORTS
// ═══════════════════════════════════════════
function Step3Reports({ monthYear, onBack }: { monthYear: string; onBack: () => void }) {
  const [areas,      setAreas]      = useState<Area[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("areas").select("*").eq("is_active", true);
      setAreas(data || []);
      setLoading(false);
    })();
  }, []);

  function openReport(areaId: string) {
    setGenerating(areaId);
    window.open(`/report?area=${areaId}&month=${monthYear}`, "_blank");
    setTimeout(() => setGenerating(null), 1000);
  }

  async function closeMonth() {
    const confirmed = window.confirm(`هل تريد إغلاق شهر ${monthYear}؟ لن يمكن تعديل البيانات بعد الإغلاق.`);
    if (!confirmed) return;
    await supabase.from("monthly_settlements").upsert({
      month_year: monthYear, status: "closed", closed_at: new Date().toISOString(),
    }, { onConflict: "month_year" });
    alert("تم إغلاق الشهر بنجاح!");
  }

  if (loading) return <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)" }}>جاري التحميل...</div>;

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>٣. إصدار التقارير</h2>
      <p style={{ fontSize: "0.82rem", color: "var(--text-3)", marginBottom: 20, margin: "0 0 1.25rem" }}>
        إصدار كشف لكل موقع وإغلاق الشهر
      </p>

      {/* Area report cards */}
      <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
        {areas.map(area => (
          <div key={area.id} className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700, color: "var(--text-1)", marginBottom: 2 }}>{area.name}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>{monthYear}</div>
            </div>
            <button onClick={() => openReport(area.id)} disabled={generating === area.id}
              className="btn btn-secondary" style={{ gap: 8, color: "var(--indigo)", borderColor: "var(--indigo-light)", background: "var(--indigo-light)" }}>
              {generating === area.id ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <FileText size={14} />}
              إصدار الكشف
            </button>
          </div>
        ))}
      </div>

      {/* All areas button */}
      <div className="card" style={{ marginBottom: 20, background: "var(--green-light)", border: "1px solid #9EE0BB" }}>
        <h3 style={{ fontSize: "0.9rem", marginBottom: 8, color: "var(--green)" }}>🖨️ طباعة جميع الكشوفات</h3>
        <p style={{ fontSize: "0.8rem", color: "var(--text-2)", marginBottom: 14 }}>
          افتح كل كشف في نافذة جديدة واطبعه أو احفظه كـ PDF
        </p>
        <button onClick={() => areas.forEach(a => window.open(`/report?area=${a.id}&month=${monthYear}`, "_blank"))}
          className="btn btn-primary" style={{ width: "100%" }}>
          <Check size={16} /> فتح جميع الكشوفات دفعة واحدة
        </button>
      </div>

      {/* Close month */}
      <div className="card" style={{ background: "var(--red-light)", border: "1px solid #F5C2BF", marginBottom: 20 }}>
        <h3 style={{ fontSize: "0.9rem", marginBottom: 8, color: "var(--red)" }}>إغلاق الشهر</h3>
        <p style={{ fontSize: "0.8rem", color: "var(--text-2)", marginBottom: 14 }}>
          بعد إغلاق الشهر، لن يمكن تعديل التحصيلات أو التخصيصات.
        </p>
        <button onClick={closeMonth} className="btn btn-danger">
          🔒 إغلاق شهر {monthYear}
        </button>
      </div>

      <button onClick={onBack} className="btn btn-secondary" style={{ width: "100%" }}>← السابق</button>
    </div>
  );
}
