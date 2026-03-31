import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { hashPassword, signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, username, password } = await req.json();

    if (!email || !username || !password) {
      return Response.json({ error: "email, username, and password are required" }, { status: 400 });
    }
    if (password.length < 6) {
      return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    // Check existing
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      return Response.json(
        { error: existing.email === email ? "Email already taken" : "Username already taken" },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        isOnline: true,
        wallet: { create: { balance: 100 } }, // Start with $100 demo balance
      },
      include: { wallet: true },
    });

    const token = signToken({ userId: user.id, email: user.email, username: user.username });

    // Create welcome activity
    await prisma.activityEvent.create({
      data: {
        type: "user_joined",
        message: `${user.username} joined ChallengeAI`,
        userId: user.id,
      },
    });

    return Response.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatar: user.avatar,
        wallet: user.wallet,
      },
    }, { status: 201 });
  } catch (err) {
    console.error("Register error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
