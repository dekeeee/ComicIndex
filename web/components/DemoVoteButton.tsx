"use client";

import { useState, useSyncExternalStore } from "react";
import { DEMO_EVENT, demoStore } from "@/lib/demo";
import { voteSimilar } from "@/lib/api/votes";

function subscribe(notify: () => void) {
  window.addEventListener(DEMO_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => { window.removeEventListener(DEMO_EVENT, notify); window.removeEventListener("storage", notify); };
}

export function DemoVoteButton({ fromWorkId, toWorkId, initialCount }: { fromWorkId: string; toWorkId: string; initialCount: number }) {
  const [message, setMessage] = useState("");
  const voted = useSyncExternalStore(subscribe, () => {
    try { return demoStore().hasVote(fromWorkId, toWorkId); }
    catch { return false; }
  }, () => false);
  return <button type="button" disabled={voted} className={`w-full rounded border px-2 py-1 text-xs ${voted ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface"}`} onClick={async () => {
    const result = await voteSimilar(fromWorkId, toWorkId);
    if (!result.ok) setMessage(result.message);
  }}>
    {voted ? "似てる ✓" : "似てる"} ({initialCount + Number(voted)})
    {message && <span role="alert" className="block text-accent">{message}</span>}
  </button>;
}
