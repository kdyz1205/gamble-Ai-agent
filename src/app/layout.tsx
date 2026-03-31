import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChallengeAI — AI-Powered Challenge Platform",
  description:
    "Describe a challenge. AI structures rules, finds opponents, and judges results.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased" style={{ background: "#06060f" }}>
        {children}
      </body>
    </html>
  );
}
