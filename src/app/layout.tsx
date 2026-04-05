import type { Metadata, Viewport } from "next";
import Providers from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChallengeAI — AI-Powered Challenge Platform",
  description:
    "Describe a challenge. AI structures rules, finds opponents, and judges results. Stake credits, submit evidence, let the AI decide.",
};

export const viewport: Viewport = {
  themeColor: "#06060f",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased" style={{ background: "#06060f" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
