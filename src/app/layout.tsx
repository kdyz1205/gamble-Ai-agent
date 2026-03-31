import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChallengeAI — AI-Powered Challenge Platform",
  description:
    "Create, join, and settle challenges with AI. Bet on yourself or compete with friends — powered by intelligent arbitration.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-bg-primary">{children}</body>
    </html>
  );
}
