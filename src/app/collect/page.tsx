"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { ArrowRight, CheckCircle, Loader2, Camera, PenLine, Search } from "lucide-react";

type Sponsor = { id: string; legacy_id: number; name: string; phone: string | null };
type Operator = { id: string; name: string };
type ExtractedData = {
  sender_name: string; amount: number; bank: string;
  recipient: string; reference: string; date: string;
  matched_sponsor: Sponsor | null; confidence: number;
};

const fmt = (n: number) => n.toLocaleString("en");

const MONTHS_AR: Record<string, string> = {
  "01":"يناير","02":"فبراير","03":"مارس","04":"أبريل",
  "05":"مايو","06":"يونيو","07":"يوليو","08":"أغسطس",
  "09":"سبتمبر","10":"أكتوبر","11":"نوفمبر","12":"ديسمبر",
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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

// ─── Save helper ───────────────────────────────────────────────────────────
async function saveCollection(params: {
  sponsor_id: string; amount: number; fixed: number; extra: number; sadaqat: number;
  month: string; operator: string; method: string; notes: string; ocr_raw?: any;
  sponsor_name: string; advance_type?: string; advance_months?: number;
}) {
  const advType   = params.advance_type   || "monthly";
  const advMonths = params.advance_months || 1;

  const { data, error } = await supabase.from("collections").insert({
    sponsor_id: params.sponsor_id, amount: params.amount,
    fixed_portion: params.fixed, extra_portion: params.extra, sadaqat_portion: params.sadaqat,
    month_year: params.month, received_by_operator_id: params.operator || null,
    payment_method: params.method, ocr_raw: params.ocr_raw || null,
    status: "confirmed", notes: params.notes || null,
    advance_type: advType, advance_months: advMonths,
  }).select("id").single();

  if (error) throw error;

  if (params.sadaqat > 0 && data) {
    await supabase.from("sadaqat_pool").insert({
      transaction_type: "inflow", amount: params.sadaqat, source_type: "collection_extra",
      source_collection_id: data.id, donor_name: params.sponsor_name, month_year: params.month,
    });
  }

  if (advMonths > 1 && data) {
    const [yearStr, monthStr] = params.month.split("-");
    let year = parseInt(yearStr), month = parseInt(monthStr);
    const pum = month + advMonths - 1;
    const puy = year + Math.floor((pum - 1) / 12);
    const pumf = ((pum - 1) % 12) + 1;
    const paidUntil = new Date(puy, pumf, 0).toISOString().split("T")[0];
    const { data: sponsorships } = await supabase.from("sponsorships")
      .select("case_id").eq("sponsor_id", params.sponsor_id).eq("status", "active");
    await supabase.from("advance_payments").insert({
      sponsor_id: params.sponsor_id, case_id: sponsorships?.[0]?.case_id || null,
      payment_type: advType === "annual" ? "annual" : advType === "semi_annual" ? "semi_annual" : "advance",
      amount: params.amount, months_covered: advMonths,
      start_month: params.month, paid_until: paidUntil, collection_id: data.id, status: "active",
    });
    for (let i = 1; i < advMonths; i++) {
      month++;
      if (month > 12) { month = 1; year++; }
      const futureMonth = `${year}-${String(month).padStart(2, "0")}`;
      await supabase.from("collections").insert({
        sponsor_id: params.sponsor_id, amount: params.fixed / advMonths,
        fixed_portion: params.fixed / advMonths, extra_portion: 0, sadaqat_portion: 0,
        month_year: futureMonth, received_by_operator_id: params.operator || null,
        payment_method: params.method, status: "confirmed",
        notes: `دفعة مقدمة من شهر ${params.month}`,
        advance_type: advType, advance_months: 0,
      });
    }
  }
  return data;
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function CollectPage() {
  const [sponsors,  setSponsors]  = useState<Sponsor[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [mode,      setMode]      = useState<"choose" | "screenshot" | "manual">("choose");

  useEffect(() => {
    (async () => {
      const [spRes, opRes] = await Promise.all([
        supabase.from("sponsors").select("id, legacy_id, name, phone").eq("is_active", true).order("name"),
        supabase.from("operators").select("*").neq("name", "شريف"),
      ]);
      setSponsors(spRes.data || []);
      setOperators(opRes.data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cream)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--green)", marginBottom: 8 }}>خدمة</div>
        <div style={{ color: "var(--text-3)", fontSize: "0.875rem" }}>جاري التحميل...</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <header className="app-header">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ gap: 4 }}>
          <ArrowRight size={18} />
        </Link>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div className="app-logo" style={{ fontSize: "1.1rem" }}>تسجيل تحصيل</div>
          <span className="app-logo-sub">تسجيل دفعة جديدة</span>
        </div>
      </header>

      <main style={{ maxWidth: 600, margin: "0 auto", padding: "1.5rem 1rem" }}>
        {mode === "choose"     && <ChooseMode    onScreenshot={() => setMode("screenshot")} onManual={() => setMode("manual")} />}
        {mode === "screenshot" && <ScreenshotMode sponsors={sponsors} operators={operators} onBack={() => setMode("choose")} />}
        {mode === "manual"     && <ManualMode     sponsors={sponsors} operators={operators} onBack={() => setMode("choose")} />}
      </main>
    </div>
  );
}

// ─── Choose Mode ───────────────────────────────────────────────────────────
function ChooseMode({ onScreenshot, onManual }: { onScreenshot: () => void; onManual: () => void }) {
  return (
    <div>
      <h2 style={{ marginBottom: 20, fontSize: "1rem", color: "var(--text-1)" }}>كيف تريد تسجيل الدفعة؟</h2>
      <div style={{ display: "grid", gap: 12 }}>
        {[
          { icon: "📸", title: "رفع سكرين شوت", desc: "ارفع صورة إنستاباي — النظام يقرأ المبلغ والمرسل تلقائياً، تراجع قبل الحفظ", onClick: onScreenshot, color: "var(--indigo)" },
          { icon: "✏️", title: "إدخال يدوي",     desc: "اختر الكفيل وأدخل المبلغ يدوياً",                                              onClick: onManual,     color: "var(--green)"  },
        ].map(opt => (
          <button key={opt.title} onClick={opt.onClick} className="card" style={{ textAlign: "right", cursor: "pointer", transition: "box-shadow 0.15s", width: "100%", background: "none" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div style={{ fontSize: "2rem", flexShrink: 0 }}>{opt.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-1)", marginBottom: 6 }}>{opt.title}</div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-3)", lineHeight: 1.5 }}>{opt.desc}</div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Success Screen ────────────────────────────────────────────────────────
function SuccessScreen({ amount, name, onBack }: { amount: string; name: string; onBack: () => void }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
      <CheckCircle size={52} style={{ color: "var(--green)", margin: "0 auto 16px" }} />
      <h2 style={{ fontSize: "1.25rem", fontWeight: 800, marginBottom: 8 }}>تم الحفظ بنجاح!</h2>
      <p style={{ color: "var(--text-3)", marginBottom: 28 }}>تم تسجيل {fmt(Number(amount))} ج.م من {name}</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        <button onClick={onBack} className="btn btn-primary">تسجيل دفعة أخرى</button>
        <Link href="/" className="btn btn-secondary">الرئيسية</Link>
      </div>
    </div>
  );
}

// ─── Field Input ───────────────────────────────────────────────────────────
function FieldInput({ label, value, onChange, type = "text", dir, color }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; dir?: string; color?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} dir={dir}
        className="input-field" style={{ color: color || "var(--text-1)" }} />
    </div>
  );
}

// ─── Sponsor Picker ────────────────────────────────────────────────────────
function SponsorPicker({ sponsors, selectedId, onSelect }: { sponsors: Sponsor[]; selectedId: string; onSelect: (s: Sponsor) => void }) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search) return [];
    return sponsors.filter(s => s.name.includes(search)).slice(0, 15);
  }, [sponsors, search]);

  if (selectedId) {
    const s = sponsors.find(sp => sp.id === selectedId);
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem 1rem", background: "var(--green-light)", borderRadius: "var(--radius)", border: "1.5px solid var(--green)" }}>
        <div>
          <div style={{ fontWeight: 700, color: "var(--text-1)" }}>{s?.name}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>#{s?.legacy_id}</div>
        </div>
        <button onClick={() => onSelect({ id: "", legacy_id: 0, name: "", phone: null })}
          style={{ fontSize: "0.8rem", color: "var(--text-3)", background: "none", border: "none", cursor: "pointer" }}>تغيير</button>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
        <input placeholder="ابحث عن اسم الكفيل..." value={search} onChange={e => setSearch(e.target.value)}
          autoFocus className="input-field" style={{ paddingRight: 36 }} />
      </div>
      {filtered.length > 0 && (
        <div className="search-dropdown">
          {filtered.map(s => (
            <button key={s.id} onClick={() => onSelect(s)} style={{ width: "100%", padding: "10px 14px", border: "none", borderBottom: "1px solid var(--border-light)", background: "var(--surface)", cursor: "pointer", textAlign: "right", fontSize: "0.875rem" }}>
              <span style={{ fontWeight: 600, color: "var(--text-1)" }}>{s.name}</span>
              <span style={{ color: "var(--text-3)", marginRight: 8, fontSize: "0.78rem" }}>#{s.legacy_id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Advance Panel ─────────────────────────────────────────────────────────
function AdvancePanel({ advanceType, setAdvanceType, advanceMonths, setAdvanceMonths, monthYear }: {
  advanceType: string; setAdvanceType: (v: string) => void;
  advanceMonths: string; setAdvanceMonths: (v: string) => void;
  monthYear: string;
}) {
  return (
    <div style={{ background: "#FAF5FF", border: "1px solid #E9D5FF", borderRadius: "var(--radius)", padding: "0.875rem" }}>
      <label className="field-label" style={{ color: "#7C3AED", marginBottom: 8 }}>نوع الدفعة</label>
      <select value={advanceType} onChange={e => {
        setAdvanceType(e.target.value);
        if      (e.target.value === "annual")     setAdvanceMonths("12");
        else if (e.target.value === "semi_annual") setAdvanceMonths("6");
        else                                       setAdvanceMonths("1");
      }} className="select-field" style={{ marginBottom: 8, border: "1px solid #E9D5FF" }}>
        <option value="monthly">شهري (عادي)</option>
        <option value="annual">سنوي (١٢ شهر)</option>
        <option value="semi_annual">نصف سنوي (٦ شهور)</option>
        <option value="months_in_advance">شهور مقدمة (حدد العدد)</option>
      </select>
      {advanceType === "months_in_advance" && (
        <input type="number" min="2" max="24" value={advanceMonths} onChange={e => setAdvanceMonths(e.target.value)}
          className="input-field" dir="ltr" style={{ border: "1px solid #E9D5FF", fontWeight: 700 }} />
      )}
      {Number(advanceMonths) > 1 && (
        <div style={{ marginTop: 8, padding: "8px 10px", background: "#F5F3FF", borderRadius: 8, fontSize: "0.78rem", color: "#6D28D9" }}>
          💡 سيتم تسجيل الكفيل كـ«مدفوع» لمدة <strong>{advanceMonths} شهر</strong> بدءاً من {monthYear}
        </div>
      )}
    </div>
  );
}

// ─── Screenshot Mode ───────────────────────────────────────────────────────
function ScreenshotMode({ sponsors, operators, onBack }: { sponsors: Sponsor[]; operators: Operator[]; onBack: () => void }) {
  const [file,        setFile]        = useState<File | null>(null);
  const [preview,     setPreview]     = useState<string | null>(null);
  const [extracting,  setExtracting]  = useState(false);
  const [extracted,   setExtracted]   = useState<ExtractedData | null>(null);
  const [error,       setError]       = useState<string | null>(null);

  const [senderName,      setSenderName]      = useState("");
  const [amount,          setAmount]          = useState("");
  const [bank,            setBank]            = useState("");
  const [reference,       setReference]       = useState("");
  const [selectedSponsor, setSelectedSponsor] = useState("");
  const [obligation,      setObligation]      = useState(0);
  const [fixedPortion,    setFixedPortion]    = useState("");
  const [extraPortion,    setExtraPortion]    = useState("0");
  const [sadaqatPortion,  setSadaqatPortion]  = useState("0");
  const [monthYear,       setMonthYear]       = useState(currentMonth());
  const [receivedBy,      setReceivedBy]      = useState("");
  const [advanceType,     setAdvanceType]     = useState("monthly");
  const [advanceMonths,   setAdvanceMonths]   = useState("1");
  const [notes,           setNotes]           = useState("");
  const [saving,          setSaving]          = useState(false);
  const [done,            setDone]            = useState(false);

  const monthOptions = useMemo(genMonthOptions, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setPreview(URL.createObjectURL(f)); setError(null); setExtracted(null);
  }

  async function extract() {
    if (!file) return;
    setExtracting(true); setError(null);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.readAsDataURL(file);
      });
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: file.type || "image/png", data: base64 } },
            { type: "text", text: `This is an Egyptian Instapay payment screenshot. Extract these fields as JSON only (no markdown, no backticks): {"sender_name":"","amount":0,"bank":"","recipient":"","reference":"","date":""}. If not visible use empty string or 0.` }
          ]}]
        })
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      const matched = sponsors.find(s =>
        s.name === parsed.sender_name?.trim() ||
        s.name.includes(parsed.sender_name?.trim()) ||
        parsed.sender_name?.trim()?.includes(s.name)
      );
      setExtracted({ ...parsed, amount: Number(parsed.amount) || 0, matched_sponsor: matched || null, confidence: matched ? 0.9 : 0.5 });
      setSenderName(parsed.sender_name || "");
      setAmount(String(Number(parsed.amount) || 0));
      setBank(parsed.bank || "");
      setReference(parsed.reference || "");
      setFixedPortion(String(Number(parsed.amount) || 0));
      if (matched) setSelectedSponsor(matched.id);
    } catch (err: any) {
      setError("فشل في قراءة الصورة: " + (err.message || "unknown"));
    }
    setExtracting(false);
  }

  useEffect(() => {
    if (!selectedSponsor) return;
    supabase.from("sponsorships").select("fixed_amount").eq("sponsor_id", selectedSponsor).eq("status", "active").then(({ data }) => {
      const total = (data || []).reduce((s, r) => s + Number(r.fixed_amount), 0);
      setObligation(total);
      const amt = Number(amount) || 0;
      if (amt <= total) { setFixedPortion(amount); setSadaqatPortion("0"); }
      else { setFixedPortion(String(total)); setSadaqatPortion(String(amt - total)); }
    });
  }, [selectedSponsor]);

  async function save() {
    setSaving(true);
    try {
      const sponsor = sponsors.find(s => s.id === selectedSponsor);
      await saveCollection({ sponsor_id: selectedSponsor, amount: Number(amount), fixed: Number(fixedPortion), extra: Number(extraPortion), sadaqat: Number(sadaqatPortion), month: monthYear, operator: receivedBy, method: "instapay", notes, ocr_raw: extracted, sponsor_name: sponsor?.name || senderName, advance_type: advanceType, advance_months: Number(advanceMonths) });
      setDone(true);
    } catch (err: any) { alert("خطأ: " + err.message); }
    setSaving(false);
  }

  if (done) return <SuccessScreen amount={amount} name={sponsors.find(s => s.id === selectedSponsor)?.name || senderName} onBack={onBack} />;

  return (
    <div>
      <button onClick={onBack} className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
        <ArrowRight size={15} /> رجوع
      </button>
      <h2 style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
        <Camera size={20} style={{ color: "var(--indigo)" }} /> رفع سكرين شوت إنستاباي
      </h2>

      {!preview && (
        <label style={{ display: "block", cursor: "pointer" }}>
          <div style={{ border: "2px dashed var(--border)", borderRadius: "var(--radius-lg)", padding: "3rem 2rem", textAlign: "center", background: "var(--surface)", transition: "border-color 0.2s" }}
            onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = "var(--indigo)"; }}
            onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}>
            <Camera size={40} style={{ color: "var(--text-3)", margin: "0 auto 12px" }} />
            <div style={{ fontWeight: 700, marginBottom: 4 }}>اضغط هنا لرفع الصورة</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>PNG, JPG — سكرين شوت إنستاباي</div>
          </div>
          <input type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
        </label>
      )}

      {preview && !extracted && (
        <div>
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12 }}>
            <img src={preview} alt="screenshot" style={{ width: "100%", maxHeight: 400, objectFit: "contain" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setFile(null); setPreview(null); }} className="btn btn-secondary" style={{ flex: 1 }}>تغيير</button>
            <button onClick={extract} disabled={extracting} className="btn btn-primary" style={{ flex: 2 }}>
              {extracting ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> جاري القراءة...</> : "🔍 اقرأ البيانات"}
            </button>
          </div>
          {error && <div style={{ marginTop: 12, padding: "0.75rem 1rem", background: "var(--red-light)", border: "1px solid #F5C2BF", borderRadius: "var(--radius)", fontSize: "0.82rem", color: "var(--red)" }}>{error}</div>}
        </div>
      )}

      {extracted && (
        <div>
          {preview && <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 12, maxHeight: 120 }}><img src={preview} alt="ss" style={{ width: "100%", maxHeight: 120, objectFit: "contain" }} /></div>}
          <div style={{ padding: "0.75rem 1rem", background: "var(--green-light)", border: "1px solid #9EE0BB", borderRadius: "var(--radius)", marginBottom: 16, fontSize: "0.82rem", color: "var(--green)", fontWeight: 600 }}>
            ✅ تم استخراج البيانات — راجع وعدّل قبل الحفظ
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginBottom: 16, fontSize: "0.9rem" }}>البيانات المستخرجة</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <FieldInput label="اسم المرسل" value={senderName} onChange={setSenderName} />
              <FieldInput label="المبلغ" value={amount} onChange={setAmount} type="number" dir="ltr" color="var(--gold)" />
              <FieldInput label="البنك" value={bank} onChange={setBank} />
              <FieldInput label="رقم المرجع" value={reference} onChange={setReference} dir="ltr" />
            </div>
            <div>
              <label className="field-label">الكفيل</label>
              {extracted.matched_sponsor && !selectedSponsor && (
                <div style={{ padding: "0.75rem", background: "var(--green-light)", border: "1px solid #9EE0BB", borderRadius: "var(--radius)", marginBottom: 8, cursor: "pointer" }}
                  onClick={() => setSelectedSponsor(extracted.matched_sponsor!.id)}>
                  <span style={{ fontWeight: 700, color: "var(--green)" }}>✓ {extracted.matched_sponsor.name}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--green)", marginRight: 8 }}>اضغط للتأكيد</span>
                </div>
              )}
              <SponsorPicker sponsors={sponsors} selectedId={selectedSponsor} onSelect={s => setSelectedSponsor(s.id)} />
              {obligation > 0 && <div style={{ fontSize: "0.78rem", color: "var(--text-3)", marginTop: 6 }}>الالتزام الشهري: {fmt(obligation)} ج.م</div>}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ marginBottom: 14, fontSize: "0.9rem" }}>توزيع المبلغ</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              <FieldInput label="كفالات" value={fixedPortion} onChange={setFixedPortion} type="number" dir="ltr" />
              <FieldInput label="زيادات"  value={extraPortion}   onChange={setExtraPortion}   type="number" dir="ltr" color="var(--amber)" />
              <FieldInput label="صدقات"  value={sadaqatPortion} onChange={setSadaqatPortion} type="number" dir="ltr" color="var(--green)" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div>
                <label className="field-label">الشهر</label>
                <select value={monthYear} onChange={e => setMonthYear(e.target.value)} className="select-field">
                  {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">استلمها</label>
                <select value={receivedBy} onChange={e => setReceivedBy(e.target.value)} className="select-field">
                  <option value="">—</option>
                  {operators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                </select>
              </div>
            </div>
            <AdvancePanel advanceType={advanceType} setAdvanceType={setAdvanceType} advanceMonths={advanceMonths} setAdvanceMonths={setAdvanceMonths} monthYear={monthYear} />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onBack} className="btn btn-secondary" style={{ flex: 1 }}>إلغاء</button>
            <button onClick={save} disabled={saving || !selectedSponsor || !amount} className="btn btn-primary" style={{ flex: 2 }}>
              {saving ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> جاري الحفظ...</> : "✓ حفظ التحصيل"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Manual Mode ───────────────────────────────────────────────────────────
function ManualMode({ sponsors, operators, onBack }: { sponsors: Sponsor[]; operators: Operator[]; onBack: () => void }) {
  const [selectedSponsor, setSelectedSponsor] = useState("");
  const [obligation,      setObligation]      = useState(0);
  const [caseList,        setCaseList]        = useState<any[]>([]);
  const [amount,          setAmount]          = useState("");
  const [fixedPortion,    setFixedPortion]    = useState("");
  const [extraPortion,    setExtraPortion]    = useState("0");
  const [sadaqatPortion,  setSadaqatPortion]  = useState("0");
  const [monthYear,       setMonthYear]       = useState(currentMonth());
  const [receivedBy,      setReceivedBy]      = useState("");
  const [paymentMethod,   setPaymentMethod]   = useState("instapay");
  const [advanceType,     setAdvanceType]     = useState("monthly");
  const [advanceMonths,   setAdvanceMonths]   = useState("1");
  const [notes,           setNotes]           = useState("");
  const [saving,          setSaving]          = useState(false);
  const [done,            setDone]            = useState(false);

  const monthOptions = useMemo(genMonthOptions, []);

  useEffect(() => {
    if (!selectedSponsor) return;
    supabase.from("sponsorships").select("fixed_amount, cases(child_name, areas(name))")
      .eq("sponsor_id", selectedSponsor).eq("status", "active").then(({ data }) => {
        const cases = (data || []).map((s: any) => ({
          child_name: s.cases?.child_name || "—", area_name: s.cases?.areas?.name || "—", fixed_amount: Number(s.fixed_amount),
        }));
        const total = cases.reduce((s: number, c: any) => s + c.fixed_amount, 0);
        setObligation(total); setCaseList(cases);
        setAmount(String(total)); setFixedPortion(String(total));
      });
  }, [selectedSponsor]);

  function handleAmountChange(val: string) {
    setAmount(val);
    const num = Number(val) || 0;
    if (num <= obligation) { setFixedPortion(val); setExtraPortion("0"); setSadaqatPortion("0"); }
    else { setFixedPortion(String(obligation)); setSadaqatPortion(String(num - obligation)); setExtraPortion("0"); }
  }

  async function save() {
    setSaving(true);
    try {
      const sponsor = sponsors.find(s => s.id === selectedSponsor);
      await saveCollection({ sponsor_id: selectedSponsor, amount: Number(amount), fixed: Number(fixedPortion), extra: Number(extraPortion), sadaqat: Number(sadaqatPortion), month: monthYear, operator: receivedBy, method: paymentMethod, notes, sponsor_name: sponsor?.name || "", advance_type: advanceType, advance_months: Number(advanceMonths) });
      setDone(true);
    } catch (err: any) { alert("خطأ: " + err.message); }
    setSaving(false);
  }

  const selectedSponsorName = sponsors.find(s => s.id === selectedSponsor)?.name || "";
  if (done) return <SuccessScreen amount={amount} name={selectedSponsorName} onBack={onBack} />;

  return (
    <div>
      <button onClick={onBack} className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
        <ArrowRight size={15} /> رجوع
      </button>
      <h2 style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
        <PenLine size={20} style={{ color: "var(--green)" }} /> إدخال يدوي
      </h2>

      {/* Step 1: Sponsor */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: "0.9rem", marginBottom: 12 }}>١. اختر الكفيل</h3>
        <SponsorPicker sponsors={sponsors} selectedId={selectedSponsor}
          onSelect={s => { if (s.id) setSelectedSponsor(s.id); else { setSelectedSponsor(""); setCaseList([]); setObligation(0); } }} />
        {caseList.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-3)", marginBottom: 6 }}>
              الحالات ({caseList.length}):
            </div>
            {caseList.map((c: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "var(--cream)", borderRadius: "var(--radius-sm)", marginBottom: 4, fontSize: "0.82rem" }}>
                <span style={{ color: "var(--text-2)" }}>{c.child_name} <span style={{ color: "var(--text-3)" }}>📍 {c.area_name}</span></span>
                <span style={{ fontWeight: 700, color: "var(--indigo)" }}>{fmt(c.fixed_amount)} ج.م</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--border)", marginTop: 4, fontSize: "0.875rem" }}>
              <span style={{ fontWeight: 600, color: "var(--text-2)" }}>الالتزام الشهري</span>
              <span style={{ fontWeight: 800, color: "var(--text-1)" }}>{fmt(obligation)} ج.م</span>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Amount */}
      {selectedSponsor && (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: "0.9rem", marginBottom: 14 }}>٢. المبلغ</h3>
            <div style={{ marginBottom: 12 }}>
              <label className="field-label">المبلغ الإجمالي</label>
              <input type="number" value={amount} onChange={e => handleAmountChange(e.target.value)}
                className="input-field" dir="ltr" placeholder="0"
                style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--gold)" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              <FieldInput label="كفالات" value={fixedPortion} onChange={setFixedPortion} type="number" dir="ltr" />
              <FieldInput label="زيادات"  value={extraPortion}   onChange={setExtraPortion}   type="number" dir="ltr" color="var(--amber)" />
              <FieldInput label="صدقات"  value={sadaqatPortion} onChange={setSadaqatPortion} type="number" dir="ltr" color="var(--green)" />
            </div>
            {Number(amount) > 0 && Number(amount) !== Number(fixedPortion) + Number(extraPortion) + Number(sadaqatPortion) && (
              <div style={{ padding: "0.6rem 0.875rem", background: "var(--red-light)", border: "1px solid #F5C2BF", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", color: "var(--red)", marginBottom: 12 }}>
                ⚠️ المجموع لا يتطابق
              </div>
            )}
            <AdvancePanel advanceType={advanceType} setAdvanceType={setAdvanceType} advanceMonths={advanceMonths} setAdvanceMonths={setAdvanceMonths} monthYear={monthYear} />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: "0.9rem", marginBottom: 14 }}>٣. تفاصيل الدفعة</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div>
                <label className="field-label">الشهر</label>
                <select value={monthYear} onChange={e => setMonthYear(e.target.value)} className="select-field">
                  {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">طريقة الدفع</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="select-field">
                  <option value="instapay">إنستاباي</option>
                  <option value="cash">كاش</option>
                  <option value="bank_transfer">تحويل بنكي</option>
                </select>
              </div>
              <div>
                <label className="field-label">استلمها</label>
                <select value={receivedBy} onChange={e => setReceivedBy(e.target.value)} className="select-field">
                  <option value="">—</option>
                  {operators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                </select>
              </div>
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات اختيارية..."
              className="textarea-field" style={{ height: 56 }} />
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onBack} className="btn btn-secondary" style={{ flex: 1 }}>إلغاء</button>
            <button onClick={save} disabled={saving || !amount || Number(amount) <= 0} className="btn btn-primary" style={{ flex: 2 }}>
              {saving ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> جاري الحفظ...</> : "✓ حفظ"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
