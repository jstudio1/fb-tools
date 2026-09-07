"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(search.get("error") || "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (!response.ok) setError(data.error || "เข้าสู่ระบบไม่สำเร็จ");
      else { router.push("/"); router.refresh(); }
    } catch { setError("ไม่สามารถเชื่อมต่อระบบได้"); }
    finally { setBusy(false); }
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">f</div>
        <h1>Facebook Tools</h1>
        <p className="subtitle">เข้าสู่ระบบด้วยบัญชีที่เจ้าของระบบสร้างให้</p>
        {error && <div className="banner err">{error}</div>}
        <label className="field-label" htmlFor="username">Username</label>
        <input id="username" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label className="field-label" htmlFor="password">รหัสผ่าน</label>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn btn-block" disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
        <p className="login-help">ไม่มีระบบสมัครบัญชี หากยังไม่มีบัญชีให้ติดต่อเจ้าของระบบ</p>
      </form>
    </main>
  );
}
