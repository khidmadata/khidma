"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { ArrowRight, Upload, CheckCircle, AlertCircle, Loader2, FileText, Users, Heart } from "lucide-react";

type ImportTab = "collections" | "sponsors" | "cases";

type ParsedRow = Record<string, string>;

// ─── Levenshtein distance for fuzzy matching ───────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function bestMatch(name: string, candidates: { id: string; name: string }[]): { id: string; name: string; score: number } | null {
  if (!candidates.length) return null;
  let best = candidates[0], bestScore = Infinity;
  for (const c of candidates) {
    const score = levenshtein(name.trim(), c.name.trim());
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return bestScore <= 5 ? { ...best, score: bestScore } : null;
}

// ─── CSV Parser ────────────────────────────────────────────────────────
function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const row: ParsedRow = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ""; });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

// ─── Collections Importer ──────────────────────────────────────────────
function CollectionsImporter() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sponsors, setSponsors] = useState<{ id: string; name: string }[]>([]);
  const [colMap, setColMap] = useState({ name: "", amount: "", month: "" });
  const [preview, setPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    if (!parsed.length) return;
    setRows(parsed);
    setHeaders(Object.keys(parsed[0]));
    // Load sponsors for matching
    const { data } = await supabase.from("sponsors").select("id, name").eq("is_active", true);
    setSponsors(data || []);
    setStep(2);
  }

  function buildPreview() {
    const prev = rows.slice(0, 20).map(r => {
      const name   = r[colMap.name]   || "";
      const amount = Number(r[colMap.amount]) || 0;
      const month  = r[colMap.month]  || "";
      const match  = bestMatch(name, sponsors);
      return { name, amount, month, match, raw: r };
    });
    setPreview(prev);
    setStep(3);
  }

  async function doImport() {
    setImporting(true);
    let inserted = 0, skipped = 0;
    for (const p of preview) {
      if (!p.match || !p.amount || !p.month) { skipped++; continue; }
      const { error } = await supabase.from("collections").insert({
        sponsor_id: p.match.id,
        amount: p.amount,
        fixed_portion: p.amount,
        extra_portion: 0,
        sadaqat_portion: 0,
        month_year: p.month,
        payment_method: "instapay",
        status: "confirmed",
        notes: "مستورد من Google Sheets",
        advance_type: "monthly",
        advance_months: 1,
      });
      if (error) skipped++; else inserted++;
    }
    setResult({ inserted, skipped });
    setImporting(false);
  }

  if (result) return (
    <div className="card" style={{ textAlign: "center", padding: "2.5rem" }}>
      <CheckCircle size={48} style={{ color: "var(--green)", margin: "0 auto 16px" }} />
      <h3 style={{ marginBottom: 8 }}>اكتمل الاستيراد</h3>
      <p>تم إدراج <strong>{result.inserted}</strong> سجل — تجاهل <strong>{result.skipped}</strong></p>
      <button onClick={() => { setStep(1); setRows([]); setResult(null); setPreview([]); }} className="btn btn-secondary" style={{ marginTop: 20 }}>
        استيراد آخر
      </button>
    </div>
  );

  return (
    <div>
      {step === 1 && (
        <label style={{ display: "block", cursor: "pointer" }}>
          <div style={{ border: "2px dashed var(--border)", borderRadius: "var(--radius-lg)", padding: "3rem 2rem", textAlign: "center", background: "var(--surface)", transition: "border-color 0.2s" }}
            onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = "var(--green)"; }}
            onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}>
            <Upload size={40} style={{ color: "var(--text-3)", margin: "0 auto 12px" }} />
            <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 6, color: "var(--text-1)" }}>
              ارفع ملف CSV من Google Sheets
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-3)" }}>
              اضغط هنا أو اسحب الملف — تحصيل الكفالات، يحتوي على: اسم الكفيل، المبلغ، الشهر
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "none" }} />
        </label>
      )}

      {step === 2 && (
        <div className="card">
          <h3 style={{ marginBottom: 16 }}>خريطة الخانات</h3>
          <p style={{ fontSize: "0.85rem", color: "var(--text-3)", marginBottom: 20 }}>
            حدد أي خانة في الـ CSV يقابل كل حقل — العناوين: {headers.join(", ")}
          </p>
          <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
            {[
              { key: "name",   label: "اسم الكفيل"  },
              { key: "amount", label: "المبلغ"       },
              { key: "month",  label: "الشهر (YYYY-MM)" },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="field-label">{label}</label>
                <select className="select-field"
                  value={(colMap as any)[key]}
                  onChange={e => setColMap(prev => ({ ...prev, [key]: e.target.value }))}>
                  <option value="">— اختر خانةً —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-3)", marginBottom: 16 }}>
            {rows.length} صف تم قراءتها من الملف
          </div>
          <button onClick={buildPreview} disabled={!colMap.name || !colMap.amount || !colMap.month} className="btn btn-primary">
            معاينة النتائج
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginBottom: 4 }}>معاينة أول {preview.length} سجل</h3>
            <p style={{ fontSize: "0.8rem", color: "var(--text-3)", marginBottom: 16 }}>
              تحقق من الربط بين أسماء الكفلاء ومدخلات قاعدة البيانات
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    <th>الاسم في الملف</th>
                    <th>تطابق في القاعدة</th>
                    <th>المبلغ</th>
                    <th>الشهر</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.match ? p.match.name : <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>لم يُعثر عليه</span>}</td>
                      <td style={{ color: "var(--gold)", fontWeight: 700 }}>{p.amount > 0 ? p.amount.toLocaleString("en") : "—"}</td>
                      <td dir="ltr">{p.month}</td>
                      <td>
                        {p.match && p.amount && p.month
                          ? <span className="badge badge-paid">جاهز</span>
                          : <span className="badge badge-unpaid">تجاهل</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep(2)} className="btn btn-secondary">← رجوع</button>
            <button onClick={doImport} disabled={importing} className="btn btn-primary" style={{ flex: 1 }}>
              {importing
                ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> جاري الاستيراد...</>
                : `استيراد ${preview.filter(p => p.match && p.amount && p.month).length} سجل`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────
const TABS: { id: ImportTab; label: string; Icon: any; desc: string }[] = [
  { id: "collections", label: "تحصيل الكفالات", Icon: FileText, desc: "استيراد سجلات الدفعات الشهرية" },
  { id: "sponsors",    label: "الكفلاء",         Icon: Users,    desc: "استيراد قائمة الكفلاء" },
  { id: "cases",       label: "الحالات",          Icon: Heart,    desc: "استيراد حالات الكفالة" },
];

export default function ImportPage() {
  const [tab, setTab] = useState<ImportTab>("collections");

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      {/* Header */}
      <header className="app-header">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ gap: 4 }}>
          <ArrowRight size={18} />
        </Link>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div className="app-logo" style={{ fontSize: "1.1rem" }}>استيراد البيانات</div>
          <span className="app-logo-sub">ترحيل من Google Sheets</span>
        </div>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "1.5rem 1rem" }}>
        {/* Notice */}
        <div style={{ background: "var(--indigo-light)", border: "1px solid #C5CCF0", borderRadius: "var(--radius)", padding: "1rem 1.25rem", marginBottom: "1.5rem", fontSize: "0.85rem", color: "var(--indigo)" }}>
          <strong>ملاحظة:</strong> الكفلاء والحالات موجودون بالفعل في قاعدة البيانات (تم ترحيلهم). الأهم الآن هو استيراد سجلات التحصيل الشهرية التاريخية.
        </div>

        {/* Tab selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className="btn" style={{
              flex: 1, flexDirection: "column", gap: 4, height: "auto", padding: "0.75rem 0.5rem",
              background: tab === t.id ? "var(--green)" : "var(--surface)",
              color: tab === t.id ? "white" : "var(--text-2)",
              border: tab === t.id ? "none" : "1.5px solid var(--border)",
              fontSize: "0.75rem",
            }}>
              <t.Icon size={18} />
              <span style={{ fontWeight: 700 }}>{t.label}</span>
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: "0.82rem", color: "var(--text-3)", margin: 0 }}>
            {TABS.find(t => t.id === tab)?.desc}
          </p>
        </div>

        {tab === "collections" && <CollectionsImporter />}

        {tab === "sponsors" && (
          <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
            <Users size={40} style={{ color: "var(--text-3)", margin: "0 auto 16px" }} />
            <h3 style={{ marginBottom: 8 }}>الكفلاء موجودون</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-3)" }}>
              تم استيراد ١٣٠ كفيل من جدول Google Sheets مسبقاً. يمكنك إضافة كفلاء جدد من صفحة
              <Link href="/register" style={{ color: "var(--green)", marginRight: 4 }}>التسجيل</Link>.
            </p>
          </div>
        )}

        {tab === "cases" && (
          <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
            <Heart size={40} style={{ color: "var(--text-3)", margin: "0 auto 16px" }} />
            <h3 style={{ marginBottom: 8 }}>الحالات موجودة</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-3)" }}>
              تم استيراد ٣٠٤ حالة من جداول المواقع مسبقاً. يمكنك إضافة حالات جديدة من صفحة
              <Link href="/register" style={{ color: "var(--green)", marginRight: 4 }}>التسجيل</Link>.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
