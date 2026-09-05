"use client";

import { useEffect, useRef } from "react";
import { config } from "@/lib/config";
import type { AdPlacement } from "@/lib/types";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/** Reserved heights keep layout stable (CLS) whether or not an ad fills. */
const HEIGHT: Record<AdPlacement, string> = {
  work_bottom: "h-[280px]",
  sidebar: "h-[600px]",
  tag_bottom: "h-[280px]",
};

const SCRIPT_SRC = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";

/** AdSense slot. Renders nothing at all while ads are disabled. */
export function AdSlot({ placement, slotId }: { placement: AdPlacement; slotId?: string }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!config.adsEnabled || !config.adsenseClient || pushed.current) return;
    if (!document.querySelector(`script[src^="${SCRIPT_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = `${SCRIPT_SRC}?client=${config.adsenseClient}`;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    }
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
      pushed.current = true;
    } catch {
      /* ad blockers */
    }
  }, []);

  if (!config.adsEnabled || !config.adsenseClient) return null;

  return (
    <div className={`w-full ${HEIGHT[placement]} overflow-hidden`} data-placement={placement}>
      <ins
        className="adsbygoogle block w-full h-full"
        data-ad-client={config.adsenseClient}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
