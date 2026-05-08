"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { LayoutDashboard, MapPin, Plus, Trash2, Users, DollarSign } from "lucide-react";

type Area = {
  id: string;
  name: string;
  deputy_name: string | null;
  deputy_phone: string | null;
  deputy_notes: string | null;
};

type AreaStats = {
  cases: number;
  fixed: number;
};

const fmt = (n: number) => n.toLocaleString("en");

export default function AreasPage() {
  const [areas,   setAreas]   = useState<Area[]>([]);
  const [stats,   setStats]   = useState<Record<string, AreaStats>>({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [name,        setName]        = useState("");
  const [deputyName,  setDeputyName]  = useState("");
  const [deputyPhone, setDeputyPhone] = useState("");
  const [deputyNotes, setDeputyNotes] = useState("");
  const [showForm,    setShowForm]    = useState(false);

  async function load() {
    setLoading(true);
    const [arRes, shRes] = await Promise.all([
      supabase.from("areas").select("*").order("name"),
      supabase.from("sponsorships")
        .select("case_id, fixed_amount, cases(area_id)")
        .eq("status", "active"),
    ]);
    const areas: Area[] = arRes.data || [];
    const sps: any[]    = shRes.data || [];

    // Compute stats per area
    const st: Record<string, AreaStats> = {};
    areas.forEach(a => { st[a.id] = { cases: 0, fixed: 0 }; });
    const seen = new Set<string>();
    sps.forEach(sp => {
      const aId = sp.cases?.area_id;
      if (!aId || !st[aId]) return;
      if (!seen.has(sp.case_id)) { seen.add(sp.case_id); st[aId].cases++; }
      st[aId].fixed += Number(sp.fixed_amount);
    });

    setAreas(areas);
    setStats(st);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("areas").insert({
      name:         name.trim(),
      deputy_name:  deputyName.trim()  || null,
      deputy_phone: deputyPhone.trim() || null,
      deputy_notes: deputyNotes.trim() || null,
    });
    setSaving(false);
    if (error) { alert("خطأ: " + error.message); return; }
    setName(""); setDeputyName(""); setDeputyPhone(""); setDeputyNotes("");
    setShowForm(false);
    load();
  }

  async function handleDelete(area: Area) {
    const confirmed = confirm(
      `حذف موقع "${area.name}"؟\nسيتم حذف جميع الحالات والكفالات والتسويات المرتبطة به نهائياً.`
    );
    if (!confirmed) return;
    setDeleting(area.id);

    // Cascade: cases → sponsorships, adjustments, advance_payments, disbursements, settlement_reports
    const { data: cases } = await supabase
      .from("cases").select("id").eq("area_id", area.id);
    const ids = (cases || []).map((c: any) => c.id);

    if (ids.length > 0) {
      await supabase.from("advance_payments").delete().in("case_id", ids);
      await supabase.from("monthly_adjustments").delete().in("case_id", ids);
      await supabase.from("sponsorships").delete().in("case_id", ids);
      await supabase.from("cases").delete().in("id", ids);
    }
    await supabase.from("disbursements").delete().eq("area_id", area.id);
    await supabase.from("settlement_reports").delete().eq("area_id", area.id);
    await supabase.from("areas").delete().eq("id", area.id);

    setDeleting(null);
    load();
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <header className="app-header">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ gap: 5 }}>
          <LayoutDashboard size={16} />
          <span style={{ fontSize: "0.78rem" }}>الرئيسية</span>
        </Link>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div className="app-logo" style={{ fontSize: "1.1rem" }}>إدارة المواقع</div>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="btn btn-primary btn-sm"
          style={{ gap: 5 }}
        >
          <Plus size={15} /> إضافة موقع
        </button>
      </header>

      <main style={{ maxWidth: 700, margin: "0 auto", padding: "1.25rem 1rem 5rem" }}>

        {/* Add form */}
        {showForm && (
          <div className="card" style={{ marginBottom: 20, border: "2px solid var(--green)" }}>
            <h3 style={{ marginBottom: 16, fontSize: "1rem", color: "var(--green)" }}>
              <Plus size={16} style={{ verticalAlign: "middle", marginLeft: 6 }} />
              موقع جديد
            </h3>
            <form onSubmit={handleAdd}>
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <label className="field-label">اسم الموقع *</label>
                  <input
                    className="input-field"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="مثال: الشروق"
                    required
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label className="field-label">اسم المندوب (اختياري)</label>
                    <input className="input-field" value={deputyName} onChange={e => setDeputyName(e.target.value)} placeholder="اسم المسؤول" />
                  </div>
                  <div>
                    <label className="field-label">هاتف المندوب (اختياري)</label>
                    <input className="input-field" value={deputyPhone} onChange={e => setDeputyPhone(e.target.value)} placeholder="01xxxxxxxxx" dir="ltr" />
                  </div>
                </div>
                <div>
                  <label className="field-label">ملاحظات (اختياري)</label>
                  <textarea
                    className="textarea-field"
                    value={deputyNotes}
                    onChange={e => setDeputyNotes(e.target.value)}
                    rows={2}
                    placeholder="أي ملاحظات إضافية عن الموقع"
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
                  {saving ? "جاري الحفظ..." : "حفظ الموقع"}
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn btn-ghost">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Areas list */}
        {loading ? (
          <div style={{ textAlign: "center", color: "var(--text-3)", padding: "3rem 0" }}>جاري التحميل...</div>
        ) : areas.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)" }}>
            <MapPin size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
            <p>لا توجد مواقع مضافة بعد.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {areas.map(a => {
              const s = stats[a.id] || { cases: 0, fixed: 0 };
              return (
                <div key={a.id} className="card">
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: "var(--green-light)", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <MapPin size={18} color="var(--green)" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: "1.05rem", marginBottom: 4 }}>{a.name}</div>
                      <div style={{ display: "flex", gap: 16, fontSize: "0.78rem", color: "var(--text-3)", flexWrap: "wrap" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Users size={12} /> {s.cases} حالة نشطة
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <DollarSign size={12} /> {fmt(s.fixed)} ج شهرياً
                        </span>
                        {a.deputy_name && (
                          <span>مندوب: {a.deputy_name}</span>
                        )}
                        {a.deputy_phone && (
                          <span dir="ltr">{a.deputy_phone}</span>
                        )}
                      </div>
                      {a.deputy_notes && (
                        <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 4 }}>{a.deputy_notes}</div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(a)}
                      disabled={deleting === a.id}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "var(--text-3)", padding: 6, borderRadius: 6,
                        flexShrink: 0,
                      }}
                      title="حذف الموقع"
                    >
                      {deleting === a.id ? "..." : <Trash2 size={16} />}
                    </button>
                  </div>

                  <div style={{
                    marginTop: 12, paddingTop: 10,
                    borderTop: "1px solid var(--border-light)",
                    display: "flex", gap: 8, flexWrap: "wrap",
                  }}>
                    <Link
                      href={`/settle?area=${a.id}`}
                      className="btn btn-sm"
                      style={{ border: "1.5px solid var(--indigo)", color: "var(--indigo)", background: "rgba(99,102,241,0.08)" }}
                    >
                      تسوية الشهر
                    </Link>
                    <Link
                      href={`/cases?area=${a.id}`}
                      className="btn btn-sm btn-ghost"
                    >
                      الحالات ({s.cases})
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
