import { redirect } from "next/navigation";
import { StreamShell } from "@/components/streams/shell";
import { adminAccess } from "@/lib/streams/server";
import { LoginForm } from "./login-form";
import styles from "@/components/streams/surface.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin sign in | #2027Live", robots: { index: false, follow: false } };

export default async function LoginPage() {
  const { status } = await adminAccess();
  if (status === "admin") redirect("/admin");
  return <StreamShell admin title="Admin sign in." description="Private access to the hourly stream schedule.">
    {status === "setup" ? <p className={styles.notice}>Admin sign in is not configured. The site owner must complete the Supabase setup before signing in.</p> : <LoginForm />}
  </StreamShell>;
}
