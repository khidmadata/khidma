"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowRight, UserPlus, Heart, CheckCircle, Loader2 } from "lucide-react";
import Link from "next/link";

type Area     = { id: string; name: string };
type Operator = { id: string; name: string };
type Sponsor  = { id: string; legacy_id: number; name: string };

export default function RegisterPage() {
  const [tab,       setTab]       = useState<"sponsor" | "case">("sponsor");
  const [areas,     setAreas]     = useState<Area[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [sponsors,  setSponsors]  = useState<Sponsor[]>([]);

  useEffect(() => {
    (async () => {
      const [a, o, s] = await Promise.all([
        supabase.from("areas").select("*"),
        supabase.from("operators").select("*").neq("name", "شريف"),
        supabase.from("sponsors").select("id, legacy_id, name").eq("is_active", true).order("name"),
      ]);
      setAreas(a.data || []);
      setOperators(o.data || []);
      setSponsors(s.data || []);
    })();
  }, []);

  const TABS = [
    { id: "sponsor" as const, label: "كفيل جديد",  Icon: UserPlus, desc: "تسجيل كفيل" },
    { id: "case"    as const, label: "كفالة جديدة", Icon: Heart,    desc: "ربط حالة"   },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <header className="app-header">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ gap: 4 }}>
          <ArrowRight size={18} />
        </Link>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div className="app-logo" style={{ fontSize: "1.1rem" }}>تسجيل جديد</div>
          <span className="app-logo-sub">إضافة كفيل أو كفالة جديدة</span>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem" }}>
        {/* Tab selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="btn" style={{
              flex: 1, flexDirection: "column", gap: 4, height: "auto", padding: "0.875rem 0.5rem",
              background: tab === t.id ? "var(--green)" : "var(--surface)",
              color: tab === t.id ? "white" : "var(--text-2)",
              border: tab === t.id ? "none" : "1.5px solid var(--border)",
              fontSize: "0.78rem",
            }}>
              <t.Icon size={18} />
              <span style={{ fontWeight: 700 }}>{t.label}</span>
            </button>
          ))}
        </div>

        {tab === "sponsor" && <NewSponsorForm operators={operators} sponsors={sponsors} onSaved={s => setSponsors(prev => [...prev, s])} />}
        {tab === "case"    && <NewCaseForm    areas={areas} sponsors={sponsors} />}
      </main>
    </div>
  );
}

// ─── Shared Components ─────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, dir, type, multiline }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; dir?: string; type?: string; multiline?: boolean;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="textarea-field" />
        : <input type={type || "text"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} dir={dir} className="input-field" />
      }
    </div>
  );
}

function SuccessMsg({ msg, onAgain }: { msg: string; onAgain: () => void }) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "3rem 2rem" }}>
      <CheckCircle size={52} style={{ color: "var(--green)", margin: "0 auto 16px" }} />
      <h2 style={{ marginBottom: 8 }}>{msg}</h2>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
        <button onClick={onAgain} className="btn btn-primary">تسجيل آخر</button>
        <Link href="/" className="btn btn-secondary">الرئيسية</Link>
      </div>
    </div>
  );
}

// ─── New Sponsor ───────────────────────────────────────────────────────────
function NewSponsorForm({ operators, sponsors, onSaved }: {
  operators: Operator[]; sponsors: Sponsor[]; onSaved: (s: Sponsor) => void;
}) {
  const [name,        setName]        = useState("");
  const [phone,       setPhone]       = useState("");
  const [ipnAddress,  setIpnAddress]  = useState("");
  const [responsible, setResponsible] = useState("");
  const [paidThrough, setPaidThrough] = useState("");
  const [ptSearch,    setPtSearch]    = useState("");
  const [showPtDrop,  setShowPtDrop]  = useState(false);
  const [paymentFreq, setPaymentFreq] = useState("monthly");
  const [notes,       setNotes]       = useState("");
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);

  const filteredPt = sponsors.filter(s => s.name.includes(ptSearch)).slice(0, 10);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    const maxLegacy = sponsors.reduce((max, s) => Math.max(max, s.legacy_id), 0);
    const { data, error } = await supabase.from("sponsors").insert({
      legacy_id: maxLegacy + 1, name: name.trim(), phone: phone || null,
      ipn_address: ipnAddress || null,
      responsible_operator_id: responsible || null, paid_through_sponsor_id: paidThrough || null,
      payment_frequency: paymentFreq, is_active: true, notes: notes || null,
    }).select("id, legacy_id, name").single();
    if (error) { alert("خطأ: " + error.message); setSaving(false); return; }
    if (data) onSaved(data);
    setSaving(false); setSaved(true);
  }

  function reset() {
    setName(""); setPhone(""); setIpnAddress(""); setResponsible(""); setPaidThrough(""); setPtSearch("");
    setPaymentFreq("monthly"); setNotes(""); setSaved(false);
  }

  if (saved) return <SuccessMsg msg={`تم تسجيل الكفيل: ${name}`} onAgain={reset} />;

  return (
    <div className="card">
      <h3 style={{ marginBottom: 20 }}>تسجيل كفيل جديد</h3>
      <div style={{ display: "grid", gap: 14 }}>
        <Field label="اسم الكفيل *" value={name} onChange={setName} placeholder="الاسم بالكامل" />
        <Field label="رقم الموبايل" value={phone} onChange={setPhone} placeholder="01xxxxxxxxx" dir="ltr" />
        <Field label="عنوان InstaPay (IPN)" value={ipnAddress} onChange={setIpnAddress} placeholder="الاسم أو الرقم المسجّل في إنستاباي" />

        <div>
          <label className="field-label">المسئول</label>
          <select value={responsible} onChange={e => setResponsible(e.target.value)} className="select-field">
            <option value="">اختر...</option>
            {operators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
          </select>
        </div>

        <div>
          <label className="field-label">يدفع من خلال (اختياري)</label>
          <input value={ptSearch} onChange={e => { setPtSearch(e.target.value); setShowPtDrop(true); setPaidThrough(""); }}
            onFocus={() => setShowPtDrop(true)} placeholder="ابحث عن اسم الكفيل الذي يجمع..."
            className="input-field" />
          {showPtDrop && ptSearch && filteredPt.length > 0 && (
            <div className="search-dropdown">
              {filteredPt.map(s => (
                <button key={s.id} onClick={() => { setPaidThrough(s.id); setPtSearch(s.name); setShowPtDrop(false); }}
                  style={{ width: "100%", padding: "10px 14px", border: "none", borderBottom: "1px solid var(--border-light)", background: "var(--surface)", cursor: "pointer", textAlign: "right", fontSize: "0.875rem" }}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="field-label">نظام الدفع</label>
          <select value={paymentFreq} onChange={e => setPaymentFreq(e.target.value)} className="select-field">
            <option value="monthly">شهري</option>
            <option value="quarterly">ربع سنوي</option>
            <option value="semi_annual">نصف سنوي</option>
            <option value="annual">سنوي</option>
          </select>
        </div>

        <Field label="ملاحظات" value={notes} onChange={setNotes} placeholder="اختياري..." />

        <button onClick={save} disabled={saving || !name.trim()} className="btn btn-primary btn-lg">
          {saving
            ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> جاري الحفظ...</>
            : "✓ تسجيل الكفيل"}
        </button>
      </div>
    </div>
  );
}

// ─── New Case ──────────────────────────────────────────────────────────────
function NewCaseForm({ areas, sponsors }: { areas: Area[]; sponsors: Sponsor[] }) {
  const [childName,      setChildName]      = useState("");
  const [guardian,       setGuardian]       = useState("");
  const [areaId,         setAreaId]         = useState("");
  const [caseType,       setCaseType]       = useState("orphan");
  const [needsLevel,     setNeedsLevel]     = useState("MEDIUM");
  const [isMedical,      setIsMedical]      = useState(false);
  const [hasStudents,    setHasStudents]    = useState(false);
  const [sponsorId,      setSponsorId]      = useState("");
  const [sponsorSearch,  setSponsorSearch]  = useState("");
  const [showSpDrop,     setShowSpDrop]     = useState(false);
  const [fixedAmount,    setFixedAmount]    = useState("");
  const [schoolYear,     setSchoolYear]     = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);

  const filteredSp = sponsors.filter(s => s.name.includes(sponsorSearch)).slice(0, 15);

  async function save() {
    if (!childName.trim() || !areaId) return;
    setSaving(true);
    const { data: caseData, error: caseErr } = await supabase.from("cases").insert({
      child_name: childName.trim(), guardian_name: guardian || null, area_id: areaId,
      case_type: caseType, needs_level: needsLevel, is_medical_case: isMedical,
      has_students: hasStudents, school_year: schoolYear || null,
      additional_info: additionalInfo || null, status: "active",
    }).select("id").single();
    if (caseErr) { alert("خطأ: " + caseErr.message); setSaving(false); return; }
    if (sponsorId && fixedAmount && caseData) {
      const { error: spErr } = await supabase.from("sponsorships").insert({
        sponsor_id: sponsorId, case_id: caseData.id, fixed_amount: Number(fixedAmount), status: "active",
      });
      if (spErr) alert("تم حفظ الحالة لكن فشل ربط الكفيل: " + spErr.message);
    }
    setSaving(false); setSaved(true);
  }

  function reset() {
    setChildName(""); setGuardian(""); setAreaId(""); setCaseType("orphan"); setNeedsLevel("MEDIUM");
    setIsMedical(false); setHasStudents(false); setSponsorId(""); setSponsorSearch("");
    setFixedAmount(""); setSchoolYear(""); setAdditionalInfo(""); setSaved(false);
  }

  if (saved) return <SuccessMsg msg={`تم تسجيل كفالة: ${childName}`} onAgain={reset} />;

  return (
    <div className="card">
      <h3 style={{ marginBottom: 20 }}>تسجيل كفالة جديدة</h3>
      <div style={{ display: "grid", gap: 14 }}>
        <Field label="اسم الطفل *" value={childName} onChange={setChildName} placeholder="اسم الطفل" />
        <Field label="اسم العائل"  value={guardian}  onChange={setGuardian}  placeholder="اسم ولي الأمر" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="field-label">الموقع *</label>
            <select value={areaId} onChange={e => setAreaId(e.target.value)} className="select-field">
              <option value="">اختر...</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">مستوى الاحتياج</label>
            <select value={needsLevel} onChange={e => setNeedsLevel(e.target.value)} className="select-field">
              <option value="HIGH">عالي</option>
              <option value="MEDIUM">متوسط</option>
              <option value="LOW">منخفض</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20 }}>
          {[
            { label: "حالة مرضية", state: isMedical, set: setIsMedical },
            { label: "يوجد طلاب",  state: hasStudents, set: setHasStudents },
          ].map(({ label, state, set }) => (
            <label key={label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.875rem", color: "var(--text-2)", cursor: "pointer" }}>
              <input type="checkbox" checked={state} onChange={e => set(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "var(--green)" }} />
              {label}
            </label>
          ))}
        </div>

        <Field label="السنة الدراسية" value={schoolYear} onChange={setSchoolYear} placeholder="مثل: ثالثة إعدادي" />

        {/* Sponsor link */}
        <div style={{ borderTop: "1px solid var(--border-light)", paddingTop: 14 }}>
          <label className="field-label">ربط بكفيل (اختياري)</label>
          <input value={sponsorSearch} onChange={e => { setSponsorSearch(e.target.value); setShowSpDrop(true); setSponsorId(""); }}
            onFocus={() => setShowSpDrop(true)} placeholder="ابحث عن الكفيل..." className="input-field" />
          {showSpDrop && sponsorSearch && filteredSp.length > 0 && (
            <div className="search-dropdown">
              {filteredSp.map(s => (
                <button key={s.id} onClick={() => { setSponsorId(s.id); setSponsorSearch(s.name); setShowSpDrop(false); }}
                  style={{ width: "100%", padding: "10px 14px", border: "none", borderBottom: "1px solid var(--border-light)", background: "var(--surface)", cursor: "pointer", textAlign: "right", fontSize: "0.875rem" }}>
                  {s.name}
                </button>
              ))}
            </div>
          )}
          {sponsorId && (
            <div style={{ marginTop: 10 }}>
              <Field label="المبلغ الشهري الثابت" value={fixedAmount} onChange={setFixedAmount} placeholder="0" dir="ltr" type="number" />
            </div>
          )}
        </div>

        <Field label="بيانات إضافية" value={additionalInfo} onChange={setAdditionalInfo} placeholder="اختياري..." />

        <button onClick={save} disabled={saving || !childName.trim() || !areaId} className="btn btn-primary btn-lg"
          style={{ background: "var(--green)" }}>
          {saving
            ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> جاري الحفظ...</>
            : "✓ تسجيل الكفالة"}
        </button>
      </div>
    </div>
  );
}

