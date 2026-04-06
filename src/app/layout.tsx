import type { Metadata, Viewport } from "next";
import Providers from "@/components/Providers";
import ErrorBoundary from "@/components/ErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lex Divina — AI Oracle Tribunal",
  description:
    "Sacred contracts. AI judgment. Divine settlement. Challenge anyone, stake your credits, let the Oracle decide.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0A0A0B",
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
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Cinzel:wght@400;500;600;700;800;900&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased" style={{ background: "#0A0A0B" }}>
        <Providers><ErrorBoundary>{children}</ErrorBoundary></Providers>
      </body>
    </html>
  );
}
