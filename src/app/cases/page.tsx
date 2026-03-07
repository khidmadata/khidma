"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { LayoutDashboard, Search, Pencil, X, Loader2 } from "lucide-react";

const CASE_TYPE_AR: Record<string, string> = {
  orphan:   "كفالة يتيم",
  student:  "طالب علم",
  medical:  "حالة مرضية",
  special:  "حالة خاصة",
  one_time: "مساعدة لمرة",
  other:    "أخرى",
};

const fmt = (n: number) => n.toLocaleString("en");

type Area = { id: string; name: string };

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
  const [rows,         setRows]         = useState<CaseRow[]>([]);
  const [areas,        setAreas]        = useState<Area[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [areaFilter,   setAreaFilter]   = useState("all");
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingSaving,setEditingSaving]= useState(false);
  const [editCase,     setEditCase]     = useState<CaseRow | null>(null);

  async function saveAmount(sponsorshipId: string) {
    const val = Number(editingValue);
    const orig = rows.find(r => r.sponsorship_id === sponsorshipId)?.fixed_amount;
    if (isNaN(val) || val < 0) { setEditingId(null); return; }
    if (val === orig) { setEditingId(null); return; }
    setEditingSaving(true);
    const { error } = await supabase.from("sponsorships").update({ fixed_amount: val }).eq("id", sponsorshipId);
    setEditingSaving(false);
    if (error) { alert("خطأ: " + error.message); setEditingId(null); return; }
    setRows(prev => prev.map(r => r.sponsorship_id === sponsorshipId ? { ...r, fixed_amount: val } : r));
    setEditingId(null);
  }

  useEffect(() => {
    supabase.from("areas").select("id, name").then(r => setAreas(r.data || []));
  }, []);

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

  const areaNames = useMemo(() => [...new Set(rows.map(r => r.area_name))].sort((a, b) => a.localeCompare(b, "ar")), [rows]);

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
            {areaNames.map(a => <option key={a} value={a}>{a}</option>)}
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
                  <th style={{ width: 32 }}></th>
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
                    <td style={{ padding: "0 4px" }}>
                      <button
                        onClick={() => setEditCase(row)}
                        title="تعديل"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4, display: "flex", alignItems: "center" }}
                      >
                        <Pencil size={13} />
                      </button>
                    </td>
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
                    <td style={{ textAlign: "center" }}>
                      {editingId === row.sponsorship_id ? (
                        <input
                          type="number"
                          value={editingValue}
                          onChange={e => setEditingValue(e.target.value)}
                          onBlur={() => saveAmount(row.sponsorship_id)}
                          onKeyDown={e => {
                            if (e.key === "Enter") saveAmount(row.sponsorship_id);
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                          min="0"
                          disabled={editingSaving}
                          dir="ltr"
                          style={{ width: 90, textAlign: "center", padding: "4px 8px", border: "1.5px solid var(--green)", borderRadius: "var(--radius-sm)", fontSize: "0.9rem", fontWeight: 700 }}
                        />
                      ) : (
                        <button
                          onClick={() => { setEditingId(row.sponsorship_id); setEditingValue(String(row.fixed_amount)); }}
                          title="انقر للتعديل"
                          style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 800, color: row.fixed_amount === 0 ? "var(--text-3)" : "var(--green)", fontSize: "0.95rem", padding: 0, display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          {fmt(row.fixed_amount)} ج
                          <Pencil size={11} style={{ color: "var(--text-3)", opacity: 0.6 }} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background: "var(--surface)", fontWeight: 700 }}>
                    <td colSpan={8} style={{ textAlign: "right", color: "var(--text-2)", fontSize: "0.82rem" }}>
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

      {editCase && (
        <EditCaseModal
          row={editCase}
          areas={areas}
          onClose={() => setEditCase(null)}
          onSaved={updated => {
            setRows(prev => prev.map(r => r.case_id === updated.case_id ? { ...r, ...updated } : r));
            setEditCase(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Edit Case Modal ──────────────────────────────────────────────────────────
function EditCaseModal({ row, areas, onClose, onSaved }: {
  row: CaseRow;
  areas: Area[];
  onClose: () => void;
  onSaved: (updated: Partial<CaseRow> & { case_id: string }) => void;
}) {
  const [childName,    setChildName]    = useState(row.child_name);
  const [guardian,     setGuardian]     = useState(row.guardian_name || "");
  const [areaId,       setAreaId]       = useState(row.area_id);
  const [caseType,     setCaseType]     = useState(row.case_type);
  const [needsLevel,   setNeedsLevel]   = useState(row.needs_level || "MEDIUM");
  const [dob,          setDob]          = useState("");
  const [schoolYear,   setSchoolYear]   = useState("");
  const [addInfo,      setAddInfo]      = useState("");
  const [loadingFull,  setLoadingFull]  = useState(true);
  const [saving,       setSaving]       = useState(false);

  // Load full case details (fields not in CaseRow)
  useEffect(() => {
    supabase
      .from("cases")
      .select("date_of_birth, school_year, additional_info")
      .eq("id", row.case_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setDob(data.date_of_birth || "");
          setSchoolYear(data.school_year || "");
          setAddInfo(data.additional_info || "");
        }
        setLoadingFull(false);
      });
  }, [row.case_id]);

  async function save() {
    if (!childName.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("cases").update({
      child_name:      childName.trim(),
      guardian_name:   guardian.trim() || null,
      area_id:         areaId,
      case_type:       caseType,
      needs_level:     needsLevel,
      date_of_birth:   dob || null,
      school_year:     schoolYear.trim() || null,
      additional_info: addInfo.trim() || null,
    }).eq("id", row.case_id);
    setSaving(false);
    if (error) { alert("خطأ: " + error.message); return; }
    const newAreaName = areas.find(a => a.id === areaId)?.name || row.area_name;
    onSaved({
      case_id: row.case_id,
      child_name:    childName.trim(),
      guardian_name: guardian.trim() || null,
      area_id:       areaId,
      area_name:     newAreaName,
      case_type:     caseType,
      needs_level:   needsLevel,
    });
  }

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }}>
      <div className="card" style={{ width: "min(95vw, 520px)", maxHeight: "90vh", overflowY: "auto", padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: "1rem" }}>تعديل الحالة</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)" }}>
            <X size={18} />
          </button>
        </div>

        {loadingFull ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-3)" }}>
            <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <F label="اسم الطفل *">
              <input value={childName} onChange={e => setChildName(e.target.value)} className="input-field" />
            </F>
            <F label="اسم العائل">
              <input value={guardian} onChange={e => setGuardian(e.target.value)} className="input-field" />
            </F>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <F label="المنطقة">
                <select value={areaId} onChange={e => setAreaId(e.target.value)} className="select-field">
                  {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </F>
              <F label="نوع الحالة">
                <select value={caseType} onChange={e => setCaseType(e.target.value)} className="select-field">
                  <option value="orphan">كفالة يتيم</option>
                  <option value="student">طالب علم</option>
                  <option value="medical">حالة مرضية</option>
                  <option value="special">حالة خاصة</option>
                  <option value="one_time">مساعدة لمرة</option>
                  <option value="other">أخرى</option>
                </select>
              </F>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <F label="مستوى الاحتياج">
                <select value={needsLevel} onChange={e => setNeedsLevel(e.target.value)} className="select-field">
                  <option value="HIGH">عالي</option>
                  <option value="MEDIUM">متوسط</option>
                  <option value="LOW">منخفض</option>
                </select>
              </F>
              <F label="تاريخ الميلاد">
                <input type="date" value={dob} onChange={e => setDob(e.target.value)} className="input-field" />
              </F>
            </div>

            <F label="السنة الدراسية">
              <input value={schoolYear} onChange={e => setSchoolYear(e.target.value)} placeholder="مثل: ثالثة إعدادي" className="input-field" />
            </F>

            <F label="بيانات إضافية / ملاحظات">
              <textarea value={addInfo} onChange={e => setAddInfo(e.target.value)} className="textarea-field" style={{ minHeight: 72 }} />
            </F>

            <div style={{ fontSize: "0.72rem", color: "var(--text-3)", borderTop: "1px solid var(--border-light)", paddingTop: 8 }}>
              ID: <span style={{ fontFamily: "monospace" }}>{row.case_id}</span>
            </div>

            <button
              onClick={save}
              disabled={saving || !childName.trim()}
              className="btn btn-primary btn-lg"
            >
              {saving
                ? <><Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> جاري الحفظ...</>
                : "✓ حفظ التعديلات"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
