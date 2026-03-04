"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LayoutDashboard, FileText, Trash2, RotateCcw } from "lucide-react";
import Link from "next/link";

type Report = {
  id: string;
  area_id: string | null;
  area_name: string;
  month_year: string;
  saved_at: string;
};

const MONTHS_AR: Record<string, string> = {
  "01":"يناير","02":"فبراير","03":"مارس","04":"أبريل",
  "05":"مايو","06":"يونيو","07":"يوليو","08":"أغسطس",
  "09":"سبتمبر","10":"أكتوبر","11":"نوفمبر","12":"ديسمبر",
};

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return `${MONTHS_AR[mo] || mo} ${y}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric" });
}

export default function ArchivePage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("settlement_reports")
      .select("*")
      .order("saved_at", { ascending: false })
      .then(({ data }) => {
        setReports(data || []);
        setLoading(false);
      });
  }, []);

  async function deleteReport(id: string) {
    if (!confirm("حذف هذا التقرير من الأرشيف؟")) return;
    setDeleting(id);
    await supabase.from("settlement_reports").delete().eq("id", id);
    setReports(prev => prev.filter(r => r.id !== id));
    setDeleting(null);
  }

  // Group by month_year
  const grouped = reports.reduce<Record<string, Report[]>>((acc, r) => {
    if (!acc[r.month_year]) acc[r.month_year] = [];
    acc[r.month_year].push(r);
    return acc;
  }, {});

  const months = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <header className="app-header">
        <Link href="/" className="btn btn-ghost btn-sm" style={{ gap: 5 }}>
          <LayoutDashboard size={16} />
          <span style={{ fontSize: "0.78rem" }}>الرئيسية</span>
        </Link>
        <div style={{ flex: 1, paddingRight: 12 }}>
          <div className="app-logo" style={{ fontSize: "1.1rem" }}>أرشيف التقارير</div>
        </div>
      </header>

      <main style={{ maxWidth: 820, margin: "0 auto", padding: "1.25rem 1rem 5rem" }}>
        {loading ? (
          <div style={{ textAlign: "center", color: "var(--text-3)", padding: "3rem 0" }}>جاري التحميل...</div>
        ) : reports.length === 0 ? (
          <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-3)" }}>
            <FileText size={40} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
            <p>لا توجد تقارير محفوظة بعد.</p>
            <p style={{ fontSize: "0.82rem" }}>أنهِ تسوية شهر وانقر "حفظ في الأرشيف" لتظهر هنا.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 20 }}>
            {months.map(month => (
              <div key={month}>
                <div style={{
                  fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em",
                  color: "var(--text-3)", marginBottom: 8, paddingRight: 4,
                }}>
                  {fmtMonth(month)}
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {grouped[month].map(r => (
                    <div key={r.id} className="card" style={{ padding: "0.875rem 1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <FileText size={16} style={{ color: "var(--green)", flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700 }}>{r.area_name}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 2 }}>
                            حُفظ {fmtDate(r.saved_at)}
                          </div>
                        </div>
                        <button
                          onClick={() => deleteReport(r.id)}
                          disabled={deleting === r.id}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 4 }}
                          title="حذف من الأرشيف"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => window.open(`/report?area=${r.area_id}&month=${r.month_year}`, "_blank")}
                          className="btn btn-sm"
                          style={{ flex: 1, border: "1.5px solid var(--green)", color: "var(--green)", background: "var(--green-light)" }}
                        >
                          فتح التقرير ↗
                        </button>
                        <button
                          onClick={() => router.push(`/settle?area=${r.area_id}&month=${r.month_year}`)}
                          className="btn btn-sm"
                          style={{ flex: 1, border: "1.5px solid var(--indigo)", color: "var(--indigo)", background: "rgba(99,102,241,0.08)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
                        >
                          <RotateCcw size={13} /> إعادة التسوية
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
