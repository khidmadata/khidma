"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  ArrowRight, Check, Trash2, CheckCircle, Circle,
  FileText, AlertCircle, Pencil, X, Plus, MapPin,
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

type SettleRow = {
  sponsorship_id: string;
  sponsor_id: string;
  case_id: string;
  child_name: string;
  guardian_name: string | null;
  sponsor_name: string;
  fixed: number;
  newFixed: number;
  extras: number;
  newExtras: number;
  extra_adj_id: string | null;
  included: boolean;
  collected: boolean;
  received_by: string;
  editing: boolean;
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

function genThreeMonths() {
  const now = new Date();
  const results: { value: string; label: string }[] = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    results.push({ value, label: fmtMonth(value) });
  }
  return results;
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

// ─── Shared: Loading ──────────────────────────────────────────────────────────
function Loader() {
  return <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)" }}>جاري التحميل...</div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP "area" — Area & Month Selector
// ═══════════════════════════════════════════════════════════════════════════════
function AreaMonthStep({
  onSelect,
}: {
  onSelect: (area: Area | null, month: string) => void;
}) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArea, setSelectedArea] = useState<Area | null | "manual">(undefined as any);
  const monthOptions = useMemo(genThreeMonths, []);

  useEffect(() => {
    supabase.from("areas").select("id, name").eq("is_active", true).then(({ data }) => {
      setAreas(data || []);
      setLoading(false);
    });
  }, []);

  if (loading) return <Loader />;

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>اختر المنطقة</h2>
      <p style={{ fontSize: "0.82rem", color: "var(--text-3)", margin: "0 0 1.25rem" }}>
        حدد منطقة التسوية لهذا الشهر
      </p>

      {/* Area cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
        {areas.map(area => (
          <button
            key={area.id}
            onClick={() => setSelectedArea(area)}
            className="card"
            style={{
              cursor: "pointer", textAlign: "center", padding: "1.25rem 1rem",
              border: (selectedArea as any)?.id === area.id
                ? "2px solid var(--green)" : "1.5px solid var(--border)",
              background: (selectedArea as any)?.id === area.id ? "var(--green-light)" : "var(--surface)",
              transition: "all 0.15s",
            }}
          >
            <MapPin size={20} style={{ color: "var(--green)", marginBottom: 6 }} />
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>{area.name}</div>
          </button>
        ))}
        <button
          onClick={() => setSelectedArea("manual")}
          className="card"
          style={{
            cursor: "pointer", textAlign: "center", padding: "1.25rem 1rem",
            border: selectedArea === "manual"
              ? "2px solid var(--indigo)" : "1.5px solid var(--border)",
            background: selectedArea === "manual" ? "var(--indigo-light)" : "var(--surface)",
            transition: "all 0.15s",
          }}
        >
          <Plus size={20} style={{ color: "var(--indigo)", marginBottom: 6 }} />
          <div style={{ fontWeight: 700, fontSize: "1rem" }}>إدخال يدوي</div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 4 }}>
            اختر حالات بشكل يدوي
          </div>
        </button>
      </div>

      {/* Month pills — shown after area is chosen */}
      {selectedArea !== undefined && selectedArea !== (undefined as any) && (
        <div>
          <h3 style={{ fontSize: "0.9rem", marginBottom: 12 }}>اختر الشهر</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {monthOptions.map((m, i) => (
              <button
                key={m.value}
                onClick={() => onSelect(selectedArea === "manual" ? null : selectedArea as Area, m.value)}
                className="btn"
                style={{
                  padding: "14px 8px",
                  background: i === 2 ? "var(--green)" : "var(--surface)",
                  color: i === 2 ? "white" : "var(--text-1)",
                  border: i === 2 ? "none" : "1.5px solid var(--border)",
                  fontWeight: 700, fontSize: "0.9rem",
                  borderRadius: "var(--radius)",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-3)", marginTop: 8, textAlign: "center" }}>
            الشهر الأخير (باللون الأخضر) هو الشهر الحالي
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP "table" — Settlement Table
// ═══════════════════════════════════════════════════════════════════════════════
function SettlementTable({
  area, monthYear, onNext, onBack,
}: {
  area: Area | null;
  monthYear: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<SettleRow[]>([]);
  const [allSponsorships, setAllSponsorships] = useState<Sponsorship[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addMode, setAddMode] = useState<"existing" | "new">("existing");

  // New case form state
  const [newChildName,    setNewChildName]    = useState("");
  const [newGuardianName, setNewGuardianName] = useState("");
  const [newSponsorName,  setNewSponsorName]  = useState("");
  const [newFixed,        setNewFixed]        = useState("");
  const [newCaseType,     setNewCaseType]     = useState("orphan");
  const [addingNew,       setAddingNew]       = useState(false);

  useEffect(() => {
    load();
  }, [area, monthYear]);

  async function load() {
    setLoading(true);

    // Load operators
    const opRes = await supabase.from("operators").select("id, name").neq("name", "شريف");
    setOperators(opRes.data || []);

    // Load ALL active sponsorships for the add-case search
    const allSpRes = await supabase
      .from("sponsorships")
      .select("id, sponsor_id, case_id, fixed_amount, sponsors(name), cases(child_name, guardian_name, area_id)")
      .eq("status", "active");
    setAllSponsorships((allSpRes.data as any) || []);

    // If manual mode: start with empty table
    if (!area) {
      setRows([]);
      setLoading(false);
      return;
    }

    // Get cases for this area
    const caseRes = await supabase
      .from("cases")
      .select("id")
      .eq("area_id", area.id)
      .eq("status", "active");
    const caseIds = (caseRes.data || []).map((c: any) => c.id);

    if (!caseIds.length) {
      setRows([]);
      setLoading(false);
      return;
    }

    // Get sponsorships for those cases
    const spRes = await supabase
      .from("sponsorships")
      .select("id, sponsor_id, case_id, fixed_amount, sponsors(name), cases(child_name, guardian_name, area_id)")
      .in("case_id", caseIds)
      .eq("status", "active");
    const sps: Sponsorship[] = (spRes.data as any) || [];

    // Get existing one_time_extra adjustments for this month
    const adjRes = await supabase
      .from("monthly_adjustments")
      .select("id, sponsorship_id, case_id, amount")
      .eq("month_year", monthYear)
      .eq("adjustment_type", "one_time_extra")
      .in("case_id", caseIds);
    const adjs: any[] = adjRes.data || [];

    // Build rows
    const newRows: SettleRow[] = sps.map(sp => {
      const adj = adjs.find(a => a.sponsorship_id === sp.id);
      const extras = adj ? Number(adj.amount) : 0;
      return {
        sponsorship_id: sp.id,
        sponsor_id: sp.sponsor_id,
        case_id: sp.case_id,
        child_name: sp.cases?.child_name || "—",
        guardian_name: sp.cases?.guardian_name || null,
        sponsor_name: sp.sponsors?.name || "—",
        fixed: sp.fixed_amount,
        newFixed: sp.fixed_amount,
        extras,
        newExtras: extras,
        extra_adj_id: adj?.id || null,
        included: true,
        collected: false,
        received_by: "",
        editing: false,
      };
    }).sort((a, b) => a.child_name.localeCompare(b.child_name, "ar"));

    setRows(newRows);
    setLoading(false);
  }

  function updateRow(idx: number, changes: Partial<SettleRow>) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...changes } : r));
  }

  function toggleSelectAll(checked: boolean) {
    setRows(prev => prev.map(r => ({ ...r, included: checked })));
  }

  function addSponsorship(sp: Sponsorship) {
    if (rows.find(r => r.sponsorship_id === sp.id)) return; // already in table
    const newRow: SettleRow = {
      sponsorship_id: sp.id,
      sponsor_id: sp.sponsor_id,
      case_id: sp.case_id,
      child_name: sp.cases?.child_name || "—",
      guardian_name: sp.cases?.guardian_name || null,
      sponsor_name: sp.sponsors?.name || "—",
      fixed: sp.fixed_amount,
      newFixed: sp.fixed_amount,
      extras: 0,
      newExtras: 0,
      extra_adj_id: null,
      included: true,
      collected: false,
      received_by: "",
      editing: false,
    };
    setRows(prev => [...prev, newRow]);
    setAddSearch("");
    setShowAddPanel(false);
  }

  async function createNewCase() {
    if (!newChildName.trim() || !newSponsorName.trim() || !newFixed || Number(newFixed) <= 0) return;
    setAddingNew(true);

    // 1. Find or create sponsor
    const { data: existingSps } = await supabase
      .from("sponsors")
      .select("id, name")
      .ilike("name", newSponsorName.trim())
      .limit(1);
    let sponsorId: string;
    if (existingSps && existingSps.length > 0) {
      sponsorId = existingSps[0].id;
    } else {
      const { data: newSp, error: spErr } = await supabase
        .from("sponsors")
        .insert({ name: newSponsorName.trim() })
        .select("id")
        .single();
      if (spErr || !newSp) { alert("خطأ في إنشاء الكفيل: " + spErr?.message); setAddingNew(false); return; }
      sponsorId = newSp.id;
    }

    // 2. Create case
    const { data: newCase, error: cErr } = await supabase
      .from("cases")
      .insert({
        child_name:    newChildName.trim(),
        guardian_name: newGuardianName.trim() || null,
        area_id:       area?.id || null,
        case_type:     newCaseType,
        status:        "active",
      })
      .select("id")
      .single();
    if (cErr || !newCase) { alert("خطأ في إنشاء الحالة: " + cErr?.message); setAddingNew(false); return; }

    // 3. Create sponsorship
    const { data: newSp, error: spErr2 } = await supabase
      .from("sponsorships")
      .insert({
        sponsor_id:   sponsorId,
        case_id:      newCase.id,
        fixed_amount: Number(newFixed),
        status:       "active",
      })
      .select("id")
      .single();
    if (spErr2 || !newSp) { alert("خطأ في إنشاء الكفالة: " + spErr2?.message); setAddingNew(false); return; }

    // 4. Add row to table
    const row: SettleRow = {
      sponsorship_id: newSp.id,
      sponsor_id:     sponsorId,
      case_id:        newCase.id,
      child_name:     newChildName.trim(),
      guardian_name:  newGuardianName.trim() || null,
      sponsor_name:   newSponsorName.trim(),
      fixed:          Number(newFixed),
      newFixed:       Number(newFixed),
      extras: 0, newExtras: 0, extra_adj_id: null,
      included: true, collected: false, received_by: "", editing: false,
    };
    setRows(prev => [...prev, row]);

    // Reset form
    setNewChildName(""); setNewGuardianName(""); setNewSponsorName("");
    setNewFixed(""); setNewCaseType("orphan");
    setShowAddPanel(false);
    setAddingNew(false);
  }

  async function saveAndContinue() {
    setSaving(true);
    const errors: string[] = [];

    for (const row of rows) {
      // Save extras changes
      if (row.newExtras !== row.extras) {
        if (row.extra_adj_id) {
          if (row.newExtras > 0) {
            const { error } = await supabase
              .from("monthly_adjustments")
              .update({ amount: row.newExtras })
              .eq("id", row.extra_adj_id);
            if (error) errors.push(error.message);
          } else {
            // newExtras = 0, delete the adj
            const { error } = await supabase
              .from("monthly_adjustments")
              .delete()
              .eq("id", row.extra_adj_id);
            if (error) errors.push(error.message);
          }
        } else if (row.newExtras > 0) {
          // No existing adj, insert new
          const { error } = await supabase
            .from("monthly_adjustments")
            .insert({
              sponsorship_id:  row.sponsorship_id,
              case_id:         row.case_id,
              sponsor_id:      row.sponsor_id,
              month_year:      monthYear,
              adjustment_type: "one_time_extra",
              amount:          row.newExtras,
              old_fixed_amount: row.fixed,
              applied:         row.collected,
            });
          if (error) errors.push(error.message);
        }
      }

      // Save permanent fixed changes
      if (row.newFixed !== row.fixed && row.newFixed > 0) {
        const { error: spErr } = await supabase
          .from("sponsorships")
          .update({ fixed_amount: row.newFixed })
          .eq("id", row.sponsorship_id);
        if (spErr) errors.push(spErr.message);
        else {
          const { error: adjErr } = await supabase
            .from("monthly_adjustments")
            .insert({
              sponsorship_id:   row.sponsorship_id,
              case_id:          row.case_id,
              sponsor_id:       row.sponsor_id,
              month_year:       monthYear,
              adjustment_type:  "permanent_increase",
              amount:           row.newFixed,
              old_fixed_amount: row.fixed,
              applied:          row.collected,
            });
          if (adjErr) errors.push(adjErr.message);
        }
      }
    }

    setSaving(false);
    if (errors.length) {
      alert("حدثت بعض الأخطاء:\n" + errors.join("\n"));
    }
    onNext();
  }

  if (loading) return <Loader />;

  const includedRows = rows.filter(r => r.included);
  const grandFixed   = includedRows.reduce((s, r) => s + r.newFixed, 0);
  const grandExtras  = includedRows.reduce((s, r) => s + r.newExtras, 0);
  const grandTotal   = grandFixed + grandExtras;
  const allIncluded  = rows.length > 0 && rows.every(r => r.included);

  // Sponsorships not already in the table (for add-case search)
  const addableSps = allSponsorships.filter(sp => !rows.find(r => r.sponsorship_id === sp.id));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>الكفالات — {fmtMonth(monthYear)}</h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-3)", margin: 0 }}>
            {area ? area.name : "إدخال يدوي"} — {rows.length} حالة
          </p>
        </div>
        <button
          onClick={() => { setShowAddPanel(v => !v); setAddMode("existing"); }}
          className="btn btn-secondary btn-sm"
          style={{ gap: 4 }}
        >
          <Plus size={14} /> إضافة حالة
        </button>
      </div>

      {/* Add-case panel */}
      {showAddPanel && (
        <div className="card" style={{ marginBottom: 12, padding: "0.875rem" }}>
          {/* Mode tabs */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {([["existing", "كفالة موجودة"], ["new", "حالة جديدة"]] as [string, string][]).map(([v, lbl]) => (
              <button
                key={v}
                onClick={() => setAddMode(v as any)}
                className="btn btn-sm"
                style={{
                  flex: 1,
                  background: addMode === v ? "var(--green-light)" : "var(--surface)",
                  color:      addMode === v ? "var(--green)"       : "var(--text-3)",
                  border:     addMode === v ? "2px solid var(--green)" : "1.5px solid var(--border)",
                  fontWeight: 600,
                }}
              >{lbl}</button>
            ))}
          </div>

          {/* Search existing */}
          {addMode === "existing" && (
            <SpSearch
              sponsorships={addableSps}
              value={addSearch}
              onChange={setAddSearch}
              onSelect={sp => addSponsorship(sp)}
              placeholder="ابحث باسم الكفيل أو الطفل..."
            />
          )}

          {/* New case form */}
          {addMode === "new" && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="field-label">اسم الطفل *</label>
                  <input value={newChildName} onChange={e => setNewChildName(e.target.value)}
                    className="input-field" placeholder="الاسم الكامل للطفل" />
                </div>
                <div>
                  <label className="field-label">اسم العائل / ولي الأمر</label>
                  <input value={newGuardianName} onChange={e => setNewGuardianName(e.target.value)}
                    className="input-field" placeholder="اختياري" />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="field-label">اسم الكفيل *</label>
                  <input value={newSponsorName} onChange={e => setNewSponsorName(e.target.value)}
                    className="input-field" placeholder="سيُنشأ تلقائياً إن لم يكن موجوداً" />
                </div>
                <div>
                  <label className="field-label">نوع الحالة</label>
                  <select value={newCaseType} onChange={e => setNewCaseType(e.target.value)} className="select-field">
                    <option value="orphan">كفالة يتيم</option>
                    <option value="student">طالب علم</option>
                    <option value="medical">حالة مرضية</option>
                    <option value="special">حالة خاصة</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "flex-end" }}>
                <div>
                  <label className="field-label">مبلغ الكفالة الشهري (ج) *</label>
                  <input type="number" value={newFixed} onChange={e => setNewFixed(e.target.value)}
                    className="input-field" dir="ltr" placeholder="0" />
                </div>
                <button
                  onClick={createNewCase}
                  disabled={addingNew || !newChildName.trim() || !newSponsorName.trim() || !newFixed || Number(newFixed) <= 0}
                  className="btn btn-primary"
                  style={{ whiteSpace: "nowrap" }}
                >
                  {addingNew ? "جاري الحفظ..." : "+ إنشاء وإضافة"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)", background: "var(--surface)", borderRadius: "var(--radius)", border: "1.5px dashed var(--border)" }}>
          <Plus size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div>لا توجد كفالات. اضغط "إضافة حالة" لإضافة الكفالات يدوياً.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ background: "#F0EDE7" }}>
                <th style={{ padding: "10px 10px", textAlign: "center", width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allIncluded}
                    onChange={e => toggleSelectAll(e.target.checked)}
                    style={{ cursor: "pointer", width: 16, height: 16 }}
                  />
                </th>
                <th style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700, color: "var(--text-2)" }}>الطفل</th>
                <th style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700, color: "var(--text-2)" }}>الكفيل</th>
                <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "var(--text-2)", whiteSpace: "nowrap" }}>الكفالة</th>
                <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "var(--text-2)", whiteSpace: "nowrap" }}>الزيادة</th>
                <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "var(--text-1)", background: "#E4DDD3", whiteSpace: "nowrap" }}>الإجمالي</th>
                <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "var(--text-2)", whiteSpace: "nowrap" }}>تحصيل</th>
                <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "var(--text-2)", whiteSpace: "nowrap" }}>استلم</th>
                <th style={{ padding: "10px 8px", textAlign: "center", width: 64 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <>
                  <tr
                    key={row.sponsorship_id}
                    style={{
                      background: row.included
                        ? (idx % 2 === 0 ? "white" : "var(--cream)")
                        : "#F8F5F0",
                      opacity: row.included ? 1 : 0.45,
                      borderBottom: row.editing ? "none" : "1px solid var(--border)",
                    }}
                  >
                    {/* Include checkbox */}
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={e => updateRow(idx, { included: e.target.checked })}
                        style={{ cursor: "pointer", width: 16, height: 16 }}
                      />
                    </td>

                    {/* Child name */}
                    <td style={{ padding: "8px 8px" }}>
                      <div style={{ fontWeight: 700, color: "var(--text-1)" }}>{row.child_name}</div>
                      {row.guardian_name && (
                        <div style={{ fontSize: "0.7rem", color: "var(--text-3)" }}>{row.guardian_name}</div>
                      )}
                    </td>

                    {/* Sponsor name */}
                    <td style={{ padding: "8px 8px", color: "var(--text-2)" }}>{row.sponsor_name}</td>

                    {/* Fixed */}
                    <td style={{ padding: "8px 8px", textAlign: "center", color: "var(--text-1)", fontWeight: row.newFixed !== row.fixed ? 700 : 400 }}>
                      {fmt(row.newFixed)}
                      {row.newFixed !== row.fixed && (
                        <div style={{ fontSize: "0.65rem", color: "var(--amber)" }}>
                          كان: {fmt(row.fixed)}
                        </div>
                      )}
                    </td>

                    {/* Extras */}
                    <td style={{ padding: "8px 8px", textAlign: "center" }}>
                      {row.newExtras > 0 ? (
                        <span style={{ color: "var(--amber)", fontWeight: 700 }}>+{fmt(row.newExtras)}</span>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </td>

                    {/* Total */}
                    <td style={{ padding: "8px 8px", textAlign: "center", fontWeight: 800, color: "var(--text-1)", background: idx % 2 === 0 ? "#EDE8E1" : "#E8E2DA" }}>
                      {fmt(row.newFixed + row.newExtras)}
                    </td>

                    {/* Collected */}
                    <td style={{ padding: "8px 8px", textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => updateRow(idx, { collected: !row.collected })}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          color: row.collected ? "var(--green)" : "var(--text-3)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          margin: "0 auto",
                        }}
                      >
                        {row.collected
                          ? <CheckCircle size={18} />
                          : <Circle size={18} />
                        }
                      </button>
                    </td>

                    {/* Received by */}
                    <td style={{ padding: "8px 4px", textAlign: "center" }}>
                      <select
                        value={row.received_by}
                        onChange={e => updateRow(idx, { received_by: e.target.value })}
                        style={{
                          border: "1px solid var(--border)", borderRadius: 6,
                          padding: "4px 6px", fontSize: "0.75rem", background: "var(--surface)",
                          color: row.received_by ? "var(--text-1)" : "var(--text-3)",
                          minWidth: 72,
                        }}
                      >
                        <option value="">—</option>
                        {operators.map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "8px 6px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button
                          onClick={() => updateRow(idx, { editing: !row.editing })}
                          style={{
                            background: row.editing ? "var(--green-light)" : "var(--surface-2)",
                            border: "none", borderRadius: 6, cursor: "pointer",
                            padding: "4px 8px", color: row.editing ? "var(--green)" : "var(--text-3)",
                          }}
                          title="تعديل"
                        >
                          {row.editing ? <X size={13} /> : <Pencil size={13} />}
                        </button>
                        <button
                          onClick={() => setRows(prev => prev.filter((_, i) => i !== idx))}
                          style={{
                            background: "none", border: "none", borderRadius: 6, cursor: "pointer",
                            padding: "4px 8px", color: "var(--text-3)",
                          }}
                          title="حذف"
                          onMouseEnter={ev => (ev.currentTarget.style.color = "var(--red)")}
                          onMouseLeave={ev => (ev.currentTarget.style.color = "var(--text-3)")}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Inline edit panel */}
                  {row.editing && (
                    <tr key={`${row.sponsorship_id}-edit`} style={{ background: "var(--green-light)", borderBottom: "1px solid var(--border)" }}>
                      <td colSpan={9} style={{ padding: "12px 16px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
                          <div>
                            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, color: "var(--text-2)", marginBottom: 4 }}>
                              الكفالة الدائمة (ج)
                            </label>
                            <input
                              type="number"
                              value={row.newFixed}
                              onChange={e => updateRow(idx, { newFixed: Number(e.target.value) || row.fixed })}
                              className="input-field"
                              dir="ltr"
                              style={{ fontSize: "0.875rem" }}
                            />
                            {row.newFixed !== row.fixed && (
                              <div style={{ fontSize: "0.68rem", color: "var(--amber)", marginTop: 2 }}>
                                تغيير دائم: {fmt(row.fixed)} → {fmt(row.newFixed)} ج
                              </div>
                            )}
                          </div>
                          <div>
                            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 700, color: "var(--text-2)", marginBottom: 4 }}>
                              زيادة هذا الشهر (ج)
                            </label>
                            <input
                              type="number"
                              value={row.newExtras || ""}
                              onChange={e => updateRow(idx, { newExtras: Number(e.target.value) || 0 })}
                              className="input-field"
                              dir="ltr"
                              placeholder="0"
                              style={{ fontSize: "0.875rem" }}
                            />
                          </div>
                          <button
                            onClick={() => updateRow(idx, { editing: false })}
                            className="btn btn-primary btn-sm"
                          >
                            <Check size={14} /> حفظ
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
            {/* Grand totals */}
            <tfoot>
              <tr style={{ background: "#E4DDD3", fontWeight: 800 }}>
                <td colSpan={3} style={{ padding: "10px 10px", color: "var(--text-1)" }}>
                  الإجمالي ({includedRows.length} حالة)
                </td>
                <td style={{ padding: "10px 8px", textAlign: "center", color: "var(--text-1)" }}>{fmt(grandFixed)}</td>
                <td style={{ padding: "10px 8px", textAlign: "center", color: "var(--amber)" }}>
                  {grandExtras > 0 ? `+${fmt(grandExtras)}` : "—"}
                </td>
                <td style={{ padding: "10px 8px", textAlign: "center", fontSize: "1rem", color: "var(--green)" }}>{fmt(grandTotal)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={onBack} className="btn btn-secondary" style={{ flex: 1 }}>← تغيير المنطقة</button>
        <button
          onClick={saveAndContinue}
          disabled={saving}
          className="btn btn-primary"
          style={{ flex: 2 }}
        >
          {saving ? "جاري الحفظ..." : "حفظ ومتابعة ←"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STEP "sadaqat" — SADAQAT
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

  const opMap = useMemo(() => Object.fromEntries(operators.map(o => [o.id, o.name])), [operators]);

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
      <h2 style={{ marginBottom: 4 }}>الصدقات</h2>
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
            <select value={receivedBy} onChange={e => setReceivedBy(e.target.value)} className="select-field">
              <option value="">— اختر المسئول —</option>
              {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
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
                    {e.approved_by && <span>استلمه: <strong>{opMap[e.approved_by] || e.approved_by}</strong></span>}
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
// STEP "reports" — REPORTS
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
      <h2 style={{ marginBottom: 4 }}>إصدار التقارير</h2>
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
type PageStep = "area" | "table" | "sadaqat" | "reports";

export default function SettlePage() {
  const [pageStep,     setPageStep]     = useState<PageStep>("area");
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [monthYear,    setMonthYear]    = useState("");

  function handleAreaMonthSelect(area: Area | null, month: string) {
    setSelectedArea(area);
    setMonthYear(month);
    setPageStep("table");
  }

  function resetToArea() {
    setPageStep("area");
    setSelectedArea(null);
    setMonthYear("");
  }

  const STEPS = [
    { id: "table",   n: 1, label: "الكفالات" },
    { id: "sadaqat", n: 2, label: "الصدقات"  },
    { id: "reports", n: 3, label: "التقارير" },
  ] as const;

  const currentStepN = STEPS.find(s => s.id === pageStep)?.n || 0;

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <header className="app-header">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ gap: 4 }}>
          <ArrowRight size={18} />
        </Link>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div className="app-logo" style={{ fontSize: "1.1rem" }}>تسوية الشهر</div>
        </div>
      </header>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "1.25rem 1rem 0" }}>

        {/* Area + month summary bar (shown after area step) */}
        {pageStep !== "area" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
            background: "var(--surface)", borderRadius: "var(--radius)",
            border: "1px solid var(--border)", padding: "0.6rem 1rem",
            fontSize: "0.82rem",
          }}>
            <MapPin size={14} style={{ color: "var(--indigo)", flexShrink: 0 }} />
            <span style={{ fontWeight: 700, color: "var(--text-1)" }}>
              {selectedArea ? selectedArea.name : "إدخال يدوي"}
            </span>
            <span style={{ color: "var(--text-3)" }}>—</span>
            <span style={{ color: "var(--text-2)" }}>{fmtMonth(monthYear)}</span>
            <button
              onClick={resetToArea}
              style={{ marginRight: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: "0.78rem", textDecoration: "underline" }}
            >
              تغيير
            </button>
          </div>
        )}

        {/* Step indicator (only when past area step) */}
        {pageStep !== "area" && (
          <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
            {STEPS.map((s, i) => (
              <div key={s.n} style={{ display: "flex", flex: 1, alignItems: "center" }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.8rem", fontWeight: 800, flexShrink: 0,
                  background: currentStepN >= s.n ? "var(--green)" : "var(--border)",
                  color:      currentStepN >= s.n ? "white"        : "var(--text-3)",
                }}>
                  {currentStepN > s.n ? <Check size={14} /> : s.n}
                </div>
                <span style={{
                  fontSize: "0.7rem", marginRight: 6,
                  fontWeight: currentStepN >= s.n ? 700 : 400,
                  color: currentStepN >= s.n ? "var(--text-1)" : "var(--text-3)",
                  whiteSpace: "nowrap",
                }}>{s.label}</span>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 2, margin: "0 6px", borderRadius: 2, background: currentStepN > s.n ? "var(--green)" : "var(--border)" }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "0 1rem 3rem" }}>
        {pageStep === "area" && (
          <AreaMonthStep onSelect={handleAreaMonthSelect} />
        )}
        {pageStep === "table" && (
          <SettlementTable
            area={selectedArea}
            monthYear={monthYear}
            onNext={() => setPageStep("sadaqat")}
            onBack={resetToArea}
          />
        )}
        {pageStep === "sadaqat" && (
          <StepSadaqat
            monthYear={monthYear}
            onNext={() => setPageStep("reports")}
            onBack={() => setPageStep("table")}
          />
        )}
        {pageStep === "reports" && (
          <StepReports
            monthYear={monthYear}
            onBack={() => setPageStep("sadaqat")}
          />
        )}
      </main>
    </div>
  );
}
