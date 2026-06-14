# TraderDiary UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild TraderDiary's frontend into the approved signal-first neutral/dark UI system without changing trading workflows or backend contracts.

**Architecture:** Introduce a shared theme provider, app shell, and reusable UI primitives first, then migrate route pages one by one out of the current monolithic page files into focused page sections. Keep existing data-fetch/store contracts intact, add a lightweight Vitest + React Testing Library harness for shell/state coverage, and finish with responsive/theme/manual verification.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, TailwindCSS v4 + CSS variables, Zustand, Lucide React, Recharts, Sonner, Vitest, React Testing Library, jsdom

---

## Working Rules

- Use `@superpowers:using-git-worktrees` before starting implementation because the current worktree is dirty.
- Use `@superpowers:test-driven-development` before each coding task.
- Use `@superpowers:verification-before-completion` before claiming the redesign is done.
- Keep backend contracts untouched unless a UI-only type fix is strictly required.
- Prefer creating focused page-section components instead of growing the existing route files further.

## File Structure

### Shell, theme, and navigation

- Modify: `frontend/app/layout.tsx`
  - Replace direct `Sidebar` layout usage with a top-level `AppShell`.
- Modify: `frontend/app/globals.css`
  - Replace current dark-only token set with neutral + dark CSS variable layers and shared component classes.
- Create: `frontend/components/providers/ThemeProvider.tsx`
  - Persist theme choice (`neutral` / `dark`) and apply `data-theme` to the document root.
- Create: `frontend/lib/theme.ts`
  - Export theme constants, storage key, and helper types.
- Create: `frontend/components/layout/AppShell.tsx`
  - Own desktop/mobile shell composition and slot page content into the shared frame.
- Modify: `frontend/components/layout/Sidebar.tsx`
  - Convert the existing sidebar into the slimmer desktop rail version that matches the new shell.
- Create: `frontend/components/layout/MobileNav.tsx`
  - Render the mobile bottom navigation.
- Create: `frontend/components/layout/ThemeToggle.tsx`
  - Toggle neutral/dark mode.
- Create: `frontend/components/layout/StatusStrip.tsx`
  - Render the shared cross-page risk/status strip.

### Shared UI primitives

- Create: `frontend/components/ui/PageHeader.tsx`
  - Standardize lightweight page headers.
- Create: `frontend/components/ui/SurfaceCard.tsx`
  - Base neutral card surface.
- Create: `frontend/components/ui/SignalCard.tsx`
  - Metric/status card with optional alert edge treatment.
- Create: `frontend/components/ui/DataTable.tsx`
  - Shared table shell for headers, rows, and numeric alignment helpers.
- Create: `frontend/components/ui/StatePanel.tsx`
  - Unified loading / empty / error / success panel treatment.
- Create: `frontend/components/ui/SegmentedControl.tsx`
  - Shared segmented controls for view/tabs/filters.
- Modify: `frontend/components/ui/SkeletonCard.tsx`
  - Align skeletons to the new component language.
- Modify: `frontend/components/ui/ConfirmModal.tsx`
  - Restyle modal surface/actions to the new token system.

### Dashboard

- Modify: `frontend/app/page.tsx`
- Create: `frontend/components/dashboard/DashboardStatusBoard.tsx`
- Create: `frontend/components/dashboard/DashboardSummaryGrid.tsx`
- Create: `frontend/components/dashboard/DashboardRecentTrades.tsx`
- Create: `frontend/components/dashboard/DashboardAccountsTable.tsx`

### Accounts and funds

- Modify: `frontend/app/accounts/page.tsx`
- Modify: `frontend/app/funds/page.tsx`
- Create: `frontend/components/accounts/AccountsToolbar.tsx`
- Create: `frontend/components/accounts/AccountsSummaryStrip.tsx`
- Create: `frontend/components/accounts/AccountsTable.tsx`
- Modify: `frontend/components/accounts/AccountCard.tsx`
- Modify: `frontend/components/accounts/EditAccountModal.tsx`
- Modify: `frontend/components/forms/AddAccountForm.tsx`
- Create: `frontend/components/funds/FundsSummaryStrip.tsx`
- Create: `frontend/components/funds/FundsRegistryTable.tsx`

### Trading

- Modify: `frontend/app/trading/page.tsx`
- Create: `frontend/components/trading/TradingStatusStrip.tsx`
- Create: `frontend/components/trading/TradingFormPanel.tsx`
- Create: `frontend/components/trading/TradingContextPanel.tsx`
- Create: `frontend/components/trading/ExecutionPreviewTable.tsx`
- Modify: `frontend/components/trading/TradePresets.tsx`
- Modify: `frontend/components/ui/PriceAlertsPanel.tsx`
- Modify: `frontend/components/ui/SessionClock.tsx`

### Analytics

- Modify: `frontend/app/analytics/page.tsx`
- Create: `frontend/components/analytics/AnalyticsToolbar.tsx`
- Create: `frontend/components/analytics/AnalyticsOverviewSection.tsx`
- Create: `frontend/components/analytics/AnalyticsJournalSection.tsx`
- Create: `frontend/components/analytics/AnalyticsCalendarSection.tsx`
- Modify: `frontend/components/analytics/FundAccountCard.tsx`
- Modify: `frontend/components/analytics/SymbolHeatmap.tsx`
- Modify: `frontend/components/analytics/TradingCalendar.tsx`
- Modify: `frontend/components/ui/NewsCalendar.tsx`

### Test/config files

- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/test/setup.ts`
- Create: `frontend/components/providers/__tests__/ThemeProvider.test.tsx`
- Create: `frontend/components/layout/__tests__/AppShell.test.tsx`
- Create: `frontend/components/ui/__tests__/SignalCard.test.tsx`
- Create: `frontend/components/ui/__tests__/StatePanel.test.tsx`
- Create: `frontend/components/accounts/__tests__/AccountsTable.test.tsx`
- Create: `frontend/components/trading/__tests__/ExecutionPreviewTable.test.tsx`
- Create: `frontend/components/analytics/__tests__/AnalyticsOverviewSection.test.tsx`

## Task 0: Create An Isolated Worktree

**Files:**
- Modify: none
- Test: none

- [ ] **Step 1: Inspect the current worktree and confirm it is dirty**

Run: `git status --short`
Expected: Existing modified/untracked files appear; do not implement in-place.

- [ ] **Step 2: Create an isolated feature worktree**

Run: `git worktree add ..\TraderDiary-ui-redesign -b feature/ui-redesign`
Expected: New sibling worktree is created and checked out on `feature/ui-redesign`.

- [ ] **Step 3: Open the new worktree and confirm the spec + plan exist there**

Run: `Get-ChildItem ..\TraderDiary-ui-redesign\docs\superpowers\specs`
Expected: `2026-04-01-traderdiary-ui-redesign-design.md` is present.

- [ ] **Step 4: Commit the empty worktree setup if needed**

```bash
git status --short
```

Expected: Clean tree in the new worktree before coding begins.

## Task 1: Add Frontend Test Harness And Theme Persistence

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/test/setup.ts`
- Create: `frontend/lib/theme.ts`
- Create: `frontend/components/providers/ThemeProvider.tsx`
- Test: `frontend/components/providers/__tests__/ThemeProvider.test.tsx`

- [ ] **Step 1: Add test dependencies and scripts**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "jsdom": "^25.0.1",
    "vitest": "^2.1.8"
  }
}
```

Run: `npm install`
Expected: Lockfile updated and no install errors.

- [ ] **Step 2: Add the Vitest config and shared setup**

```ts
// frontend/vitest.config.ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

```ts
// frontend/test/setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Write the failing theme-provider test**

```tsx
// frontend/components/providers/__tests__/ThemeProvider.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, useTheme } from "@/components/providers/ThemeProvider";

function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <span>{theme}</span>
      <button onClick={() => setTheme("dark")}>dark</button>
    </>
  );
}

test("defaults to neutral and persists dark mode", async () => {
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>
  );

  expect(screen.getByText("neutral")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "dark" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(window.localStorage.getItem("traderdiary-theme")).toBe("dark");
});
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `npm run test -- ThemeProvider.test.tsx`
Expected: FAIL because `ThemeProvider` and `useTheme` do not exist yet.

- [ ] **Step 5: Implement the minimal theme layer**

```ts
// frontend/lib/theme.ts
export const THEME_STORAGE_KEY = "traderdiary-theme";
export const THEMES = ["neutral", "dark"] as const;
export type ThemeName = (typeof THEMES)[number];
```

```tsx
// frontend/components/providers/ThemeProvider.tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { THEME_STORAGE_KEY, ThemeName } from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (value: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("neutral");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeName | null;
    const nextTheme = stored ?? "neutral";
    document.documentElement.dataset.theme = nextTheme;
    setThemeState(nextTheme);
  }, []);

  const setTheme = (value: ThemeName) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, value);
    document.documentElement.dataset.theme = value;
    setThemeState(value);
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
```

- [ ] **Step 6: Re-run tests and lint**

Run: `npm run test -- ThemeProvider.test.tsx`
Expected: PASS

Run: `npm run lint`
Expected: PASS or only pre-existing unrelated warnings.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/test/setup.ts frontend/lib/theme.ts frontend/components/providers/ThemeProvider.tsx frontend/components/providers/__tests__/ThemeProvider.test.tsx
git commit -m "test: add frontend theme test harness"
```

## Task 2: Build The Shared App Shell

**Files:**
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/globals.css`
- Modify: `frontend/components/layout/Sidebar.tsx`
- Create: `frontend/components/layout/AppShell.tsx`
- Create: `frontend/components/layout/MobileNav.tsx`
- Create: `frontend/components/layout/ThemeToggle.tsx`
- Create: `frontend/components/layout/StatusStrip.tsx`
- Test: `frontend/components/layout/__tests__/AppShell.test.tsx`

- [ ] **Step 1: Write the failing shell test**

```tsx
// frontend/components/layout/__tests__/AppShell.test.tsx
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import AppShell from "@/components/layout/AppShell";

test("renders shared navigation and the page slot", () => {
  render(
    <ThemeProvider>
      <AppShell statusItems={[]} pageTitle="Dashboard">
        <div>page-body</div>
      </AppShell>
    </ThemeProvider>
  );

  expect(screen.getByText("TraderDiary")).toBeInTheDocument();
  expect(screen.getByText("page-body")).toBeInTheDocument();
  expect(screen.getByLabelText("Theme toggle")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- AppShell.test.tsx`
Expected: FAIL because `AppShell` does not exist yet.

- [ ] **Step 3: Implement the shell components**

```tsx
// frontend/components/layout/AppShell.tsx
"use client";

import Sidebar from "@/components/layout/Sidebar";
import MobileNav from "@/components/layout/MobileNav";
import ThemeToggle from "@/components/layout/ThemeToggle";
import StatusStrip, { type StatusItem } from "@/components/layout/StatusStrip";

export default function AppShell({
  children,
  statusItems,
  pageTitle,
}: {
  children: React.ReactNode;
  statusItems: StatusItem[];
  pageTitle: string;
}) {
  return (
    <div className="td-shell">
      <Sidebar />
      <div className="td-shell__main">
        <header className="td-shell__header">
          <div className="td-shell__title">{pageTitle}</div>
          <ThemeToggle />
        </header>
        <StatusStrip items={statusItems} />
        <main className="td-shell__content">{children}</main>
        <MobileNav />
      </div>
    </div>
  );
}
```

```tsx
// frontend/components/layout/ThemeToggle.tsx
"use client";

import { useTheme } from "@/components/providers/ThemeProvider";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === "neutral" ? "dark" : "neutral";
  return (
    <button aria-label="Theme toggle" onClick={() => setTheme(next)}>
      {theme === "neutral" ? "Dark mode" : "Neutral mode"}
    </button>
  );
}
```

- [ ] **Step 4: Replace the old layout wrapper**

```tsx
// frontend/app/layout.tsx
import { ThemeProvider } from "@/components/providers/ThemeProvider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

Also add the new neutral/dark token layers and shell utility classes in `frontend/app/globals.css`.

- [ ] **Step 5: Re-run tests and lint**

Run: `npm run test -- AppShell.test.tsx`
Expected: PASS

Run: `npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/app/layout.tsx frontend/app/globals.css frontend/components/layout/Sidebar.tsx frontend/components/layout/AppShell.tsx frontend/components/layout/MobileNav.tsx frontend/components/layout/ThemeToggle.tsx frontend/components/layout/StatusStrip.tsx frontend/components/layout/__tests__/AppShell.test.tsx
git commit -m "feat: add shared app shell"
```

## Task 3: Create Shared UI Primitives And State Panels

**Files:**
- Create: `frontend/components/ui/PageHeader.tsx`
- Create: `frontend/components/ui/SurfaceCard.tsx`
- Create: `frontend/components/ui/SignalCard.tsx`
- Create: `frontend/components/ui/DataTable.tsx`
- Create: `frontend/components/ui/StatePanel.tsx`
- Create: `frontend/components/ui/SegmentedControl.tsx`
- Modify: `frontend/components/ui/SkeletonCard.tsx`
- Modify: `frontend/components/ui/ConfirmModal.tsx`
- Test: `frontend/components/ui/__tests__/SignalCard.test.tsx`
- Test: `frontend/components/ui/__tests__/StatePanel.test.tsx`

- [ ] **Step 1: Write the failing primitive tests**

```tsx
// frontend/components/ui/__tests__/SignalCard.test.tsx
import { render, screen } from "@testing-library/react";
import SignalCard from "@/components/ui/SignalCard";

test("renders alert variant styling", () => {
  render(<SignalCard title="Daily DD" tone="danger" value="4.1%" subtitle="limit close" />);
  expect(screen.getByText("Daily DD")).toBeInTheDocument();
  expect(screen.getByTestId("signal-card")).toHaveAttribute("data-tone", "danger");
});
```

```tsx
// frontend/components/ui/__tests__/StatePanel.test.tsx
import { render, screen } from "@testing-library/react";
import StatePanel from "@/components/ui/StatePanel";

test("renders empty-state CTA content", () => {
  render(<StatePanel kind="empty" title="No accounts" body="Add the first account" ctaLabel="Add account" />);
  expect(screen.getByRole("button", { name: "Add account" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test -- SignalCard.test.tsx StatePanel.test.tsx`
Expected: FAIL because the new primitives do not exist yet.

- [ ] **Step 3: Implement the shared UI layer**

```tsx
// frontend/components/ui/SignalCard.tsx
export default function SignalCard({
  title,
  value,
  subtitle,
  tone = "default",
}: {
  title: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  tone?: "default" | "danger" | "warning" | "success";
}) {
  return (
    <section data-testid="signal-card" data-tone={tone} className={`td-signal-card td-signal-card--${tone}`}>
      <span className="td-signal-card__title">{title}</span>
      <strong className="td-signal-card__value">{value}</strong>
      {subtitle ? <span className="td-signal-card__subtitle">{subtitle}</span> : null}
    </section>
  );
}
```

```tsx
// frontend/components/ui/StatePanel.tsx
export default function StatePanel({
  kind,
  title,
  body,
  ctaLabel,
  onCta,
}: {
  kind: "loading" | "empty" | "error" | "success";
  title: string;
  body: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <section className={`td-state-panel td-state-panel--${kind}`}>
      <h3>{title}</h3>
      <p>{body}</p>
      {ctaLabel ? <button onClick={onCta}>{ctaLabel}</button> : null}
    </section>
  );
}
```

Implement `PageHeader`, `SurfaceCard`, `DataTable`, and `SegmentedControl` in the same pass so later page tasks only compose them.

- [ ] **Step 4: Update the modal and skeleton to consume the new styles**

Use `SurfaceCard`/shared class names inside:

- `frontend/components/ui/SkeletonCard.tsx`
- `frontend/components/ui/ConfirmModal.tsx`

- [ ] **Step 5: Re-run tests and lint**

Run: `npm run test -- SignalCard.test.tsx StatePanel.test.tsx`
Expected: PASS

Run: `npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/components/ui/PageHeader.tsx frontend/components/ui/SurfaceCard.tsx frontend/components/ui/SignalCard.tsx frontend/components/ui/DataTable.tsx frontend/components/ui/StatePanel.tsx frontend/components/ui/SegmentedControl.tsx frontend/components/ui/SkeletonCard.tsx frontend/components/ui/ConfirmModal.tsx frontend/components/ui/__tests__/SignalCard.test.tsx frontend/components/ui/__tests__/StatePanel.test.tsx
git commit -m "feat: add shared UI primitives"
```

## Task 4: Redesign Dashboard Around The Signal Board

**Files:**
- Modify: `frontend/app/page.tsx`
- Create: `frontend/components/dashboard/DashboardStatusBoard.tsx`
- Create: `frontend/components/dashboard/DashboardSummaryGrid.tsx`
- Create: `frontend/components/dashboard/DashboardRecentTrades.tsx`
- Create: `frontend/components/dashboard/DashboardAccountsTable.tsx`
- Test: `frontend/components/dashboard/__tests__/DashboardStatusBoard.test.tsx`

- [ ] **Step 1: Write the failing dashboard status-board test**

```tsx
// frontend/components/dashboard/__tests__/DashboardStatusBoard.test.tsx
import { render, screen } from "@testing-library/react";
import DashboardStatusBoard from "@/components/dashboard/DashboardStatusBoard";

test("renders warnings before healthy summary cards", () => {
  render(
    <DashboardStatusBoard
      warningsCount={2}
      fundedCount={3}
      totalAccounts={5}
      totalBalance={120000}
      totalPnl={-430}
    />
  );

  expect(screen.getByText(/2 need attention/i)).toBeInTheDocument();
  expect(screen.getByText(/total balance/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- DashboardStatusBoard.test.tsx`
Expected: FAIL because the component does not exist yet.

- [ ] **Step 3: Split the route into focused dashboard sections**

```tsx
// frontend/components/dashboard/DashboardStatusBoard.tsx
import SignalCard from "@/components/ui/SignalCard";

export default function DashboardStatusBoard(props: {
  warningsCount: number;
  fundedCount: number;
  totalAccounts: number;
  totalBalance: number;
  totalPnl: number;
}) {
  return (
    <div className="td-signal-grid">
      <SignalCard title="Needs Attention" tone={props.warningsCount > 0 ? "danger" : "success"} value={props.warningsCount} />
      <SignalCard title="Accounts" value={props.totalAccounts} subtitle={`${props.fundedCount} funded`} />
      <SignalCard title="Total Balance" tone="success" value={`$${props.totalBalance.toLocaleString()}`} />
      <SignalCard title="Floating P&L" tone={props.totalPnl >= 0 ? "success" : "danger"} value={props.totalPnl} />
    </div>
  );
}
```

Create the other dashboard sections and convert `frontend/app/page.tsx` into a thin container that:

- fetches the same data it does today
- builds `statusItems` for `AppShell`
- renders the new dashboard section components

- [ ] **Step 4: Convert loading and empty states to `StatePanel` + dashboard-shaped skeletons**

Replace the current generic shimmer blocks in `frontend/app/page.tsx` with layout-shaped loading and empty views that use the shared primitive styles.

- [ ] **Step 5: Re-run tests and lint**

Run: `npm run test -- DashboardStatusBoard.test.tsx`
Expected: PASS

Run: `npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/app/page.tsx frontend/components/dashboard/DashboardStatusBoard.tsx frontend/components/dashboard/DashboardSummaryGrid.tsx frontend/components/dashboard/DashboardRecentTrades.tsx frontend/components/dashboard/DashboardAccountsTable.tsx frontend/components/dashboard/__tests__/DashboardStatusBoard.test.tsx
git commit -m "feat: redesign dashboard signal board"
```

## Task 5: Make Accounts And Funds Registry-First

**Files:**
- Modify: `frontend/app/accounts/page.tsx`
- Modify: `frontend/app/funds/page.tsx`
- Modify: `frontend/components/accounts/AccountCard.tsx`
- Modify: `frontend/components/accounts/EditAccountModal.tsx`
- Modify: `frontend/components/forms/AddAccountForm.tsx`
- Create: `frontend/components/accounts/AccountsToolbar.tsx`
- Create: `frontend/components/accounts/AccountsSummaryStrip.tsx`
- Create: `frontend/components/accounts/AccountsTable.tsx`
- Create: `frontend/components/funds/FundsSummaryStrip.tsx`
- Create: `frontend/components/funds/FundsRegistryTable.tsx`
- Test: `frontend/components/accounts/__tests__/AccountsTable.test.tsx`

- [ ] **Step 1: Write the failing accounts-table test**

```tsx
// frontend/components/accounts/__tests__/AccountsTable.test.tsx
import { render, screen } from "@testing-library/react";
import AccountsTable from "@/components/accounts/AccountsTable";

test("shows account health and actions in the desktop registry view", () => {
  render(
    <AccountsTable
      rows={[
        {
          id: 1,
          account_id: "1001",
          server: "Demo-Server",
          account_type: "fund",
          balance: 25000,
          equity: 24850,
          profit: -150,
          health: "warning",
        },
      ]}
    />
  );

  expect(screen.getByText("1001")).toBeInTheDocument();
  expect(screen.getByText(/warning/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- AccountsTable.test.tsx`
Expected: FAIL because `AccountsTable` does not exist yet.

- [ ] **Step 3: Implement the accounts registry layer**

```tsx
// frontend/components/accounts/AccountsTable.tsx
import DataTable from "@/components/ui/DataTable";

export default function AccountsTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  return (
    <DataTable
      columns={["Account", "Server", "Type", "Balance", "Health", "Actions"]}
      rows={rows}
      renderRow={(row) => [
        row.account_id as React.ReactNode,
        row.server as React.ReactNode,
        row.account_type as React.ReactNode,
        row.balance as React.ReactNode,
        row.health as React.ReactNode,
        "actions",
      ]}
    />
  );
}
```

Refactor `frontend/app/accounts/page.tsx` so desktop defaults to the table-first registry, while the card view remains an optional/mobile-friendly mode.

- [ ] **Step 4: Align funds, modals, and forms to the same component language**

Update:

- `frontend/app/funds/page.tsx`
- `frontend/components/accounts/EditAccountModal.tsx`
- `frontend/components/forms/AddAccountForm.tsx`
- `frontend/components/accounts/AccountCard.tsx`

Use `PageHeader`, `SignalCard`, `StatePanel`, and shared button/field classes instead of per-file inline styling.

- [ ] **Step 5: Re-run tests and lint**

Run: `npm run test -- AccountsTable.test.tsx`
Expected: PASS

Run: `npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/app/accounts/page.tsx frontend/app/funds/page.tsx frontend/components/accounts/AccountCard.tsx frontend/components/accounts/EditAccountModal.tsx frontend/components/forms/AddAccountForm.tsx frontend/components/accounts/AccountsToolbar.tsx frontend/components/accounts/AccountsSummaryStrip.tsx frontend/components/accounts/AccountsTable.tsx frontend/components/funds/FundsSummaryStrip.tsx frontend/components/funds/FundsRegistryTable.tsx frontend/components/accounts/__tests__/AccountsTable.test.tsx
git commit -m "feat: redesign account and fund registries"
```

## Task 6: Rebuild Trading As A Confidence-First Workspace

**Files:**
- Modify: `frontend/app/trading/page.tsx`
- Create: `frontend/components/trading/TradingStatusStrip.tsx`
- Create: `frontend/components/trading/TradingFormPanel.tsx`
- Create: `frontend/components/trading/TradingContextPanel.tsx`
- Create: `frontend/components/trading/ExecutionPreviewTable.tsx`
- Modify: `frontend/components/trading/TradePresets.tsx`
- Modify: `frontend/components/ui/PriceAlertsPanel.tsx`
- Modify: `frontend/components/ui/SessionClock.tsx`
- Test: `frontend/components/trading/__tests__/ExecutionPreviewTable.test.tsx`

- [ ] **Step 1: Write the failing execution-preview test**

```tsx
// frontend/components/trading/__tests__/ExecutionPreviewTable.test.tsx
import { render, screen } from "@testing-library/react";
import ExecutionPreviewTable from "@/components/trading/ExecutionPreviewTable";

test("marks blocked rows before executable rows", () => {
  render(
    <ExecutionPreviewTable
      rows={[
        { account_id: "1001", status: "blocked", lot_size: "0.00", risk_amount: "0" },
        { account_id: "1002", status: "ok", lot_size: "0.20", risk_amount: "50" },
      ]}
    />
  );

  expect(screen.getByText(/blocked/i)).toBeInTheDocument();
  expect(screen.getByText("1002")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- ExecutionPreviewTable.test.tsx`
Expected: FAIL because the component does not exist yet.

- [ ] **Step 3: Split the trading page into workspace panels**

```tsx
// frontend/components/trading/ExecutionPreviewTable.tsx
import DataTable from "@/components/ui/DataTable";

export default function ExecutionPreviewTable({ rows }: { rows: Array<Record<string, string>> }) {
  return (
    <DataTable
      columns={["Account", "Status", "Lot", "Risk", "R:R"]}
      rows={rows}
      renderRow={(row) => [
        row.account_id as React.ReactNode,
        row.status as React.ReactNode,
        row.lot_size as React.ReactNode,
        row.risk_amount as React.ReactNode,
        row.rr_ratio ?? "--",
      ]}
    />
  );
}
```

Refactor `frontend/app/trading/page.tsx` so it composes:

- `TradingStatusStrip`
- `TradingFormPanel`
- `TradingContextPanel`
- `ExecutionPreviewTable`

and keeps the existing calculation/execution logic intact.

- [ ] **Step 4: Restyle supporting widgets**

Update:

- `frontend/components/trading/TradePresets.tsx`
- `frontend/components/ui/PriceAlertsPanel.tsx`
- `frontend/components/ui/SessionClock.tsx`

so they visually match the new workspace rather than looking like independent tools bolted onto the page.

- [ ] **Step 5: Re-run tests and lint**

Run: `npm run test -- ExecutionPreviewTable.test.tsx`
Expected: PASS

Run: `npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/app/trading/page.tsx frontend/components/trading/TradingStatusStrip.tsx frontend/components/trading/TradingFormPanel.tsx frontend/components/trading/TradingContextPanel.tsx frontend/components/trading/ExecutionPreviewTable.tsx frontend/components/trading/TradePresets.tsx frontend/components/ui/PriceAlertsPanel.tsx frontend/components/ui/SessionClock.tsx frontend/components/trading/__tests__/ExecutionPreviewTable.test.tsx
git commit -m "feat: redesign trading workspace"
```

## Task 7: Split Analytics Into Layered Review Sections

**Files:**
- Modify: `frontend/app/analytics/page.tsx`
- Modify: `frontend/components/analytics/FundAccountCard.tsx`
- Modify: `frontend/components/analytics/SymbolHeatmap.tsx`
- Modify: `frontend/components/analytics/TradingCalendar.tsx`
- Modify: `frontend/components/ui/NewsCalendar.tsx`
- Create: `frontend/components/analytics/AnalyticsToolbar.tsx`
- Create: `frontend/components/analytics/AnalyticsOverviewSection.tsx`
- Create: `frontend/components/analytics/AnalyticsJournalSection.tsx`
- Create: `frontend/components/analytics/AnalyticsCalendarSection.tsx`
- Test: `frontend/components/analytics/__tests__/AnalyticsOverviewSection.test.tsx`

- [ ] **Step 1: Write the failing analytics overview test**

```tsx
// frontend/components/analytics/__tests__/AnalyticsOverviewSection.test.tsx
import { render, screen } from "@testing-library/react";
import AnalyticsOverviewSection from "@/components/analytics/AnalyticsOverviewSection";

test("renders the overview metrics before journal detail sections", () => {
  render(
    <AnalyticsOverviewSection
      summary={{ total_trades: 42, win_rate: 58, total_profit: 1200 }}
      fundAccounts={[]}
      equityCurve={[]}
    />
  );

  expect(screen.getByText(/win rate/i)).toBeInTheDocument();
  expect(screen.getByText(/total profit/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm run test -- AnalyticsOverviewSection.test.tsx`
Expected: FAIL because `AnalyticsOverviewSection` does not exist yet.

- [ ] **Step 3: Break the route into toolbar + overview + journal + calendar sections**

```tsx
// frontend/components/analytics/AnalyticsOverviewSection.tsx
import SignalCard from "@/components/ui/SignalCard";
import SurfaceCard from "@/components/ui/SurfaceCard";

export default function AnalyticsOverviewSection({ summary }: { summary: Record<string, number> }) {
  return (
    <div className="td-analytics-overview">
      <div className="td-signal-grid">
        <SignalCard title="Win Rate" tone="success" value={`${summary.win_rate ?? 0}%`} />
        <SignalCard title="Total Profit" tone={(summary.total_profit ?? 0) >= 0 ? "success" : "danger"} value={summary.total_profit ?? 0} />
      </div>
      <SurfaceCard>overview content</SurfaceCard>
    </div>
  );
}
```

Then refactor `frontend/app/analytics/page.tsx` into a thin data container that feeds:

- `AnalyticsToolbar`
- `AnalyticsOverviewSection`
- `AnalyticsJournalSection`
- `AnalyticsCalendarSection`

- [ ] **Step 4: Restyle the analytics subcomponents**

Update:

- `frontend/components/analytics/FundAccountCard.tsx`
- `frontend/components/analytics/SymbolHeatmap.tsx`
- `frontend/components/analytics/TradingCalendar.tsx`
- `frontend/components/ui/NewsCalendar.tsx`

so they inherit the new token system and stop visually diverging from the rest of the app.

- [ ] **Step 5: Re-run tests and lint**

Run: `npm run test -- AnalyticsOverviewSection.test.tsx`
Expected: PASS

Run: `npm run lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/app/analytics/page.tsx frontend/components/analytics/FundAccountCard.tsx frontend/components/analytics/SymbolHeatmap.tsx frontend/components/analytics/TradingCalendar.tsx frontend/components/ui/NewsCalendar.tsx frontend/components/analytics/AnalyticsToolbar.tsx frontend/components/analytics/AnalyticsOverviewSection.tsx frontend/components/analytics/AnalyticsJournalSection.tsx frontend/components/analytics/AnalyticsCalendarSection.tsx frontend/components/analytics/__tests__/AnalyticsOverviewSection.test.tsx
git commit -m "feat: redesign analytics review flow"
```

## Task 8: Finish Theme Parity, Responsive Behavior, And Verification

**Files:**
- Modify: `frontend/app/globals.css`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/accounts/page.tsx`
- Modify: `frontend/app/funds/page.tsx`
- Modify: `frontend/app/trading/page.tsx`
- Modify: `frontend/app/analytics/page.tsx`
- Modify: any shell/primitive files touched in Tasks 2-7 as required
- Test: full frontend test suite

- [ ] **Step 1: Add failing tests for any uncovered shell/state regressions**

Examples:

- add a shell test for dark-mode class application
- add a `StatePanel` test for retry button visibility
- add a table test for narrow-width fallback markers

Run: `npm run test`
Expected: At least one newly added regression test fails before the fix.

- [ ] **Step 2: Fix the failing regression tests with minimal UI adjustments**

Focus on:

- responsive shell edge cases
- neutral/dark parity
- loading/empty/error consistency
- table and action density on smaller breakpoints

- [ ] **Step 3: Run the full automated verification**

Run: `npm run test`
Expected: PASS

Run: `npm run lint`
Expected: PASS

Run: `npm run build`
Expected: PASS with a production-ready Next.js build.

- [ ] **Step 4: Run manual verification in both themes**

Review all major screens in:

- neutral mode desktop
- dark mode desktop
- narrow-width/mobile simulation

Checklist:

- risk strip stays visible
- dashboard warnings lead the page
- accounts default to desktop registry
- trading blocked/warning states are obvious
- analytics feels layered instead of cluttered

- [ ] **Step 5: Commit**

```bash
git add frontend/app/globals.css frontend/app/page.tsx frontend/app/accounts/page.tsx frontend/app/funds/page.tsx frontend/app/trading/page.tsx frontend/app/analytics/page.tsx frontend/components frontend/lib frontend/test frontend/vitest.config.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: finalize traderdiary ui redesign"
```

## Plan Self-Review

Because subagent delegation was not explicitly authorized in this session, this plan was reviewed inline against the same criteria as `plan-document-reviewer-prompt.md`.

### Review Result

**Status:** Approved

**Checks passed:**

- No placeholder tasks or unresolved scope blockers
- Plan aligns with the approved spec and keeps workflow/backend contracts intact
- Task boundaries are buildable and ordered from infrastructure to page migrations to verification
- Testing and verification paths are explicit, including adding the missing frontend test harness first
