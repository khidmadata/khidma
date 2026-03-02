"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowRight, CheckCircle, Circle, ChevronDown, ChevronUp } from "lucide-react";
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

// ─── Types ────────────────────────────────────────────────────────────────────
type PendingSponsor = {
  sponsor_id:   string;
  sponsor_name: string;
  phone:        string | null;
  fixed:        number;   // sum of fixed_amount across all active sponsorships
  extras:       number;   // sum of one_time_extra adjustments this month
  obligation:   number;   // fixed + extras
  collected:    number;   // already paid this month
  outstanding:  number;   // obligation - collected
  cases:        { child_name: string; guardian_name: string | null }[];
  checked:      boolean;
  amount:       number;   // amount to record — editable, defaults to outstanding
  received_by:  string;   // operator UUID
};

type Operator = { id: string; name: string };

// ═══════════════════════════════════════════════════════════════════════════════
export default function TahseelPage() {
  const monthOptions = useMemo(genMonths, []);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [sponsors, setSponsors] = useState<PendingSponsor[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmMode, setConfirmMode] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [globalReceivedBy, setGlobalReceivedBy] = useState("");

  useEffect(() => {
    load(selectedMonth);
    setConfirmMode(false);
    setSavedOk(false);
  }, [selectedMonth]);

  async function load(month: string) {
    setLoading(true);

    const [spRes, adjRes, colRes, opRes] = await Promise.all([
      supabase.from("sponsorships")
        .select("sponsor_id, fixed_amount, sponsors(name, phone), cases(child_name, guardian_name)")
        .eq("status", "active"),
      // Read one_time_extra adjustments from تسوية الشهر
      supabase.from("monthly_adjustments")
        .select("sponsor_id, amount")
        .eq("month_year", month)
        .eq("adjustment_type", "one_time_extra"),
      supabase.from("collections")
        .select("sponsor_id, amount")
        .eq("month_year", month),
      supabase.from("operators").select("id, name").neq("name", "شريف"),
    ]);

    const sps: any[]  = spRes.data  || [];
    const adjs: any[] = adjRes.data || [];
    const cols: any[] = colRes.data || [];
    setOperators(opRes.data || []);

    // Group sponsorships by sponsor_id
    const map: Record<string, {
      name: string; phone: string | null;
      fixed: number; extras: number; collected: number;
      cases: { child_name: string; guardian_name: string | null }[];
    }> = {};

    for (const sp of sps) {
      const id = sp.sponsor_id;
      if (!map[id]) {
        map[id] = {
          name:  (sp.sponsors as any)?.name  || "—",
          phone: (sp.sponsors as any)?.phone || null,
          fixed: 0, extras: 0, collected: 0,
          cases: [],
        };
      }
      map[id].fixed += Number(sp.fixed_amount);
      if (sp.cases) {
        map[id].cases.push({
          child_name:    (sp.cases as any).child_name,
          guardian_name: (sp.cases as any).guardian_name,
        });
      }
    }

    // Add extras from monthly_adjustments (logged via تسوية)
    for (const adj of adjs) {
      if (map[adj.sponsor_id]) map[adj.sponsor_id].extras += Number(adj.amount);
    }
    for (const col of cols) {
      if (map[col.sponsor_id]) map[col.sponsor_id].collected += Number(col.amount);
    }

    // Build list: only those with outstanding > 0
    const result: PendingSponsor[] = Object.entries(map)
      .map(([id, d]) => {
        const obligation  = d.fixed + d.extras;
        const outstanding = Math.max(0, obligation - d.collected);
        return {
          sponsor_id:   id,
          sponsor_name: d.name,
          phone:        d.phone,
          fixed:        d.fixed,
          extras:       d.extras,
          obligation,
          collected:    d.collected,
          outstanding,
          cases:        d.cases,
          checked:      false,
          amount:       outstanding,  // editable — defaults to full outstanding
          received_by:  "",
        };
      })
      .filter(r => r.outstanding > 0)
      .sort((a, b) => a.sponsor_name.localeCompare(b.sponsor_name, "ar"));

    setSponsors(result);
    setLoading(false);
  }

  function toggleCheck(id: string) {
    setSponsors(prev => prev.map(s =>
      s.sponsor_id === id ? { ...s, checked: !s.checked } : s
    ));
  }

  function toggleAll(val: boolean) {
    setSponsors(prev => prev.map(s => ({ ...s, checked: val })));
  }

  function applyGlobalReceiver(opId: string) {
    setGlobalReceivedBy(opId);
    setSponsors(prev => prev.map(s => s.checked ? { ...s, received_by: opId } : s));
  }

  function setAmount(id: string, val: string) {
    const n = Math.max(0, Number(val) || 0);
    setSponsors(prev => prev.map(s => s.sponsor_id === id ? { ...s, amount: n } : s));
  }

  const checkedSponsors = sponsors.filter(s => s.checked);
  const allChecked = sponsors.length > 0 && sponsors.every(s => s.checked);

  async function confirmAndSave() {
    setSaving(true);
    const errors: string[] = [];

    for (const sp of checkedSponsors) {
      await supabase.from("collections").delete()
        .eq("sponsor_id", sp.sponsor_id).eq("month_year", selectedMonth);

      const amount = sp.amount;
      // Split: fixed portion first, then extras
      const fixed_portion = Math.min(amount, sp.fixed);
      const extra_portion = Math.max(0, amount - sp.fixed);

      const { error } = await supabase.from("collections").insert({
        sponsor_id:              sp.sponsor_id,
        amount,
        fixed_portion,
        extra_portion,
        sadaqat_portion:         0,
        month_year:              selectedMonth,
        received_by_operator_id: sp.received_by || null,
        payment_method:          "cash",
        status:                  "paid",
      });
      if (error) errors.push(`${sp.sponsor_name}: ${error.message}`);
    }

    setSaving(false);
    if (errors.length) {
      alert("حدثت أخطاء:\n" + errors.join("\n"));
    } else {
      setSavedOk(true);
      await load(selectedMonth);
      setConfirmMode(false);
    }
  }

  // ── Confirmation screen ──
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
          <button onClick={() => setConfirmMode(false)} className="btn btn-ghost btn-sm">
            <ArrowRight size={18} />
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
                  <div key={s} style={{ fontSize: "0.82rem", color: "var(--text-2)", padding: "4px 10px", background: "var(--cream)", borderRadius: 6 }}>
                    {s}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {unassigned.length > 0 && (
            <div className="card" style={{ marginBottom: 12, border: "1.5px solid var(--amber)" }}>
              <div style={{ fontWeight: 700, color: "var(--amber)", marginBottom: 8, fontSize: "0.9rem" }}>
                بدون مستلم محدد ({unassigned.length})
              </div>
              {unassigned.map(u => (
                <div key={u.name} style={{ fontSize: "0.82rem", color: "var(--text-2)", padding: "4px 10px", borderRadius: 6, marginBottom: 4 }}>
                  {u.name} — {fmt(u.amount)} ج
                </div>
              ))}
            </div>
          )}

          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "var(--green)", color: "white", borderRadius: "var(--radius)",
            padding: "1rem 1.25rem", marginBottom: 24,
          }}>
            <span style={{ fontWeight: 700 }}>الإجمالي</span>
            <span style={{ fontWeight: 800, fontSize: "1.3rem" }}>{fmt(grandTotal)} ج</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
            <button onClick={() => setConfirmMode(false)} className="btn btn-secondary btn-lg">
              ← تعديل
            </button>
            <button onClick={confirmAndSave} disabled={saving} className="btn btn-primary btn-lg">
              {saving ? "جاري الحفظ..." : "✓ تأكيد وحفظ"}
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Main list ──
  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <header className="app-header">
        <Link href="/" className="btn btn-ghost btn-sm">
          <ArrowRight size={18} />
        </Link>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div className="app-logo" style={{ fontSize: "1.1rem" }}>التحصيل</div>
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

      <main style={{ maxWidth: 600, margin: "0 auto", padding: "1.25rem 1rem 3rem" }}>

        {savedOk && (
          <div style={{
            display: "flex", gap: 10, alignItems: "center", marginBottom: 16,
            background: "var(--green-light)", border: "1.5px solid var(--green)",
            borderRadius: "var(--radius)", padding: "0.875rem 1rem",
          }}>
            <CheckCircle size={20} style={{ color: "var(--green)" }} />
            <span style={{ fontWeight: 700, color: "var(--green)" }}>تم حفظ التحصيل بنجاح</span>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)" }}>جاري التحميل...</div>
        ) : sponsors.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)", background: "var(--surface)", borderRadius: "var(--radius)", border: "1.5px solid var(--border)" }}>
            <CheckCircle size={40} style={{ color: "var(--green)", marginBottom: 10 }} />
            <div style={{ fontWeight: 700, color: "var(--green)", fontSize: "1rem" }}>تم تحصيل الكل ✓</div>
            <div style={{ fontSize: "0.82rem", marginTop: 6 }}>لا يوجد متأخرون في {fmtMonth(selectedMonth)}</div>
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-2)", fontWeight: 600 }}>
                {sponsors.length} كفيل لم يدفع
              </span>
              <span style={{ color: "var(--text-3)" }}>·</span>
              <span style={{ fontSize: "0.85rem", color: "var(--red)", fontWeight: 700 }}>
                {fmt(sponsors.reduce((s, r) => s + r.outstanding, 0))} ج متبقي
              </span>
              {checkedSponsors.length > 0 && (
                <>
                  <span style={{ color: "var(--text-3)" }}>·</span>
                  <span style={{ fontSize: "0.82rem", color: "var(--green)", fontWeight: 700 }}>
                    {checkedSponsors.length} محدد ({fmt(checkedSponsors.reduce((s,r)=>s+r.amount,0))} ج)
                  </span>
                </>
              )}
            </div>

            {/* Select all + global received-by */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem", fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={e => toggleAll(e.target.checked)}
                  style={{ width: 16, height: 16, cursor: "pointer" }}
                />
                تحديد الكل
              </label>
              {checkedSponsors.length > 0 && (
                <select
                  value={globalReceivedBy}
                  onChange={e => applyGlobalReceiver(e.target.value)}
                  className="select-field"
                  style={{ fontSize: "0.82rem", height: 34, flex: 1, minWidth: 160 }}
                >
                  <option value="">استلمه: — اختر للكل —</option>
                  {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
            </div>

            {/* Sponsor list */}
            <div style={{ display: "grid", gap: 8, marginBottom: 20 }}>
              {sponsors.map(sp => (
                <div
                  key={sp.sponsor_id}
                  className="card"
                  style={{
                    padding: "0.75rem 1rem",
                    border: sp.checked ? "2px solid var(--green)" : "1.5px solid var(--border)",
                    background: sp.checked ? "var(--green-light)" : "var(--surface)",
                    transition: "all 0.12s",
                  }}
                >
                  {/* Main row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => toggleCheck(sp.sponsor_id)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0, color: sp.checked ? "var(--green)" : "var(--text-3)" }}
                    >
                      {sp.checked ? <CheckCircle size={22} /> : <Circle size={22} />}
                    </button>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-1)" }}>
                        {sp.sponsor_name}
                      </div>
                      {sp.phone && (
                        <div style={{ fontSize: "0.72rem", color: "var(--text-3)" }}>{sp.phone}</div>
                      )}
                      {/* Show extras breakdown if there are extras this month */}
                      {sp.extras > 0 && (
                        <div style={{ fontSize: "0.72rem", color: "var(--indigo)", marginTop: 2 }}>
                          كفالة {fmt(sp.fixed)} + زيادة {fmt(sp.extras)} ج
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: "left", flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: "1.05rem", color: sp.checked ? "var(--green)" : "var(--red)" }}>
                        {fmt(sp.outstanding)} ج
                      </div>
                      {sp.collected > 0 && (
                        <div style={{ fontSize: "0.68rem", color: "var(--text-3)" }}>
                          دفع {fmt(sp.collected)} من {fmt(sp.obligation)} ج
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setExpandedId(expandedId === sp.sponsor_id ? null : sp.sponsor_id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "0 2px", flexShrink: 0 }}
                    >
                      {expandedId === sp.sponsor_id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>

                  {/* When checked: amount input + received_by inline */}
                  {sp.checked && (
                    <div style={{ display: "flex", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 3 }}>
                          المبلغ المحصل (ج)
                        </label>
                        <input
                          type="number"
                          value={sp.amount || ""}
                          onChange={e => setAmount(sp.sponsor_id, e.target.value)}
                          min={0}
                          className="input-field"
                          style={{ fontSize: "0.9rem", padding: "5px 10px", height: 36 }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-3)", display: "block", marginBottom: 3 }}>
                          استلمه
                        </label>
                        <select
                          value={sp.received_by}
                          onChange={e => setSponsors(prev => prev.map(s => s.sponsor_id === sp.sponsor_id ? { ...s, received_by: e.target.value } : s))}
                          className="select-field"
                          style={{ fontSize: "0.82rem", height: 36 }}
                        >
                          <option value="">— اختر —</option>
                          {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Expanded: cases list */}
                  {expandedId === sp.sponsor_id && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                      {sp.cases.length > 0 && (
                        <div>
                          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-3)", marginBottom: 4 }}>الحالات المكفولة</div>
                          {sp.cases.map((c, i) => (
                            <div key={i} style={{ fontSize: "0.8rem", color: "var(--text-2)", padding: "3px 8px" }}>
                              • {c.child_name}{c.guardian_name ? ` (${c.guardian_name})` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Sticky action button */}
            {checkedSponsors.length > 0 && (
              <div style={{ position: "sticky", bottom: 80, zIndex: 10 }}>
                <button
                  onClick={() => setConfirmMode(true)}
                  className="btn btn-primary btn-lg"
                  style={{ width: "100%", boxShadow: "0 4px 20px rgba(27,107,67,0.35)" }}
                >
                  تسجيل تحصيل {checkedSponsors.length} كفيل ({fmt(checkedSponsors.reduce((s,r)=>s+r.amount,0))} ج) →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
