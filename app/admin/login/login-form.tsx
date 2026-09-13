"use client";

import { useState } from "react";
import { login, type ActionResult } from "../actions";
import { SubmitButton } from "../controls";
import styles from "@/components/streams/surface.module.css";

export function LoginForm() {
  const [result, setResult] = useState<ActionResult | null>(null);
  return <form className={`${styles.form} ${styles.editor}`} action={async (form) => {
    setResult(null);
    try { setResult(await login(form)); }
    catch { setResult({ ok: false, message: "Sign in could not be completed. Reload and try again." }); }
  }}>
    <div className={styles.field}><label htmlFor="admin-email">Email</label>
      <input id="admin-email" name="email" type="email" autoComplete="username" maxLength={254} required /></div>
    <div className={styles.field}><label htmlFor="admin-password">Password</label>
      <input id="admin-password" name="password" type="password" autoComplete="current-password" maxLength={1024} required /></div>
    <div><SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton></div>
    <p className={styles.muted}>Accounts and password resets are managed by the site owner. There is no public registration.</p>
    {result && <p className={styles.notice} role="status">{result.message}</p>}
  </form>;
}
