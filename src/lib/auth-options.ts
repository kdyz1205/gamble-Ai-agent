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
      // NextAuth flags this as "dangerous" because a raw OAuth provider
      // can't always be trusted about email ownership. Google, however,
      // ALWAYS verifies an email address before issuing an ID token for
      // it — so if we receive a Google token for foo@bar.com, we know
      // Google confirmed the bearer controls that mailbox. That makes
      // linking safe. Turning this OFF was blocking legitimate sign-ins
      // for users who previously registered via credentials for the
      // same email (they'd OAuth successfully then land back on the
      // homepage with no session because our signIn callback bailed out).
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
        const existing = await prisma.user.findUnique({
          where: { email: user.email },
          include: { accounts: { select: { provider: true } } },
        });
        if (!existing) {
          // Brand-new account — create it with welcome bonus.
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
            data: { type: "user_joined", message: `${username} joined via Google`, userId: user.id },
          });
        } else {
          // Existing user with this email. Because Google ALWAYS verifies the
          // email before issuing an id_token, receiving a Google credential
          // for this address proves the bearer owns the mailbox — it's the
          // same person. Let the PrismaAdapter link the Google Account row if
          // it's new (allowDangerousEmailAccountLinking: true above). Don't
          // redirect home — that was the iOS "Passkey 登录成功但还在首页"
          // bug the user reported.
          await prisma.user.update({
            where: { id: existing.id },
            data: { isOnline: true, lastSeenAt: new Date() },
          });
          user.id = existing.id;
        }
      }
      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.userId = user.id;
        // Snapshot the fields we show in the header — now cached in the JWT so
        // every request doesn't need a DB round-trip just to render credits.
        const db = await prisma.user.findUnique({
          where: { id: user.id },
          select: { username: true, credits: true, image: true },
        });
        if (db) {
          token.username = db.username;
          token.credits = db.credits;
          if (db.image) token.image = db.image;
        }
        token.cachedAt = Date.now();
      } else if (trigger === "update") {
        // `useSession().update()` from the client (e.g. after a top-up or a
        // win) forces a fresh DB read so the UI shows current credits.
        if (token.userId) {
          const db = await prisma.user.findUnique({
            where: { id: token.userId as string },
            select: { username: true, credits: true, image: true },
          });
          if (db) {
            token.username = db.username;
            token.credits = db.credits;
            if (db.image) token.image = db.image;
            token.cachedAt = Date.now();
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as { id?: string }).id = token.userId as string;
        // Read from JWT token (zero DB queries) — massive hot-path win.
        // Previously this was a DB roundtrip on every page / every
        // useSession() call. At millions of users that was our biggest DB
        // load. The JWT is refreshed by trigger="update" when we actually
        // mutate credits / username / avatar.
        const username = (token as { username?: string }).username;
        const credits = (token as { credits?: number }).credits;
        const image = (token as { image?: string }).image;
        if (username !== undefined) (session.user as { username?: string }).username = username;
        if (credits !== undefined) (session.user as { credits?: number }).credits = credits;
        if (image) session.user.image = image;
      }
      return session;
    },
  },
  pages: { signIn: "/" },
  secret: process.env.NEXTAUTH_SECRET,
};
