"use client";

import { StreamShell } from "@/components/streams/shell";
import styles from "@/components/streams/surface.module.css";

export default function AdminError({ reset }: { reset: () => void }) {
  return <StreamShell admin title="Admin temporarily unavailable." description="The request could not be completed. No private details are shown here.">
    <p className={styles.notice}>If a save was in progress, reload the schedule before retrying to avoid duplicate entries.</p>
    <button className={styles.button} onClick={reset}>Try loading again</button>
  </StreamShell>;
}
