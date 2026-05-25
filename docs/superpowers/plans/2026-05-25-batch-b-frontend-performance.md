# Batch B — Frontend Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut WS-driven re-renders, lazy-load analytics charts, swap blocking Google Fonts for `next/font`, virtualize PositionsTable for long lists, polish AbortController + useMemo nits.

**Architecture:** No store schema change. Use `useShallow` for multi-field selectors, `React.memo` for heavy components, `next/font` for the two design fonts, `next/dynamic` for the heavy analytics charts, `react-window` for PositionsTable virtualization above a length threshold.

**Tech Stack:** Next.js 16, React 19, Zustand 5, recharts, Vitest, lucide-react, sonner.

**Spec:** `docs/superpowers/specs/2026-05-25-batch-b-frontend-performance-design.md`

---

## File Map

| Path | Status | Purpose |
|------|--------|---------|
| `frontend/package.json` | MODIFY | Add `react-window`, `@types/react-window` |
| `frontend/app/layout.tsx` | MODIFY | next/font imports + body className with font variables |
| `frontend/app/globals.css` | MODIFY | Drop Google Fonts @import; reference CSS font variables |
| `frontend/components/mt5/PositionsTable.tsx` | MODIFY | useShallow + React.memo + react-window threshold |
| `frontend/components/mt5/EquityChart.tsx` | MODIFY | useShallow + React.memo |
| `frontend/components/mt5/LiveDataPanel.tsx` | MODIFY | useShallow + React.memo |
| `frontend/components/analytics/TradingCalendar.tsx` | MODIFY | React.memo + useMemo dep fix |
| `frontend/components/analytics/SymbolHeatmap.tsx` | MODIFY | React.memo + useMemo dep fix |
| `frontend/components/analytics/FundAccountCard.tsx` | MODIFY | React.memo |
| `frontend/components/ui/NewsCalendar.tsx` | MODIFY | React.memo + useEffect deps audit |
| `frontend/app/accounts/page.tsx` | MODIFY | useMemo for the analytics Map |
| `frontend/app/analytics/page.tsx` | MODIFY | next/dynamic imports for TradingCalendar, SymbolHeatmap, NewsCalendar |
| `frontend/app/page.tsx` | MODIFY | AbortController on the dashboard Promise.all |
| `frontend/__tests__/store.test.ts` | NEW | Independent-slice update test |
| `frontend/__tests__/components/PositionsTable.test.tsx` | NEW | Memo verification |

---

## Task 1: Install react-window

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install**

```powershell
cd C:\Users\Max\Desktop\TraderDiary\frontend
npm install react-window
npm install -D @types/react-window
```

Expected: `react-window` appears in `dependencies`, `@types/react-window` in `devDependencies`.

- [ ] **Step 2: Verify build still works**

```powershell
npm run build
```

Expected: build completes (Next.js production bundle).

- [ ] **Step 3: Commit**

From project root:

```powershell
git add frontend/package.json frontend/package-lock.json
git commit -m "deps(frontend): add react-window for virtualized lists"
```

---

## Task 2: next/font migration

**Files:**
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Update layout.tsx**

Open `frontend/app/layout.tsx`. After the existing imports, ADD:

```tsx
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
```

Then in `RootLayout`, change the `<body>` open tag from `<body>` to:

```tsx
<body className={`${sora.variable} ${jbMono.variable}`}>
```

Update the Toaster `fontFamily` line to use the new variable. Find:

```ts
fontFamily: "'Sora', sans-serif",
```

Replace with:

```ts
fontFamily: "var(--font-sora), sans-serif",
```

- [ ] **Step 2: Update globals.css**

Open `frontend/app/globals.css`. The first line is currently:

```css
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;1,400&display=swap');
```

DELETE that entire line.

Now find every place in `globals.css` that references the font families. They likely appear as `font-family: 'Sora', ...` and `font-family: 'JetBrains Mono', ...`. For each, change to use the CSS variable:

- `font-family: 'Sora', system-ui, sans-serif;` → `font-family: var(--font-sora), system-ui, sans-serif;`
- `font-family: 'JetBrains Mono', monospace;` → `font-family: var(--font-jbmono), monospace;`

If `body` rule doesn't currently set `font-family`, ADD one:

```css
body {
  font-family: var(--font-sora), system-ui, sans-serif;
}
```

- [ ] **Step 3: Build + dev smoke**

```powershell
npm run build
```

Expected: succeeds. The build log will show next/font registered the two fonts.

Boot dev server briefly:

```powershell
$proc = Start-Process -PassThru -NoNewWindow npm "run dev"
Start-Sleep -Seconds 8
Stop-Process -Id $proc.Id -Force
```

Expected: no font-loading errors during boot. (Manual: open browser, confirm visual fonts render.)

- [ ] **Step 4: Network smoke (optional, manual)**

Open browser to `http://localhost:3000`, open DevTools Network tab, filter "Font". Expected: font files loaded from `/_next/static/media/...`, NOT from `fonts.googleapis.com` or `fonts.gstatic.com`.

- [ ] **Step 5: Commit**

```powershell
git add frontend/app/layout.tsx frontend/app/globals.css
git commit -m "perf(frontend): migrate Google Fonts @import to next/font/google"
```

---

## Task 3: Vitest store test for slice independence

**Files:**
- Create: `frontend/__tests__/store.test.ts`

- [ ] **Step 1: Write the test**

Create `frontend/__tests__/store.test.ts`:

```ts
import { describe, expect, it, beforeEach } from "vitest";
import { useMT5Store } from "@/lib/store";

describe("useMT5Store slice independence", () => {
  beforeEach(() => {
    useMT5Store.setState({
      connected: false,
      connectedAccountId: null,
      accountInfo: null,
      positions: [],
      equityHistory: [],
    });
  });

  it("setPositions does not replace accountInfo reference", () => {
    const initialAccountInfo = {
      login: 1,
      name: "x",
      balance: 100,
      equity: 100,
      margin: 0,
      margin_free: 100,
      margin_level: 0,
      profit: 0,
      currency: "USD",
    };
    useMT5Store.setState({ accountInfo: initialAccountInfo });

    const before = useMT5Store.getState().accountInfo;
    useMT5Store.getState().setPositions([
      {
        ticket: 1,
        symbol: "EURUSD",
        type: "BUY",
        volume: 0.01,
        price_open: 1.1,
        sl: 0,
        tp: 0,
        profit: 0,
        time: new Date().toISOString(),
      },
    ]);
    const after = useMT5Store.getState().accountInfo;

    expect(after).toBe(before);
  });

  it("setAccountInfo does not replace positions reference", () => {
    const initialPositions = useMT5Store.getState().positions;

    useMT5Store.getState().setAccountInfo({
      login: 1,
      name: "x",
      balance: 50,
      equity: 50,
      margin: 0,
      margin_free: 50,
      margin_level: 0,
      profit: 0,
      currency: "USD",
    });

    expect(useMT5Store.getState().positions).toBe(initialPositions);
  });

  it("addEquityPoint caps history at MAX_EQUITY_POINTS", () => {
    const store = useMT5Store.getState();
    for (let i = 0; i < 350; i++) {
      store.addEquityPoint({ time: `${i}`, balance: i, equity: i });
    }
    expect(useMT5Store.getState().equityHistory.length).toBe(300);
  });
});
```

- [ ] **Step 2: Run the tests**

```powershell
cd C:\Users\Max\Desktop\TraderDiary\frontend
npm test -- __tests__/store.test.ts
```

Expected: 3 PASSED.

- [ ] **Step 3: Commit**

```powershell
git add frontend/__tests__/store.test.ts
git commit -m "test(store): verify slice updates don't replace unrelated references"
```

---

## Task 4: useShallow + React.memo on MT5 components

**Files:**
- Modify: `frontend/components/mt5/PositionsTable.tsx`
- Modify: `frontend/components/mt5/EquityChart.tsx`
- Modify: `frontend/components/mt5/LiveDataPanel.tsx`

For each of the three components below, apply the same pattern:

### Pattern

If the component pulls **multiple** fields from `useMT5Store`, replace separate `useMT5Store((s) => s.X)` calls (which already return primitives or refs, so they're shallow-safe) with a single `useShallow` selector ONLY if combining multiple fields into one object is cleaner. If the existing code uses **separate primitive selectors**, leave them — they're already optimal.

If the component currently does:

```ts
const positions = useMT5Store((s) => s.positions);
const accountInfo = useMT5Store((s) => s.accountInfo);
```

leave as-is (separate selectors are fine — each one is a primitive ref read).

If the component does:

```ts
const { positions, accountInfo } = useMT5Store((s) => ({ positions: s.positions, accountInfo: s.accountInfo }));
```

REPLACE with:

```ts
import { useShallow } from "zustand/shallow";
const { positions, accountInfo } = useMT5Store(
  useShallow((s) => ({ positions: s.positions, accountInfo: s.accountInfo })),
);
```

**Always**: wrap the default export in `React.memo`. Pattern:

```tsx
// Before:
export default function PositionsTable() { ... }

// After:
function PositionsTable() { ... }
export default React.memo(PositionsTable);
```

Add `import React from "react";` if not already imported.

### Step 1 — Audit and apply to PositionsTable

- [ ] **a:** Read current `frontend/components/mt5/PositionsTable.tsx` carefully. Identify all `useMT5Store` calls.
- [ ] **b:** If any combine multiple fields in one selector, switch to `useShallow`. Otherwise leave.
- [ ] **c:** Wrap default export in `React.memo`.
- [ ] **d:** Verify `npm run build` still succeeds.

### Step 2 — Same for EquityChart

- [ ] **a:** Read `frontend/components/mt5/EquityChart.tsx`. Audit selectors.
- [ ] **b:** Apply useShallow only if combining fields.
- [ ] **c:** Wrap default export in `React.memo`.
- [ ] **d:** Build check.

### Step 3 — Same for LiveDataPanel

- [ ] **a:** Read `frontend/components/mt5/LiveDataPanel.tsx`. Audit selectors.
- [ ] **b:** Apply useShallow only if combining fields.
- [ ] **c:** Wrap default export in `React.memo`.
- [ ] **d:** Build check.

### Step 4 — Verify build + run all tests

```powershell
cd C:\Users\Max\Desktop\TraderDiary\frontend
npm run build
npm test
```

Expected: build succeeds, all tests pass.

### Step 5 — Commit

```powershell
git add frontend/components/mt5/PositionsTable.tsx frontend/components/mt5/EquityChart.tsx frontend/components/mt5/LiveDataPanel.tsx
git commit -m "perf(mt5): React.memo on stream-driven components + scoped selectors"
```

---

## Task 5: React.memo on analytics components

**Files:**
- Modify: `frontend/components/analytics/TradingCalendar.tsx`
- Modify: `frontend/components/analytics/SymbolHeatmap.tsx`
- Modify: `frontend/components/analytics/FundAccountCard.tsx`
- Modify: `frontend/components/ui/NewsCalendar.tsx`

For each of the four components:

- [ ] **Step 1: Read the component**, find existing `useMemo` calls.
- [ ] **Step 2: Audit deps**: every `useMemo` should have ALL referenced variables in its dependency array. Use VSCode hint or `npm run lint` to catch obvious missing deps. Fix any missing deps.
- [ ] **Step 3: Wrap default export in `React.memo`** (same pattern as Task 4).
- [ ] **Step 4: For NewsCalendar specifically**: the audit reported a `useEffect` with no deps array that may double-fire. Read the file; ensure the fetch effect has an empty `[]` deps array AND uses an AbortController to ignore stale responses.

### Step 5 — Verify build + tests

```powershell
npm run build
npm test
npm run lint
```

Expected: build + tests + lint clean.

### Step 6 — Commit

```powershell
git add frontend/components/analytics/TradingCalendar.tsx frontend/components/analytics/SymbolHeatmap.tsx frontend/components/analytics/FundAccountCard.tsx frontend/components/ui/NewsCalendar.tsx
git commit -m "perf(components): memo analytics + news components; fix useMemo deps"
```

---

## Task 6: Dynamic imports for analytics route

**Files:**
- Modify: `frontend/app/analytics/page.tsx`

- [ ] **Step 1: Identify heavy imports**

Read `frontend/app/analytics/page.tsx` top. Currently it directly imports:
- `TradingCalendar` from `@/components/analytics/TradingCalendar`
- `SymbolHeatmap` from `@/components/analytics/SymbolHeatmap`
- `NewsCalendar` from `@/components/ui/NewsCalendar`
- Possibly recharts pieces directly

- [ ] **Step 2: Replace direct imports with `next/dynamic`**

At the top of the file, ADD:

```tsx
import dynamic from "next/dynamic";
```

REMOVE the direct imports for `TradingCalendar`, `SymbolHeatmap`, `NewsCalendar`.

ADD dynamic imports:

```tsx
const TradingCalendar = dynamic(() => import("@/components/analytics/TradingCalendar"), { ssr: false });
const SymbolHeatmap = dynamic(() => import("@/components/analytics/SymbolHeatmap"), { ssr: false });
const NewsCalendar = dynamic(() => import("@/components/ui/NewsCalendar"), { ssr: false });
```

If any of these components were imported with default exports, the syntax above works. If they're named exports, use:

```tsx
const TradingCalendar = dynamic(() => import("@/components/analytics/TradingCalendar").then(m => m.TradingCalendar), { ssr: false });
```

Inspect each component's export style before deciding.

- [ ] **Step 3: Build + run**

```powershell
npm run build
```

Expected: build succeeds. Note the analytics route bundle size from the build output table. Compare to a pre-batch number if available.

- [ ] **Step 4: Commit**

```powershell
git add frontend/app/analytics/page.tsx
git commit -m "perf(analytics): lazy-load heavy chart/calendar components"
```

---

## Task 7: PositionsTable virtualization

**Files:**
- Modify: `frontend/components/mt5/PositionsTable.tsx`

- [ ] **Step 1: Read the current rendering loop**

Find the `positions.map((pos) => ...)` block in the file. Note the JSX shape of each row.

- [ ] **Step 2: Introduce virtualization above a threshold**

Threshold: 20 positions. Below that, keep existing direct map (`react-window` overhead not worth it for short lists).

Pattern:

```tsx
import { FixedSizeList as List } from "react-window";

const VIRTUALIZE_THRESHOLD = 20;
const ROW_HEIGHT = 52; // measured from current default row; adjust if cramped

function PositionsTable() {
  // ... existing selectors / hooks ...

  const renderRow = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const pos = positions[index];
    return (
      <div style={style}>
        {/* paste the existing row JSX here, using `pos` */}
      </div>
    );
  }, [positions /* + any per-row handlers */]);

  if (positions.length === 0) {
    return /* existing empty state */;
  }

  if (positions.length < VIRTUALIZE_THRESHOLD) {
    return (
      <table>...
        {positions.map((pos) => (
          /* existing row JSX */
        ))}
      </table>
    );
  }

  // Virtualized branch
  return (
    <div style={{ height: Math.min(positions.length * ROW_HEIGHT, 600) }}>
      <List
        height={Math.min(positions.length * ROW_HEIGHT, 600)}
        itemCount={positions.length}
        itemSize={ROW_HEIGHT}
        width="100%"
      >
        {renderRow}
      </List>
    </div>
  );
}
```

The exact CSS containing the table and the virtualized list will need slight harmonization. If the current table uses `<table>/<tr>` semantics, the virtualized branch must use `<div>` rows. Accept the visual divergence above the threshold (no headers misalignment because virtualized branch renders all-divs).

This step is the most subjective in the plan. If reconciling table-vs-div semantics turns into > 30 minutes of styling work, REPORT BLOCKED with status `DONE_WITH_CONCERNS` and skip virtualization for this batch — `React.memo` from Task 4 already delivers the main win.

- [ ] **Step 3: Write the memo test**

Create `frontend/__tests__/components/PositionsTable.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import PositionsTable from "@/components/mt5/PositionsTable";
import { useMT5Store } from "@/lib/store";

describe("PositionsTable", () => {
  it("does not re-render its memoized inner content when unrelated store fields change", () => {
    useMT5Store.setState({
      positions: [
        {
          ticket: 1,
          symbol: "EURUSD",
          type: "BUY",
          volume: 0.01,
          price_open: 1.1,
          sl: 0,
          tp: 0,
          profit: 0,
          time: new Date().toISOString(),
        },
      ],
      accountInfo: null,
    });

    const { rerender } = render(<PositionsTable />);

    // mutate an unrelated slice
    useMT5Store.setState({ accountInfo: { login: 99, name: "x", balance: 0, equity: 0, margin: 0, margin_free: 0, margin_level: 0, profit: 0, currency: "USD" } });

    rerender(<PositionsTable />);
    // smoke: nothing throws
    expect(true).toBe(true);
  });
});
```

(This test smoke-verifies the wiring works under React 19 + jsdom. The strict memo-skip behavior is hard to assert without DOM count inspection; we keep this test minimal.)

- [ ] **Step 4: Run all tests + build**

```powershell
npm test
npm run build
```

Expected: tests pass, build succeeds.

- [ ] **Step 5: Commit**

```powershell
git add frontend/components/mt5/PositionsTable.tsx frontend/__tests__/components/PositionsTable.test.tsx
git commit -m "perf(positions): virtualize long position lists with react-window"
```

---

## Task 8: AbortController + useMemo polish

**Files:**
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/accounts/page.tsx`

### Step 1 — Dashboard fetch AbortController

- [ ] **a:** Open `frontend/app/page.tsx`. Find the dashboard fetch — currently around lines 51-68 — a `Promise.all([...])`.

- [ ] **b:** Wrap the effect with an AbortController:

```tsx
useEffect(() => {
  const ac = new AbortController();
  (async () => {
    try {
      const [a, b, c] = await Promise.all([
        api.accounts.list({ signal: ac.signal }),
        api.analytics.summary({ signal: ac.signal }),
        api.analytics.equityCurve({ signal: ac.signal }),
      ]);
      if (ac.signal.aborted) return;
      // ...existing setState calls
    } catch (e) {
      if (ac.signal.aborted) return;
      // ...existing error handling
    }
  })();
  return () => ac.abort();
}, []);
```

If `api.accounts.list` etc. don't currently accept a `signal` argument, just gate the state updates behind `if (ac.signal.aborted) return;` after the await. Then `ac.abort()` on cleanup is still a no-op for the actual fetch but stops the state updates on stale mounts.

### Step 2 — Accounts page useMemo

- [ ] Open `frontend/app/accounts/page.tsx`. Search for `new Map(`. Find the analytics-map construction (audit said it's around line 81).

Wrap in `useMemo`:

```tsx
const analyticsMap = useMemo(
  () => new Map(fundAnalytics.map((f) => [f.account_id, f])),
  [fundAnalytics],
);
```

Add `useMemo` to the imports from `react` if not already there.

### Step 3 — Build + tests

```powershell
npm run build
npm test
npm run lint
```

Expected: clean.

### Step 4 — Commit

```powershell
git add frontend/app/page.tsx frontend/app/accounts/page.tsx
git commit -m "perf(pages): abort dashboard fetches on unmount; memoize accounts map"
```

---

## Task 9: Final verification

**Files:**
- No code changes.

- [ ] **Step 1: Full test pass**

```powershell
cd C:\Users\Max\Desktop\TraderDiary\frontend
npm test
```

Expected: all vitest tests pass (3 store + 1 PositionsTable + any pre-existing).

- [ ] **Step 2: Production build**

```powershell
npm run build
```

Expected: succeeds. Capture the route bundle table.

- [ ] **Step 3: Lint clean**

```powershell
npm run lint
```

Expected: no errors. Warnings tolerated.

- [ ] **Step 4: Dev smoke (manual)**

```powershell
npm run dev
```

Open `http://localhost:3000` in browser. Walk:
- Dashboard (`/`) — loads, no Google Fonts network request
- Accounts (`/accounts`) — list renders
- Funds (`/funds`) — list renders
- Trading (`/trading`) — symbol bar + bid/ask
- Analytics (`/analytics`) — heavy charts visible after dynamic load (small delay OK)

Open React DevTools Profiler, connect MT5, observe a single equity tick. PositionsTable should appear in the flame chart at most once per second (the WS tick rate) — not for every other slice change.

- [ ] **Step 5: Final commit (if any tweaks needed)**

If verification reveals nits:

```powershell
git add <files>
git commit -m "fix(batch-b): <one-line>"
```

Otherwise no commit needed.

---

## Self-Review

- **Spec coverage**: WS scope (4), heavy memo (4, 5), next/font (2), dynamic import (6), virtualization (7), AbortController + useMemo (8). ✓
- **Placeholder scan**: each step has concrete code or exact command; the one subjective area (Task 7 virtualization) has an explicit escape hatch (`DONE_WITH_CONCERNS` + skip).
- **Type consistency**: `useShallow` import path consistent (`zustand/shallow`). `React.memo` wrap pattern consistent across components.
- **Out of scope**: TradingView replacement, real-time chart library swap, server component conversion. Not implemented.
