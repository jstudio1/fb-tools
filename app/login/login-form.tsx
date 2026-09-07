"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
      <section className="login-story"><a className="brand" href="/"><span className="brand-mark">P</span><span>Pagecraft<small>FACEBOOK WORKSPACE</small></span></a><div className="login-story-content"><p className="eyebrow">LESS SWITCHING. MORE CREATING.</p><h2>พื้นที่เดียว<br />สำหรับทุกเพจ<br /><em>ที่คุณดูแล</em></h2><p>วางแผนคอนเทนต์ จัดเตรียมภาพ และเผยแพร่ไปยังหลายเพจ ด้วยขั้นตอนที่ชัดเจน</p><div className="story-card"><span className="story-icon">✧</span><div><strong>จากไอเดีย สู่โพสต์ที่พร้อมเผยแพร่</strong><small>สร้างข้อความ · จัดเรียงภาพ · พรีวิวก่อนโพสต์</small></div></div></div><span className="story-foot">BUILT FOR YOUR DAILY CONTENT WORKFLOW</span></section>
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">WELCOME BACK</p>
        <h1>ยินดีต้อนรับกลับ</h1>
        <p className="subtitle">เข้าสู่ระบบเพื่อเริ่มจัดการคอนเทนต์ของคุณ</p>
        {error && <div className="banner err">{error}</div>}
        <label className="field-label" htmlFor="username">Username</label>
        <input id="username" type="text" placeholder="ชื่อบัญชีของคุณ" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        <label className="field-label" htmlFor="password">รหัสผ่าน</label>
        <div className="password-field"><input id="password" placeholder="กรอกรหัสผ่าน" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /><button type="button" aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "ซ่อน" : "แสดง"}</button></div>
        <button className="btn btn-block" disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
        <p className="login-help">ไม่มีระบบสมัครบัญชี หากยังไม่มีบัญชีให้ติดต่อเจ้าของระบบ</p>
      </form>
    </main>
  );
}
