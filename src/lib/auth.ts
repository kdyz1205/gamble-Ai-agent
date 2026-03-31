import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET || "challengeai-dev-secret";

export interface JWTPayload {
  userId: string;
  email: string;
  username: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Extract and verify user from request.
 * Checks Authorization header (Bearer token) or cookie.
 */
export function getUserFromRequest(req: NextRequest): JWTPayload | null {
  // Check Authorization header
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return verifyToken(authHeader.slice(7));
  }

  // Check cookie
  const cookie = req.cookies.get("token");
  if (cookie) {
    return verifyToken(cookie.value);
  }

  return null;
}

/**
 * Helper to return 401 JSON response
 */
export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
