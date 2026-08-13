type PendingStatus = "queued" | "downloading" | "processing";

const labels: Record<PendingStatus, string> = {
  queued: "Queue mein wait",
  downloading: "Download aa raha hai",
  processing: "Streams merge ho rahe",
};

export default function PendingLinkEffect({ status, progress }: { status: PendingStatus; progress: number }) {
  const value = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className={`pending-link-effect is-${status}`} role="status" aria-live="polite">
      <div className="pending-link-scene" aria-hidden="true">
        <div className="pending-link-model">
          <div className="gyro-outer" />
          <div className="gyro-inner" />
          <div className="gyro-core" />
          <div className="gyro-pulse" />
        </div>
      </div>
      <span className="pending-link-copy">
        <small>LIVE TRANSFER</small>
        <strong>{labels[status]}</strong>
        <span><i style={{ width: `${status === "queued" ? 8 : Math.max(value, 3)}%` }} /></span>
      </span>
      <b>{status === "queued" ? "WAIT" : `${value}%`}</b>
    </div>
  );
}
