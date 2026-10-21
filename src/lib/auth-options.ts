import { getServerSession, type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import prisma from "./db";
import bcrypt from "bcryptjs";
import { authErrorBoundary, provisionSignupUser, OAuthEmailVerificationError } from "./auth-provisioning";

export const authOptions: NextAuthOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma as any) as Adapter,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // Email equality never authorizes merging a credential identity.
      allowDangerousEmailAccountLinking: false,
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
        return authErrorBoundary("credentials", async () => {
          if (!credentials?.email || !credentials?.password) return null;
          if (credentials.action === "register") {
            if (!credentials.username) return null;
            const passwordHash = await bcrypt.hash(credentials.password, 12);
            const user = await provisionSignupUser({
              source: "credentials", email: credentials.email, username: credentials.username, passwordHash,
            });
            return { id: user.id, email: user.email, name: user.username, image: user.image };
          }
          const user = await prisma.user.findUnique({ where: { email: credentials.email } });
          if (!user || !user.passwordHash) return null;
          if (!await bcrypt.compare(credentials.password, user.passwordHash)) return null;
          await prisma.user.update({ where: { id: user.id }, data: { isOnline: true, lastSeenAt: new Date() } });
          return { id: user.id, email: user.email, name: user.username, image: user.image };
        }, true);
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account, profile }) {
      return authErrorBoundary("signIn", async () => {
        if (account?.provider === "google") {
          const verifiedGoogleEmail = Boolean(profile && "email_verified" in profile && profile.email_verified === true);
          if (!user.email || !verifiedGoogleEmail) throw new OAuthEmailVerificationError();
          // Look up an existing session only for an explicit link to a credential
          // identity. This invokes the session/JWT path, never signIn recursively.
          const collision = await prisma.user.findUnique({ where: { email: user.email },
            select: { id: true, passwordHash: true, emailVerified: true } });
          const linked = await prisma.account.findUnique({ where: { provider_providerAccountId: {
            provider: "google", providerAccountId: account.providerAccountId,
          } }, select: { userId: true } });
          const session = !linked && collision && (collision.passwordHash || !collision.emailVerified)
            ? await getServerSession(authOptions).catch(() => null) : null;
          // Persist the verified provider link atomically with signup. NextAuth's
          // subsequent getUserByAccount must see it with automatic linking disabled.
          const created = await provisionSignupUser({
            source: "google", id: user.id, email: user.email,
            username: user.email.split("@")[0] + Math.random().toString(36).slice(2, 5),
            name: user.name, image: user.image, verifiedGoogleEmail,
            authenticatedUserId: (session?.user as { id?: string } | undefined)?.id,
            googleAccount: {
              providerAccountId: account.providerAccountId,
              access_token: account.access_token, refresh_token: account.refresh_token,
              expires_at: account.expires_at, token_type: account.token_type,
              scope: account.scope, id_token: account.id_token,
              session_state: typeof account.session_state === "string" ? account.session_state : undefined,
            },
          });
          user.id = created.id;
        }
        return true;
      });
    },
    async jwt({ token, user, trigger }) {
      return authErrorBoundary("jwt", async () => {
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
      });
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
