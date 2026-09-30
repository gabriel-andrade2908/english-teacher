"use client";

import dynamic from "next/dynamic";

// The chat reads saved settings from localStorage, so it only renders in the browser.
const ChatApp = dynamic(() => import("./ChatApp"), {
  ssr: false,
  loading: () => <div className="flex flex-1 items-center justify-center text-muted">Carregando…</div>,
});

// canLogOut is false in local mode, where there is no login.
export function ChatAppLoader({ canLogOut }: { canLogOut: boolean }) {
  return <ChatApp canLogOut={canLogOut} />;
}
