import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import Sidebar from "@/components/layout/Sidebar";
import StreamProvider from "@/components/providers/StreamProvider";
import ErrorBoundary from "@/components/providers/ErrorBoundary";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TraderDiary - MT5 Account Manager",
  description: "Manage multiple MT5 accounts and execute batch trades",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#0f1117] text-slate-100`}>
        <ErrorBoundary>
          <StreamProvider>
            <div className="min-h-screen flex">
              <Sidebar />
              <main className="flex-1 overflow-auto">
                <ErrorBoundary>
                  {children}
                </ErrorBoundary>
              </main>
            </div>
          </StreamProvider>
        </ErrorBoundary>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
