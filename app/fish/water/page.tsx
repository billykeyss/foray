"use client";

import { Suspense } from "react";
import DocLink from "@/components/doc-link";
import { useSearchParams } from "next/navigation";
import { isValidIsoDate } from "@/lib/fishing/engine/index.ts";
import { WaterHeader, WaterRulesBody, WaterStateNotice, useWaterRules } from "@/components/fishing/rules-sheet";

/** Standalone water page: /fish/water?w=<slug>. Same body as the rules sheet, in page form.
 *  Per-reach "Show on map" is not offered here (onShowOnMap omitted); the back link opens the
 *  map home on this water (/?spot=<slug>) instead. */
function WaterReader() {
  const params = useSearchParams();
  const slug = params.get("w") ?? "";
  // Dev-only date override (?on=YYYY-MM-DD) to check seasonal status; ignored in production builds.
  const onParam = params.get("on");
  const on =
    process.env.NODE_ENV !== "production" && onParam && isValidIsoDate(onParam) ? onParam : undefined;
  const { state, reload } = useWaterRules(slug, on);
  const ready = state.kind === "ready" ? state.data : null;
  return (
    <main className="kp water-page">
      <div className="water-page-inner">
        <DocLink className="water-page-back" href={slug ? `/?spot=${encodeURIComponent(slug)}` : "/"}>
          ← Show on map
        </DocLink>
        {ready ? <WaterHeader data={ready} thunk /> : <div className="sheet-header" />}
        <div className="water-page-body">
          {ready ? (
            <WaterRulesBody data={ready} selectedReachId={null} />
          ) : slug ? (
            <WaterStateNotice state={state} onRetry={reload} />
          ) : (
            <WaterStateNotice state={{ kind: "not-found" }} onRetry={reload} />
          )}
        </div>
      </div>
    </main>
  );
}

export default function WaterPage() {
  return (
    <Suspense fallback={null}>
      <WaterReader />
    </Suspense>
  );
}
