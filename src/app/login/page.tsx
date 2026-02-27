"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";

const PASSWORD = "123987";
const COOKIE   = "khidma_auth";

function setCookie(name: string, value: string) {
  // 30-day expiry
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${value}; path=/; expires=${expires}; SameSite=Lax`;
}

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [pwd,     setPwd]     = useState("");
  const [show,    setShow]    = useState(false);
  const [error,   setError]   = useState(false);
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    setTimeout(() => {
      if (pwd === PASSWORD) {
        setCookie(COOKIE, PASSWORD);
        const dest = searchParams.get("from") || "/";
        router.push(dest);
      } else {
        setError(true);
        setPwd("");
        setLoading(false);
      }
    }, 400); // small delay so it feels intentional
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 20 }}>
      {/* Password input */}
      <div style={{ position: "relative" }}>
        <label style={{
          display: "block", fontSize: "0.8rem", fontWeight: 600,
          color: "var(--text-2)", marginBottom: 8,
        }}>
          كلمة المرور
        </label>
        <div style={{ position: "relative" }}>
          <input
            type={show ? "text" : "password"}
            value={pwd}
            onChange={e => { setPwd(e.target.value); setError(false); }}
            placeholder="••••••"
            dir="ltr"
            autoFocus
            style={{
              width: "100%", padding: "12px 44px 12px 16px",
              border: `1.5px solid ${error ? "var(--red)" : "var(--border)"}`,
              borderRadius: 10, fontSize: "1.1rem", letterSpacing: "0.2em",
              background: error ? "var(--red-light)" : "var(--surface)",
              color: "var(--text-1)", outline: "none",
              transition: "border-color 0.2s",
              fontFamily: "monospace",
              boxSizing: "border-box",
            }}
          />
          <button
            type="button"
            onClick={() => setShow(!show)}
            style={{
              position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
              border: "none", background: "none", cursor: "pointer", padding: 4,
              color: "var(--text-3)",
            }}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        {error && (
          <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "var(--red)", fontWeight: 600 }}>
            كلمة المرور غير صحيحة
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={!pwd || loading}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "13px 24px", borderRadius: 10, border: "none", cursor: "pointer",
          background: !pwd || loading ? "var(--border)" : "var(--green)",
          color: !pwd || loading ? "var(--text-3)" : "white",
          fontSize: "0.95rem", fontWeight: 700, transition: "background 0.2s",
          fontFamily: "inherit",
        }}
      >
        {loading
          ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> جاري التحقق...</>
          : <><Lock size={16} /> دخول</>
        }
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div style={{
      minHeight: "100vh", background: "var(--cream)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "1.5rem", direction: "rtl",
    }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: "var(--green)", display: "flex",
            alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <Lock size={28} color="white" />
          </div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--text-1)", margin: 0 }}>
            خدمة
          </h1>
          <p style={{ fontSize: "0.82rem", color: "var(--text-3)", margin: "4px 0 0" }}>
            منظومة إدارة الكفالات
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "var(--surface)", borderRadius: 16,
          border: "1.5px solid var(--border)", padding: "2rem",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}>
          <h2 style={{ margin: "0 0 20px", fontSize: "1rem", fontWeight: 700, color: "var(--text-1)" }}>
            تسجيل الدخول
          </h2>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>

        <p style={{ textAlign: "center", marginTop: 24, fontSize: "0.75rem", color: "var(--text-3)" }}>
          للاستفسار تواصل مع المسئول
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
