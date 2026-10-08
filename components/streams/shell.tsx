import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./surface.module.css";

export function StreamShell({ title, description, children, admin = false, wide = false, relayHref = "/road-to" }: {
  title: string; description: string; children: ReactNode; admin?: boolean; wide?: boolean;
  /** Where "Back to the relay" goes; a preview keeps its clock on the way. */
  relayHref?: string;
}) {
  return (
    <main className={wide ? `${styles.surface} ${styles.wide}` : styles.surface}>
      <nav className={styles.nav} aria-label={admin ? "Admin navigation" : "Room navigation"}>
        <Link href={relayHref}>Back to the relay</Link>
        <div className={styles.navGroup}>
          {admin ? <Link href="/watch">Viewing room</Link> : <a href="https://www.twitch.tv/vanderfondi">vanderfondi on Twitch</a>}
          <Link href={admin ? "/admin" : "/admin/login"}>{admin ? "Schedule manager" : "Admin sign in"}</Link>
        </div>
      </nav>
      <header className={styles.intro}><h1>{title}</h1><p>{description}</p></header>
      {children}
    </main>
  );
}
