"use client";

import { demoEnabled } from "@/lib/demo";
import { DemoVoteButton } from "@/components/DemoVoteButton";
import { useState } from "react";
import { voteSimilar } from "@/lib/api/votes";

type State = "idle" | "sending" | "voted" | "error";

export function SimilarVoteButton(props: { fromWorkId: string; toWorkId: string; initialCount: number }) {
  return demoEnabled ? <DemoVoteButton {...props} /> : <LiveVoteButton {...props} />;
}

function LiveVoteButton({
  fromWorkId,
  toWorkId,
  initialCount,
}: {
  fromWorkId: string;
  toWorkId: string;
  initialCount: number;
}) {
  const [count, setCount] = useState(initialCount);
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  async function onClick() {
    if (state === "sending" || state === "voted") return;
    setState("sending");
    const result = await voteSimilar(fromWorkId, toWorkId);
    if (result.ok) {
      setCount((c) => c + 1);
      setState("voted");
      return;
    }
    if (result.status === 409) {
      setState("voted");
      setMessage("投票済み");
      return;
    }
    setState("error");
    setMessage(result.status === 429 ? "しばらく待ってください" : result.message);
  }

  const voted = state === "voted";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "sending" || voted}
      className={`w-full rounded border px-2 py-1 text-xs ${
        voted ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface hover:border-accent"
      }`}
      title={message || "この作品に似ていると思ったら投票"}
    >
      {voted ? "似てる ✓" : "似てる"} {count > 0 ? `(${count})` : ""}
      {state === "error" ? <span className="block text-[10px] text-accent">{message}</span> : null}
    </button>
  );
}
