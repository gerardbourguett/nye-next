import { StreamShell } from "@/components/streams/shell";
import styles from "@/components/streams/surface.module.css";

export default function LoadingAdmin() {
  return <StreamShell admin title="Schedule manager." description="Checking private schedule access.">
    <div className={styles.loading} role="status">Loading admin access and schedule…</div>
  </StreamShell>;
}
