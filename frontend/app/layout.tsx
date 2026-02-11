import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

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
      <body className={`${inter.className} bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100`}>
        <div className="min-h-screen flex">
          {/* Sidebar */}
          <aside className="w-64 bg-white dark:bg-gray-800 shadow-lg">
            <div className="p-6">
              <h1 className="text-2xl font-bold text-blue-600">📊 TraderDiary</h1>
              <p className="text-xs text-gray-500 mt-1">MT5 Account Manager</p>
            </div>
            <nav className="px-4 pb-4">
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/"
                    className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span>🏠</span>
                    <span>Dashboard</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/accounts"
                    className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span>👤</span>
                    <span>Accounts</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/funds"
                    className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span>📊</span>
                    <span>Funds</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/trading"
                    className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span>💹</span>
                    <span>Batch Trading</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/analytics"
                    className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span>📈</span>
                    <span>Analytics</span>
                  </Link>
                </li>
              </ul>
            </nav>
            <div className="absolute bottom-0 w-64 p-4 border-t dark:border-gray-700">
              <p className="text-xs text-gray-400 text-center">TraderDiary MVP v1.0</p>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
