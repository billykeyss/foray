import type { ScopeStatus } from "@/lib/fishing/engine/types";
import { STAMP, STATUS_LABEL } from "@/lib/fishing/resolve.ts";

/** Rubber-stamp status. `short` shows OPEN / C&R / CLOSED / CHECK; otherwise the full Keeper label.
 *  `thunk` plays the one-shot stamp animation (remount per water via `key`). Wrap in `.kp`. */
export function StatusStamp({
  status,
  size = "md",
  short = false,
  thunk = false,
}: {
  status: ScopeStatus;
  size?: "sm" | "md";
  short?: boolean;
  thunk?: boolean;
}) {
  return (
    <span
      className={`status-stamp status-stamp--${size}${thunk ? " status-stamp--thunk" : ""}`}
      data-status={status}
      aria-label={STATUS_LABEL[status]}
    >
      {short ? STAMP[status] : STATUS_LABEL[status]}
    </span>
  );
}
