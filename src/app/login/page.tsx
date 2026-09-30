"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setLoading(false);
    if (response.ok) {
      router.replace("/");
    } else {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? "Não foi possível entrar.");
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-2xl font-bold">English Teacher</h1>
        <p className="mt-2 text-sm text-muted">
          Este protótipo é só para convidados. Digite o seu código de convite para entrar.
        </p>
        <label className="mt-5 block text-sm font-semibold" htmlFor="code">
          Código de convite
        </label>
        <input
          id="code"
          type="password"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-accent"
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading || !code}
          className="mt-4 w-full rounded-lg bg-accent px-4 py-2 font-semibold text-accent-foreground disabled:opacity-50"
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
