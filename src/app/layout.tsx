import type { Metadata, Viewport } from "next";
import Providers from "@/components/Providers";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "LuckyPlay — Your Playful Predictor",
  description:
    "Cute, friendly prediction play. Make a call, stake your credits, let the AI judge — win with fun.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#EAF4FB",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Nunito:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="min-h-screen antialiased"
        style={{
          background:
            "linear-gradient(160deg, #EAF4FB 0%, #F4FBF8 45%, #FFF8E7 100%)",
          color: "#1F3A5F",
        }}
      >
        <Providers><ErrorBoundary>{children}</ErrorBoundary></Providers>
      </body>
    </html>
  );
}
