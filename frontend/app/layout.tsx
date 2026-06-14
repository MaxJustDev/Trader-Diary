import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import Sidebar from "@/components/layout/Sidebar";
import StreamProvider from "@/components/providers/StreamProvider";
import ErrorBoundary from "@/components/providers/ErrorBoundary";
import { Sora, JetBrains_Mono } from "next/font/google";

const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-sora",
  display: "swap",
});

const jbMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-jbmono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TraderDiary — MT5 Manager",
  description: "Manage multiple MT5 accounts and execute batch trades",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${jbMono.variable}`}>
        <ErrorBoundary>
          <StreamProvider>
            <div style={{ minHeight: "100vh", display: "flex", position: "relative", zIndex: 1 }}>
              <Sidebar />
              <main style={{ flex: 1, minWidth: 0 }}>
                <ErrorBoundary>
                  {children}
                </ErrorBoundary>
              </main>
            </div>
          </StreamProvider>
        </ErrorBoundary>
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              background: "#0c1018",
              border: "1px solid rgba(255,255,255,0.09)",
              color: "#e2e8f0",
              fontFamily: "var(--font-sora), sans-serif",
              fontSize: "13px",
            },
          }}
        />
      </body>
    </html>
  );
}
