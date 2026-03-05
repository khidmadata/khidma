"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard, Check, Trash2,
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
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();
  const includeNext = daysLeft <= 7; // show next month in last 7 days of current month

  const results: { value: string; label: string }[] = [];
  // past 2 months + current month + optionally next month
  for (let i = 2; i >= (includeNext ? -1 : 0); i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    results.push({ value, label: fmtMonth(value) + (i === -1 ? " ✦" : "") });
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
  const [summary, setSummary] = useState<{ opName: string; amount: number }[] | null>(null);
  const [addSearch, setAddSearch] = useState("");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addMode, setAddMode] = useState<"existing" | "new">("existing");
  const [rowSearch, setRowSearch] = useState("");

  // New case form state
  const [newChildName,    setNewChildName]    = useState("");
  const [newGuardianName, setNewGuardianName] = useState("");
  const [newSponsorName,  setNewSponsorName]  = useState("");
  const [newFixed,        setNewFixed]        = useState("");
  const [newCaseType,     setNewCaseType]     = useState("orphan");
  const [newDOB,          setNewDOB]          = useState("");
  const [newNotes,        setNewNotes]        = useState("");
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

    // Build rows — sum ALL one_time_extra for the case (includes bulk sadaqat with sponsorship_id=null)
    const newRows: SettleRow[] = sps.map(sp => {
      const caseAdjs = adjs.filter(a => a.case_id === sp.case_id);
      const extras = caseAdjs.reduce((s: number, a: any) => s + Number(a.amount), 0);
      // Prefer the adj linked to this specific sponsorship for editing; fall back to any
      const adj = caseAdjs.find(a => a.sponsorship_id === sp.id) || caseAdjs[0] || null;
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
        child_name:      newChildName.trim(),
        guardian_name:   newGuardianName.trim() || null,
        area_id:         area?.id || null,
        case_type:       newCaseType,
        date_of_birth:   newDOB || null,
        additional_info: newNotes.trim() || null,
        status:          "active",
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
    setNewFixed(""); setNewCaseType("orphan"); setNewDOB(""); setNewNotes("");
    setShowAddPanel(false);
    setAddingNew(false);
  }

  async function saveAndContinue() {
    setSaving(true);
    const errors: string[] = [];

    for (const row of rows) {
      // Save extras changes — delete all existing entries for this case+month, then insert fresh
      if (row.newExtras !== row.extras) {
        const { error: delErr } = await supabase
          .from("monthly_adjustments")
          .delete()
          .eq("case_id", row.case_id)
          .eq("month_year", monthYear)
          .eq("adjustment_type", "one_time_extra");
        if (delErr) errors.push(delErr.message);
        else if (row.newExtras > 0) {
          const { error } = await supabase
            .from("monthly_adjustments")
            .insert({
              sponsorship_id:   row.sponsorship_id,
              case_id:          row.case_id,
              sponsor_id:       row.sponsor_id,
              month_year:       monthYear,
              adjustment_type:  "one_time_extra",
              amount:           row.newExtras,
              old_fixed_amount: row.fixed,
              applied:          row.collected,
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

    // Save collection records (group by sponsor_id, sum all their included+collected rows)
    const sponsorMap: Record<string, { fixed: number; extras: number; received_by: string }> = {};
    for (const row of rows) {
      if (!row.included || !row.collected) continue;
      if (!sponsorMap[row.sponsor_id]) {
        sponsorMap[row.sponsor_id] = { fixed: 0, extras: 0, received_by: row.received_by };
      }
      sponsorMap[row.sponsor_id].fixed  += row.newFixed;
      sponsorMap[row.sponsor_id].extras += row.newExtras;
      if (!sponsorMap[row.sponsor_id].received_by && row.received_by) {
        sponsorMap[row.sponsor_id].received_by = row.received_by;
      }
    }
    for (const [sponsorId, data] of Object.entries(sponsorMap)) {
      const totalAmount = data.fixed + data.extras;
      // Delete any existing collection record for this sponsor+month to avoid duplicates
      await supabase.from("collections").delete()
        .eq("sponsor_id", sponsorId).eq("month_year", monthYear);
      const { error: colErr } = await supabase.from("collections").insert({
        sponsor_id:              sponsorId,
        amount:                  totalAmount,
        fixed_portion:           data.fixed,
        extra_portion:           data.extras,
        sadaqat_portion:         0,
        month_year:              monthYear,
        received_by_operator_id: data.received_by || null,
        payment_method:          "cash",
        status:                  "paid",
      });
      if (colErr) errors.push(colErr.message);
    }

    // Build operator receipt summary
    const opTotals: Record<string, number> = {};
    for (const row of rows) {
      if (!row.included || !row.collected || !row.received_by) continue;
      opTotals[row.received_by] = (opTotals[row.received_by] || 0) + row.newFixed + row.newExtras;
    }
    const summaryList = operators
      .filter(o => opTotals[o.id])
      .map(o => ({ opName: o.name, amount: opTotals[o.id] }));

    // Auto-sync disbursements so dashboard reflects edits immediately
    if (area) {
      const fixedTotal  = rows.reduce((s, r) => s + r.newFixed,  0);
      const extrasTotal = rows.reduce((s, r) => s + r.newExtras, 0);
      await supabase.from("disbursements").delete().eq("area_id", area.id).eq("month_year", monthYear);
      await supabase.from("disbursements").insert({
        area_id:      area.id,
        month_year:   monthYear,
        fixed_total:  fixedTotal,
        extras_total: extrasTotal,
        total_amount: fixedTotal + extrasTotal,
        status:       "draft",
      });
    }

    setSaving(false);
    if (errors.length) alert("حدثت بعض الأخطاء:\n" + errors.join("\n"));
    setSummary(summaryList);
  }

  async function deleteRow(spId: string, caseId: string) {
    // Permanently cancel the sponsorship so case doesn't reappear
    await supabase.from("sponsorships").update({ status: "cancelled" }).eq("id", spId);

    // Delete this case's extras from DB immediately
    await supabase.from("monthly_adjustments")
      .delete()
      .eq("case_id", caseId)
      .eq("month_year", monthYear)
      .eq("adjustment_type", "one_time_extra");

    const remaining = rows.filter(r => r.sponsorship_id !== spId);
    setRows(remaining);

    // Resync disbursements with updated totals
    if (area) {
      const fixedTotal  = remaining.reduce((s, r) => s + r.newFixed,  0);
      const extrasTotal = remaining.reduce((s, r) => s + r.newExtras, 0);
      await supabase.from("disbursements").delete().eq("area_id", area.id).eq("month_year", monthYear);
      await supabase.from("disbursements").insert({
        area_id:      area.id,
        month_year:   monthYear,
        fixed_total:  fixedTotal,
        extras_total: extrasTotal,
        total_amount: fixedTotal + extrasTotal,
        status:       "draft",
      });
    }
  }

  if (loading) return <Loader />;

  // ── Receipt summary screen (shown after save) ──
  if (summary !== null) {
    const collectedRows = rows.filter(r => r.included && r.collected);
    const collectedTotal = collectedRows.reduce((s, r) => s + r.newFixed + r.newExtras, 0);
    const includedTotal  = rows.filter(r => r.included).reduce((s, r) => s + r.newFixed + r.newExtras, 0);
    return (
      <div>
        <h2 style={{ marginBottom: 4 }}>ملخص الاستلام — {fmtMonth(monthYear)}</h2>
        <p style={{ fontSize: "0.82rem", color: "var(--text-3)", margin: "0 0 1.25rem" }}>
          {area ? area.name : "إدخال يدوي"} — للمتابعة الداخلية فقط، لا يظهر في التقرير
        </p>

        {/* Operator breakdown */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: "0.9rem", marginBottom: 14 }}>استلام المبالغ</h3>
          {summary.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--text-3)" }}>
              لم يتم تحديد مستلم لأي دفعة
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {summary.map(s => (
                <div key={s.opName} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "var(--green-light)", borderRadius: "var(--radius-sm)",
                  padding: "0.875rem 1rem", border: "1px solid var(--border)",
                }}>
                  <div style={{ fontWeight: 700, fontSize: "1rem" }}>{s.opName}</div>
                  <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "var(--green)" }}>
                    {fmt(s.amount)} ج
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
            <span style={{ color: "var(--text-2)" }}>تم تحصيله</span>
            <strong style={{ color: "var(--green)" }}>{fmt(collectedTotal)} ج</strong>
          </div>
          {collectedTotal < includedTotal && (
            <div style={{ marginTop: 6, fontSize: "0.78rem", color: "var(--amber)", display: "flex", justifyContent: "space-between" }}>
              <span>لم يُحصَّل بعد</span>
              <strong>{fmt(includedTotal - collectedTotal)} ج</strong>
            </div>
          )}
        </div>

        {/* Totals overview */}
        <div className="gradient-green" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, opacity: 0.65, marginBottom: 12, letterSpacing: "0.05em" }}>
            إجمالي {area?.name || "المنطقة"} — {fmtMonth(monthYear)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, textAlign: "center" }}>
            {[
              { label: "الكفالات",  val: rows.filter(r=>r.included).reduce((s,r)=>s+r.newFixed,0) },
              { label: "الزيادات",  val: rows.filter(r=>r.included).reduce((s,r)=>s+r.newExtras,0), gold: true },
              { label: "الإجمالي", val: includedTotal },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize: "0.68rem", opacity: 0.65, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: "1.2rem", fontWeight: 800, color: (item as any).gold ? "var(--gold-light)" : "inherit" }}>
                  {fmt(item.val)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <button onClick={onNext} className="btn btn-primary btn-lg" style={{ width: "100%" }}>
          متابعة: الصدقات ←
        </button>
      </div>
    );
  }

  const includedRows  = rows.filter(r => r.included);
  const grandFixed    = includedRows.reduce((s, r) => s + r.newFixed, 0);
  const grandExtras   = includedRows.reduce((s, r) => s + r.newExtras, 0);
  const grandTotal    = grandFixed + grandExtras;
  const allIncluded   = rows.length > 0 && rows.every(r => r.included);
  const allCollected  = rows.length > 0 && rows.every(r => r.collected);

  const q = rowSearch.trim();
  const visibleRows = q
    ? rows.filter(r =>
        r.child_name.includes(q) ||
        (r.guardian_name || "").includes(q) ||
        r.sponsor_name.includes(q)
      )
    : rows;

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
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label className="field-label">مبلغ الكفالة الشهري (ج) *</label>
                  <input type="number" value={newFixed} onChange={e => setNewFixed(e.target.value)}
                    className="input-field" dir="ltr" placeholder="0" />
                </div>
                <div>
                  <label className="field-label">تاريخ الميلاد</label>
                  <input type="date" value={newDOB} onChange={e => setNewDOB(e.target.value)}
                    className="input-field" dir="ltr" />
                </div>
              </div>
              <div>
                <label className="field-label">بيانات إضافية</label>
                <input value={newNotes} onChange={e => setNewNotes(e.target.value)}
                  className="input-field" placeholder="اختياري..." />
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
          )}
        </div>
      )}

      {/* Search bar */}
      {rows.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <input
            value={rowSearch}
            onChange={e => setRowSearch(e.target.value)}
            className="input-field"
            placeholder="🔍 ابحث باسم الطفل أو العائل أو الكفيل..."
            style={{ fontSize: "0.85rem" }}
          />
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
                <th style={{ padding: "10px 10px", textAlign: "center", width: 36, verticalAlign: "middle" }}>
                  <input type="checkbox" checked={allIncluded} onChange={e => toggleSelectAll(e.target.checked)}
                    style={{ cursor: "pointer", width: 16, height: 16 }} title="تحديد الكل" />
                </th>
                <th style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700, color: "var(--text-2)" }}>الطفل</th>
                <th style={{ padding: "10px 8px", textAlign: "right", fontWeight: 700, color: "var(--text-2)" }}>الكفيل</th>
                <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "var(--text-2)", whiteSpace: "nowrap" }}>الكفالة</th>
                <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "var(--text-2)", whiteSpace: "nowrap" }}>الزيادة</th>
                <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "var(--text-1)", background: "#E4DDD3", whiteSpace: "nowrap" }}>الإجمالي</th>
                {/* تحصيل with select-all */}
                <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: "var(--text-2)", whiteSpace: "nowrap" }}>
                  <div>تحصيل</div>
                  <input type="checkbox" checked={allCollected}
                    onChange={e => setRows(prev => prev.map(r => ({ ...r, collected: e.target.checked })))}
                    style={{ cursor: "pointer", width: 14, height: 14, marginTop: 4, accentColor: "var(--green)" }} title="تحديد الكل" />
                </th>
                {/* One column per operator — styled as استلم cards */}
                {operators.map(op => (
                  <th key={op.id} style={{ padding: "8px 6px", textAlign: "center", background: "#E8F5EE", whiteSpace: "nowrap", minWidth: 68, borderRight: "1px solid #C8E6D4", borderLeft: "1px solid #C8E6D4" }}>
                    <div style={{
                      fontSize: "0.6rem", fontWeight: 700, color: "var(--green)", letterSpacing: "0.06em",
                      textTransform: "uppercase", opacity: 0.7, marginBottom: 3,
                    }}>
                      استلم
                    </div>
                    <div style={{
                      display: "inline-block", background: "var(--green)", color: "white",
                      borderRadius: 20, padding: "2px 10px", fontSize: "0.75rem", fontWeight: 700, marginBottom: 4,
                    }}>
                      {op.name}
                    </div>
                    <div>
                      <input
                        type="checkbox"
                        checked={rows.every(r => r.received_by === op.id)}
                        onChange={e => setRows(prev => prev.map(r => ({ ...r, received_by: e.target.checked ? op.id : (r.received_by === op.id ? "" : r.received_by) })))}
                        style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--green)" }}
                        title={`تحديد الكل لـ ${op.name}`}
                      />
                    </div>
                  </th>
                ))}
                <th style={{ padding: "10px 8px", textAlign: "center", width: 64 }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const idx = rows.findIndex(r => r.sponsorship_id === row.sponsorship_id);
                return (
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

                    {/* Collected — checkbox */}
                    <td style={{ padding: "8px 8px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={row.collected}
                        onChange={e => updateRow(idx, { collected: e.target.checked })}
                        style={{ cursor: "pointer", width: 16, height: 16, accentColor: "var(--green)" }}
                      />
                    </td>

                    {/* One checkbox per operator — light green tint */}
                    {operators.map(op => (
                      <td key={op.id} style={{ padding: "8px 6px", textAlign: "center", background: "#F0FAF5" }}>
                        <input
                          type="checkbox"
                          checked={row.received_by === op.id}
                          onChange={() => updateRow(idx, { received_by: row.received_by === op.id ? "" : op.id })}
                          style={{ cursor: "pointer", width: 16, height: 16, accentColor: "var(--green)" }}
                        />
                      </td>
                    ))}

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
                          onClick={() => deleteRow(row.sponsorship_id, row.case_id)}
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
                      <td colSpan={7 + operators.length + 1} style={{ padding: "12px 16px" }}>
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
                );
              })}
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
const CASE_TYPE_LABELS: Record<string, string> = {
  orphan: "كفالة يتيم", vulnerable: "كفالة يتيم",
  student: "طالب علم", medical: "حالات مرضية", special: "حالات خاصة",
};
type AreaCase = { id: string; child_name: string; guardian_name: string | null; case_type: string };

function StepSadaqat({ monthYear, area, onNext, onBack }: {
  monthYear: string; area: Area | null; onNext: () => void; onBack: () => void;
}) {
  const [cases,        setCases]        = useState<any[]>([]);
  const [operators,    setOperators]    = useState<Operator[]>([]);
  const [poolBalance,  setPoolBalance]  = useState(0);
  const [opBalances,   setOpBalances]   = useState<Record<string, number>>({});
  const [areaCases,    setAreaCases]    = useState<AreaCase[]>([]);
  const [entries,      setEntries]      = useState<any[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);

  const [caseSearch,   setCaseSearch]   = useState("");
  const [caseFocused,  setCaseFocused]  = useState(false);
  const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const [amount,       setAmount]       = useState("");
  const [reason,       setReason]       = useState("");
  const [receivedBy,   setReceivedBy]   = useState("");

  // Bulk distribution
  const [bulkMode,      setBulkMode]      = useState<"none" | "uniform" | "byType">("none");
  const [uniformAmount, setUniformAmount] = useState("");
  const [amountByType,  setAmountByType]  = useState<Record<string, string>>({});
  const [bulkOperator,  setBulkOperator]  = useState("");

  useEffect(() => {
    (async () => {
      const [cRes, opRes, poolRes, outflowRes] = await Promise.all([
        supabase.from("cases_by_receiving").select("*"),
        supabase.from("operators").select("id, name").neq("name", "شريف"),
        supabase.from("sadaqat_pool").select("amount, transaction_type, approved_by"),
        supabase.from("sadaqat_pool").select("*").eq("month_year", monthYear).eq("transaction_type", "outflow"),
      ]);
      const ops = opRes.data || [];
      setCases((cRes.data as any[]) || []);
      setOperators(ops);
      const allPool = poolRes.data || [];
      const totalIn  = allPool.filter((r: any) => r.transaction_type === "inflow") .reduce((s: number, r: any) => s + Number(r.amount), 0);
      const totalOut = allPool.filter((r: any) => r.transaction_type === "outflow").reduce((s: number, r: any) => s + Number(r.amount), 0);
      setPoolBalance(totalIn - totalOut);
      const bals: Record<string, number> = {};
      ops.forEach((op: Operator) => {
        const opIn  = allPool.filter((r: any) => r.transaction_type === "inflow"  && r.approved_by === op.id).reduce((s: number, r: any) => s + Number(r.amount), 0);
        const opOut = allPool.filter((r: any) => r.transaction_type === "outflow" && r.approved_by === op.id).reduce((s: number, r: any) => s + Number(r.amount), 0);
        bals[op.id] = opIn - opOut;
      });
      setOpBalances(bals);
      setEntries(outflowRes.data || []);
      if (area?.id) {
        const { data: ac } = await supabase.from("cases").select("id, child_name, guardian_name, case_type").eq("area_id", area.id).eq("status", "active");
        setAreaCases(ac || []);
      }
      setLoading(false);
    })();
  }, [monthYear, area]);

  const filteredCases = useMemo(() => {
    const q = caseSearch.trim();
    const list = q
      ? cases.filter(c => c.child_name?.includes(q) || c.guardian_name?.includes(q) || c.area_name?.includes(q))
      : cases;
    return list.slice(0, 25);
  }, [cases, caseSearch]);

  const opMap = useMemo(() => Object.fromEntries(operators.map(o => [o.id, o.name])), [operators]);
  const caseTypes = useMemo(() => [...new Set(areaCases.map(c => c.case_type))], [areaCases]);

  const bulkPreview = useMemo(() => {
    if (bulkMode === "uniform" && uniformAmount && Number(uniformAmount) > 0) {
      return areaCases.map(c => ({ ...c, distAmount: Number(uniformAmount) }));
    }
    if (bulkMode === "byType") {
      return areaCases
        .filter(c => amountByType[c.case_type] && Number(amountByType[c.case_type]) > 0)
        .map(c => ({ ...c, distAmount: Number(amountByType[c.case_type]) }));
    }
    return [] as (AreaCase & { distAmount: number })[];
  }, [bulkMode, uniformAmount, amountByType, areaCases]);

  const bulkTotal = bulkPreview.reduce((s, c) => s + c.distAmount, 0);

  async function addEntry() {
    if (!amount || Number(amount) <= 0) return;
    setSaving(true);
    const description = selectedCase
      ? `${selectedCase.child_name}${selectedCase.guardian_name ? ` (${selectedCase.guardian_name})` : ""} — ${selectedCase.area_name}`
      : "";
    const { data, error } = await supabase.from("sadaqat_pool").insert({
      transaction_type:        "outflow",
      amount:                  Number(amount),
      destination_type:        "kafala_case",
      destination_case_id:     selectedCase?.id || null,
      destination_description: description || reason || null,
      month_year:              monthYear,
      reason:                  reason || null,
      approved_by:             receivedBy || null,
    }).select("*").single();
    if (!error && data) {
      setEntries(prev => [...prev, data]);
      setPoolBalance(prev => prev - Number(amount));
      if (receivedBy) setOpBalances(prev => ({ ...prev, [receivedBy]: (prev[receivedBy] || 0) - Number(amount) }));
    }
    if (error) alert("خطأ: " + error.message);
    setSelectedCase(null); setCaseSearch(""); setAmount(""); setReason(""); setReceivedBy("");
    setSaving(false);
  }

  async function removeEntry(id: string) {
    const entry = entries.find((e: any) => e.id === id);
    await supabase.from("sadaqat_pool").delete().eq("id", id);
    setEntries(prev => prev.filter(e => e.id !== id));
    if (entry) {
      setPoolBalance(prev => prev + Number(entry.amount));
      if (entry.approved_by) setOpBalances(prev => ({ ...prev, [entry.approved_by]: (prev[entry.approved_by] || 0) + Number(entry.amount) }));
    }
  }

  async function applyBulkDistribution() {
    if (bulkPreview.length === 0 || saving) return;
    setSaving(true);

    // 1. Delete any previous bulk sadaqat adjustments for these cases+month (idempotent re-run)
    const caseIds = bulkPreview.map(c => c.id);
    await supabase.from("monthly_adjustments")
      .delete()
      .in("case_id", caseIds)
      .eq("month_year", monthYear)
      .eq("adjustment_type", "one_time_extra")
      .is("sponsorship_id", null);

    // 2. Insert per-case monthly_adjustments (one_time_extra) → reflects in زيادات column
    const adjInserts = bulkPreview.map(c => ({
      case_id:         c.id,
      month_year:      monthYear,
      adjustment_type: "one_time_extra",
      amount:          c.distAmount,
    }));
    const { error: adjError } = await supabase.from("monthly_adjustments").insert(adjInserts);
    if (adjError) { alert("خطأ: " + adjError.message); setSaving(false); return; }

    // 2. ONE summary entry in sadaqat_pool → shows as single line in صندوق الصدقات
    const areaLabel = area ? area.name : "إدخال يدوي";
    const { data: poolData, error: poolError } = await supabase.from("sadaqat_pool").insert({
      transaction_type:        "outflow",
      amount:                  bulkTotal,
      destination_type:        "kafala_case",
      destination_description: `توزيع جماعي — ${areaLabel} — ${bulkPreview.length} حالة`,
      month_year:              monthYear,
      approved_by:             bulkOperator || null,
    }).select("*").single();
    if (poolError) { alert("خطأ: " + poolError.message); setSaving(false); return; }

    if (poolData) setEntries(prev => [...prev, poolData]);
    setPoolBalance(prev => prev - bulkTotal);
    if (bulkOperator) setOpBalances(prev => ({ ...prev, [bulkOperator]: (prev[bulkOperator] || 0) - bulkTotal }));
    setBulkMode("none"); setUniformAmount(""); setAmountByType({}); setBulkOperator("");
    setSaving(false);
  }

  if (loading) return <Loader />;

  const totalAllocated = entries.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>الصدقات</h2>
      <p style={{ fontSize: "0.82rem", color: "var(--text-3)", marginBottom: 20, margin: "0 0 1.25rem" }}>
        توزيع صدقات من الصندوق على المستفيدين — {fmtMonth(monthYear)}
      </p>

      {/* Pool balance summary */}
      <div className="gradient-green" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "0.68rem", fontWeight: 700, opacity: 0.65, marginBottom: 12, letterSpacing: "0.05em" }}>
          صندوق الصدقات
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, textAlign: "center" }}>
          {[
            { label: "الرصيد المتاح", val: poolBalance                   },
            { label: "صرف الشهر",     val: totalAllocated, gold: true    },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: "0.68rem", opacity: 0.65, marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: "1.3rem", fontWeight: 800, color: (item as any).gold ? "var(--gold-light)" : "inherit" }}>
                {fmt(item.val)}
              </div>
            </div>
          ))}
        </div>
        {/* Per-operator balances — small */}
        {operators.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center", flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 10 }}>
            {operators.map(op => (
              <div key={op.id} style={{ fontSize: "0.72rem", opacity: 0.9, display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "2px 10px" }}>
                <span>{op.name}</span>
                <strong>{fmt(opBalances[op.id] || 0)} ج</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: "0.9rem", marginBottom: 12 }}>إضافة صرف</h3>

        {/* Case search */}
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
                    onMouseDown={() => { setSelectedCase(c); setCaseSearch(`${c.child_name} — ${c.area_name}`); setCaseFocused(false); }}
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

        {Number(amount) > poolBalance && Number(amount) > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.78rem", color: "var(--red)", marginBottom: 8 }}>
            <AlertCircle size={13} /> المبلغ أكبر من الرصيد المتاح ({fmt(poolBalance)} ج)
          </div>
        )}

        <button
          onClick={addEntry}
          disabled={saving || !amount || Number(amount) <= 0}
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
                  {e.approved_by && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-3)", marginTop: 2 }}>
                      استلمه: <strong>{opMap[e.approved_by] || e.approved_by}</strong>
                    </div>
                  )}
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

      {/* Bulk distribution */}
      {area && areaCases.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: "0.9rem", marginBottom: 12 }}>
            توزيع جماعي من الصندوق
            <span style={{ fontWeight: 400, color: "var(--text-3)", marginRight: 8, fontSize: "0.78rem" }}>({areaCases.length} حالة في {area.name})</span>
          </h3>
          {bulkMode === "none" ? (
            <div style={{ display: "flex", gap: 8 }}>
              {([["uniform","موحد للكل"],["byType","حسب نوع الحالة"]] as [string,string][]).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setBulkMode(mode as "uniform" | "byType")}
                  style={{
                    flex: 1, padding: "0.7rem", borderRadius: "var(--radius)",
                    border: "2px solid var(--green)",
                    background: "var(--green-light)", color: "var(--green)",
                    fontWeight: 700, fontSize: "0.875rem", cursor: "pointer",
                  }}
                >{label}</button>
              ))}
            </div>
          ) : (
            <div>
              {bulkMode === "uniform" && (
                <div style={{ marginBottom: 12 }}>
                  <label className="field-label">مبلغ لكل حالة (ج)</label>
                  <input
                    type="number" value={uniformAmount}
                    onChange={e => setUniformAmount(e.target.value)}
                    className="input-field" dir="ltr" placeholder="0"
                  />
                  {uniformAmount && Number(uniformAmount) > 0 && (
                    <div style={{ marginTop: 6, fontSize: "0.78rem", color: "var(--text-2)" }}>
                      {areaCases.length} حالة × {fmt(Number(uniformAmount))} ج = <strong style={{ color: "var(--green)" }}>{fmt(areaCases.length * Number(uniformAmount))} ج</strong>
                    </div>
                  )}
                </div>
              )}
              {bulkMode === "byType" && (
                <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                  {caseTypes.map(type => (
                    <div key={type} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ flex: 1, fontSize: "0.85rem" }}>
                        {CASE_TYPE_LABELS[type] || type}
                        <span style={{ color: "var(--text-3)", marginRight: 4, fontSize: "0.75rem" }}>({areaCases.filter(c => c.case_type === type).length})</span>
                      </span>
                      <input
                        type="number" value={amountByType[type] || ""}
                        onChange={e => setAmountByType(prev => ({ ...prev, [type]: e.target.value }))}
                        className="input-field" dir="ltr" placeholder="0" style={{ width: 110 }}
                      />
                    </div>
                  ))}
                  {bulkTotal > 0 && (
                    <div style={{ fontSize: "0.78rem", color: "var(--text-2)", paddingTop: 4, borderTop: "1px solid var(--border-light)" }}>
                      الإجمالي: <strong style={{ color: "var(--green)" }}>{fmt(bulkTotal)} ج</strong> — {bulkPreview.length} حالة
                    </div>
                  )}
                </div>
              )}
              <div style={{ marginBottom: 10 }}>
                <label className="field-label">يصرف من رصيد</label>
                <select value={bulkOperator} onChange={e => setBulkOperator(e.target.value)} className="select-field">
                  <option value="">— اختر المسؤول —</option>
                  {operators.map(op => (
                    <option key={op.id} value={op.id}>{op.name} ({fmt(opBalances[op.id] || 0)} ج)</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setBulkMode("none"); setUniformAmount(""); setAmountByType({}); setBulkOperator(""); }} className="btn" style={{ flex: 1, border: "1.5px solid var(--border)", background: "var(--surface)", color: "var(--text-2)" }}>
                  إلغاء
                </button>
                <button
                  onClick={applyBulkDistribution}
                  disabled={saving || bulkPreview.length === 0 || bulkTotal === 0}
                  className="btn btn-primary"
                  style={{ flex: 2, background: "var(--green)" }}
                >
                  {saving ? "جاري الحفظ..." : `توزيع ${fmt(bulkTotal)} ج على ${bulkPreview.length} حالة ✓`}
                </button>
              </div>
            </div>
          )}
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
function StepReports({ monthYear, area, onBack }: { monthYear: string; area: Area | null; onBack: () => void }) {
  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [loading,  setLoading]  = useState(!area);
  const [saved,    setSaved]    = useState<Set<string>>(new Set());
  const [saving,   setSaving]   = useState<Set<string>>(new Set());

  useEffect(() => {
    if (area) return;
    supabase.from("areas").select("*").eq("is_active", true).then(({ data }) => {
      setAllAreas(data || []);
      setLoading(false);
    });
  }, [area]);

  async function saveReport(a: Area) {
    setSaving(prev => new Set(prev).add(a.id));

    // Calculate totals from live DB data for this area + month
    const { data: cases } = await supabase.from("cases").select("id").eq("area_id", a.id).eq("status", "active");
    const caseIds = (cases || []).map((c: any) => c.id);

    const [spsRes, adjsRes] = await Promise.all([
      supabase.from("sponsorships").select("fixed_amount").in("case_id", caseIds).eq("status", "active"),
      supabase.from("monthly_adjustments").select("amount").in("case_id", caseIds).eq("month_year", monthYear).eq("adjustment_type", "one_time_extra"),
    ]);
    const fixedTotal  = (spsRes.data  || []).reduce((s: number, r: any) => s + Number(r.fixed_amount), 0);
    const extrasTotal = (adjsRes.data || []).reduce((s: number, r: any) => s + Number(r.amount), 0);

    // Write to disbursements (delete+insert to avoid duplicates)
    await supabase.from("disbursements").delete().eq("area_id", a.id).eq("month_year", monthYear);
    const { error: disbErr } = await supabase.from("disbursements").insert({
      area_id:      a.id,
      month_year:   monthYear,
      fixed_total:  fixedTotal,
      extras_total: extrasTotal,
      total_amount: fixedTotal + extrasTotal,
      status:       "draft",
    });
    if (disbErr) { setSaving(prev => { const s = new Set(prev); s.delete(a.id); return s; }); alert("خطأ في الحفظ: " + disbErr.message); return; }

    // Also save to settlement_reports (delete+insert to avoid duplicates)
    await supabase.from("settlement_reports").delete().eq("area_id", a.id).eq("month_year", monthYear);
    const { error } = await supabase.from("settlement_reports").insert({
      area_id:    a.id,
      area_name:  a.name,
      month_year: monthYear,
    });
    setSaving(prev => { const s = new Set(prev); s.delete(a.id); return s; });
    if (error) { alert("خطأ في الحفظ: " + error.message); return; }
    setSaved(prev => new Set(prev).add(a.id));
  }

  if (loading) return <Loader />;

  const reportAreas: Area[] = area ? [area] : allAreas;

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>إصدار التقارير</h2>
      <p style={{ fontSize: "0.82rem", color: "var(--text-3)", marginBottom: 24, margin: "0 0 1.5rem" }}>
        كشف الصرف — {area ? area.name : "كل المناطق"} — {fmtMonth(monthYear)}
      </p>
      <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        {reportAreas.map(a => (
          <div key={a.id} className="card" style={{ padding: "1rem 1.25rem", border: "1.5px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <FileText size={18} style={{ color: "var(--green)" }} />
              <span style={{ fontWeight: 700 }}>كشف {a.name}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => window.open(`/report?area=${a.id}&month=${monthYear}`, "_blank")}
                className="btn btn-sm"
                style={{ flex: 1, border: "1.5px solid var(--green)", color: "var(--green)", background: "var(--green-light)" }}
              >
                فتح التقرير ↗
              </button>
              {saved.has(a.id) ? (
                <span style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: "0.82rem", color: "var(--green)", fontWeight: 700 }}>
                  <Check size={14} /> تم الحفظ
                </span>
              ) : (
                <button
                  onClick={() => saveReport(a)}
                  disabled={saving.has(a.id)}
                  className="btn btn-sm"
                  style={{ flex: 1, border: "1.5px solid var(--indigo)", color: "var(--indigo)", background: "rgba(99,102,241,0.08)" }}
                >
                  {saving.has(a.id) ? "..." : "حفظ في الأرشيف ✓"}
                </button>
              )}
            </div>
          </div>
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

function SettlePageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [pageStep,     setPageStep]     = useState<PageStep>("area");
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [monthYear,    setMonthYear]    = useState("");

  // Auto-select from URL params (e.g. when reopening from archive)
  useEffect(() => {
    const areaParam  = params.get("area");
    const monthParam = params.get("month");
    if (areaParam && monthParam) {
      supabase.from("areas").select("id, name").eq("id", areaParam).single()
        .then(({ data }) => {
          if (data) {
            setSelectedArea(data as Area);
            setMonthYear(monthParam);
            setPageStep("table");
            // Clean URL params without reload
            router.replace("/settle");
          }
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <Link href="/" className="btn btn-ghost btn-sm" style={{ gap: 5 }}>
          <LayoutDashboard size={16} />
          <span style={{ fontSize: "0.78rem" }}>الرئيسية</span>
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
            area={selectedArea}
            onNext={() => setPageStep("reports")}
            onBack={() => setPageStep("table")}
          />
        )}
        {pageStep === "reports" && (
          <StepReports
            monthYear={monthYear}
            area={selectedArea}
            onBack={() => setPageStep("sadaqat")}
          />
        )}
      </main>
    </div>
  );
}

export default function SettlePage() {
  return (
    <Suspense fallback={<Loader />}>
      <SettlePageInner />
    </Suspense>
  );
}
