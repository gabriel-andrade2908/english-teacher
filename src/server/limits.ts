import "server-only";

// Daily message limit per tester. Kept in memory for the prototype: it resets when the server
// restarts and isn't shared between server instances. Phase 1 moves it to the database.
// DAILY_MESSAGE_LIMIT=0 turns the limit off.
const DAILY_LIMIT = Number(process.env.DAILY_MESSAGE_LIMIT ?? 30);
const UNLIMITED = DAILY_LIMIT <= 0 || Number.isNaN(DAILY_LIMIT);
const counts = new Map<string, number>();

function today(): string {
  // Days change at midnight Brazil time.
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Counts one message. Returns false when the tester has used up today's limit.
// remaining is null when there is no limit.
export function takeMessage(tester: string): { allowed: boolean; remaining: number | null } {
  if (UNLIMITED) return { allowed: true, remaining: null };
  const day = today();
  const key = `${tester}:${day}`;
  if (!counts.has(key)) {
    // Drop counters from previous days.
    for (const oldKey of counts.keys()) if (!oldKey.endsWith(`:${day}`)) counts.delete(oldKey);
  }
  const used = counts.get(key) ?? 0;
  if (used >= DAILY_LIMIT) return { allowed: false, remaining: 0 };
  counts.set(key, used + 1);
  return { allowed: true, remaining: DAILY_LIMIT - used - 1 };
}
