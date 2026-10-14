import { createHash } from "crypto";
import { NextRequest } from "next/server";

export const ADMIN_COOKIE = "scrut_admin";

export function adminToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return createHash("sha256").update("scrut:" + pw).digest("hex");
}

export function isAdmin(request: NextRequest): boolean {
  const token = adminToken();
  if (!token) return false;
  return request.cookies.get(ADMIN_COOKIE)?.value === token;
}
