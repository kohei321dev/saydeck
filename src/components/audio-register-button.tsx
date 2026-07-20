"use client";

import { useState } from "react";

type Props = { variantId: string };

export function AudioRegisterButton({ variantId }: Props) {
  const [state, setState] = useState<"idle" | "registering" | "done" | "error">("idle");

  async function register() {
    setState("registering");
    try {
      const response = await fetch(`/api/sentence-variants/${encodeURIComponent(variantId)}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("audio_registration_failed");
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <button className="secondary-button" disabled={state === "registering"} onClick={() => void register()} type="button">
      {state === "registering" ? "生成中…" : state === "done" ? "登録済み・再読込" : state === "error" ? "再試行" : "WAVを生成"}
    </button>
  );
}
