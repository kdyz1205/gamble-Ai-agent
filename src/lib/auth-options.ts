import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import prisma from "./db";
import bcrypt from "bcryptjs";
import { COSTS } from "./credits";

export const authOptions: NextAuthOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma as any) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        username: { label: "Username", type: "text" },
        action: { label: "Action", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        if (credentials.action === "register") {
          if (!credentials.username) return null;

          const existing = await prisma.user.findFirst({
            where: { OR: [{ email: credentials.email }, { username: credentials.username }] },
          });
          if (existing) throw new Error(existing.email === credentials.email ? "Email already taken" : "Username already taken");

          const passwordHash = await bcrypt.hash(credentials.password, 12);
          const user = await prisma.user.create({
            data: {
              email: credentials.email,
              username: credentials.username,
              passwordHash,
              credits: COSTS.SIGNUP_BONUS,
              isOnline: true,
            },
          });

          await prisma.creditTx.create({
            data: { userId: user.id, type: "bonus", amount: COSTS.SIGNUP_BONUS, balanceAfter: COSTS.SIGNUP_BONUS, description: "Welcome bonus" },
          });
          await prisma.activityEvent.create({
            data: { type: "user_joined", message: `${user.username} joined ChallengeAI`, userId: user.id },
          });

          return { id: user.id, email: user.email, name: user.username, image: user.image };
        }

        const user = await prisma.user.findUnique({ where: { email: credentials.email } });
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        await prisma.user.update({ where: { id: user.id }, data: { isOnline: true, lastSeenAt: new Date() } });
        return { id: user.id, email: user.email, name: user.username, image: user.image };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const existing = await prisma.user.findUnique({ where: { email: user.email } });
        if (!existing) {
          const username = user.email.split("@")[0] + Math.random().toString(36).slice(2, 5);
          const created = await prisma.user.create({
            data: {
              id: user.id!,
              email: user.email,
              username,
              name: user.name,
              image: user.image,
              emailVerified: new Date(),
              credits: COSTS.SIGNUP_BONUS,
              isOnline: true,
            },
          });
          await prisma.creditTx.create({
            data: { userId: created.id, type: "bonus", amount: COSTS.SIGNUP_BONUS, balanceAfter: COSTS.SIGNUP_BONUS, description: "Welcome bonus" },
          });
          await prisma.activityEvent.create({
            data: { type: "user_joined", message: `${username} joined ChallengeAI via Google`, userId: user.id },
          });
        } else {
          await prisma.user.update({ where: { id: existing.id }, data: { isOnline: true, lastSeenAt: new Date() } });
          user.id = existing.id;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as { id?: string }).id = token.userId as string;
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { username: true, credits: true, image: true },
        });
        if (dbUser) {
          (session.user as { username?: string }).username = dbUser.username;
          (session.user as { credits?: number }).credits = dbUser.credits;
          if (dbUser.image) session.user.image = dbUser.image;
        }
      }
      return session;
    },
  },
  pages: { signIn: "/" },
  secret: process.env.NEXTAUTH_SECRET,
};
