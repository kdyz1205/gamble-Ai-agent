import type { Metadata, Viewport } from "next";
import Providers from "@/components/Providers";
import ErrorBoundary from "@/components/ErrorBoundary";
import EntryPolicyLinks from "@/components/legal/EntryPolicyLinks";
import QuestAppNav from "@/components/QuestAppNav";
import "./globals.css";
import "./summoner-world.css";
import "./sum-universe.css";
import "./sum-award-v4.css";
import "./sum-storybook.css";
import "./ios-app.css";
import "./pico-story.css";
import "./ios-game-console.css";
import "./ios-quest-journey.css";
import "./quest-starter-controls.css";
import "./auth-portal.css";

export const metadata: Metadata = {
  applicationName: "Summon World",
  title: "SUM — Make Reality Summonable",
  description:
    "Summon quests, invite challengers, submit proof, and let AI familiars referee the result.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Summon World",
  },
  icons: {
    apple: "/apple-touch-icon.png",
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FFF8F2",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html data-scroll-behavior="smooth" lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* Suppress MetaMask / wallet extension "Cannot redefine property: ethereum" errors */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try {
                  window.addEventListener("error", function(e){
                    if(e.message && (e.message.indexOf("ethereum")!==-1 || (e.filename && e.filename.indexOf("chrome-extension")!==-1))){
                      e.stopImmediatePropagation();
                      e.preventDefault();
                    }
                  }, true);
                  window.addEventListener("unhandledrejection", function(e){
                    var r = e.reason && (e.reason.message || String(e.reason));
                    if(r && r.indexOf("ethereum")!==-1){
                      e.preventDefault();
                    }
                  }, true);
                } catch(_){}
              })();
            `,
          }}
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Montserrat:wght@300;400;600;700&family=Fraunces:ital,opsz,wght@0,9..144,400;1,9..144,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Nunito:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-screen antialiased sum-storybook-body"
        style={{
          background: "var(--sum-sky)",
          color: "var(--sum-ink)",
        }}
      >
        <Providers><ErrorBoundary>{children}</ErrorBoundary><QuestAppNav /></Providers>
        <EntryPolicyLinks />
      </body>
    </html>
  );
}
