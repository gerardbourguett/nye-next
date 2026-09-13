"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteSlot, logout, type ActionResult } from "./actions";
import styles from "@/components/streams/surface.module.css";

export function SubmitButton({ children, pendingLabel = "Saving…" }: { children: React.ReactNode; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <button className={`${styles.button} ${styles.primary}`} type="submit" disabled={pending}>{pending ? pendingLabel : children}</button>;
}

export function SignOut() {
  const [result, setResult] = useState<ActionResult | null>(null);
  return <form action={async () => {
    try { setResult(await logout()); } catch { setResult({ ok: false, message: "Sign out could not be confirmed. Reload and try again." }); }
  }}><SubmitButton pendingLabel="Signing out…">Sign out</SubmitButton>
    {result && <p role="status" className={styles.notice}>{result.message}</p>}
  </form>;
}

export function DeleteSlot({ id, title }: { id: string; title: string }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  return <details className={styles.delete}>
    <summary>Delete slot</summary>
    <form action={async (form) => {
      try { setResult(await deleteSlot(form)); }
      catch { setResult({ ok: false, message: "Deletion could not be confirmed. Reload before retrying." }); }
    }}>
      <input type="hidden" name="id" value={id} />
      <label className={styles.check}><input type="checkbox" name="confirm" value="delete" required />Permanently delete “{title}” and its options.</label>
      <SubmitButton pendingLabel="Deleting…">Confirm deletion</SubmitButton>
      {result && <p role="status">{result.message}</p>}
    </form>
  </details>;
}
