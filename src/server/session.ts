import "server-only";
import type { NextRequest } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "./access";
import { allowedPersonalities, getTeacher, type Teacher } from "@/shared/teachers";
import type { Settings } from "@/shared/schemas";

export async function getTester(request: NextRequest): Promise<string | null> {
  return verifyAccessToken(request.cookies.get(ACCESS_COOKIE)?.value);
}

// Validates the settings against the rules the UI also follows (e.g. kids only get friendly personalities).
export function resolveSettings(settings: Settings): { teacher: Teacher; settings: Settings } | null {
  const teacher = getTeacher(settings.teacherId);
  if (!teacher) return null;
  const allowed = allowedPersonalities(settings.ageGroup);
  const personality = allowed.includes(settings.personality) ? settings.personality : allowed[0];
  return { teacher, settings: { ...settings, personality } };
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}
