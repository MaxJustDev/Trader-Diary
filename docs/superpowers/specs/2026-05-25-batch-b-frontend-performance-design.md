# Batch B — Frontend Performance Optimization

**Date**: 2026-05-25
**Status**: Approved for implementation
**Scope**: Next.js 16 frontend (App Router) + Zustand store + WS streaming
**Prereq**: None (frontend-only; A and C are backend)

## Goal

Eliminate the cascade of re-renders triggered by the WebSocket stream so charts, tables, and calendars don't re-mount on every 1-second tick. Stop blocking the page paint on Google Fonts. Lazy-load heavy analytics charts. Memoize derived computations. Add bundle-budget guardrails so regressions are visible.

## Non-Goals

- React Compiler (experimental in React 19; defer)
- Server Component conversion of interactive pages (risk of breaking client state)
- TradingView chart replacement (memory note: paid Charting Library required — out of scope)
- Bundle analyzer setup beyond a simple size check (defer)
- Frontend routing changes / page splits

## Problems Being Solved

| # | Location | Problem |
|---|----------|---------|
| 1 | `components/providers/StreamProvider.tsx` + `lib/store.ts` | WS stream pushes ~1 update/sec to Zustand. Every page subscribed to `useMT5Store(...)` with a non-shallow selector re-renders on every tick — PositionsTable, EquityChart, LiveDataPanel all re-render even if only equity ticked. |
| 2 | `components/mt5/PositionsTable.tsx` | No `React.memo`. Re-renders every parent tick. With 8 interactive buttons per row × 50 rows = 400 DOM nodes per render. No virtualization. |
| 3 | `components/mt5/EquityChart.tsx` | recharts `LineChart` re-renders on every WS update even when `equityHistory` data unchanged. Expensive paint. |
| 4 | `components/analytics/TradingCalendar.tsx`, `SymbolHeatmap.tsx`, `ui/NewsCalendar.tsx` | Heavy date / aggregate logic re-runs on every parent re-render. `useMemo` either missing or has wrong deps. |
| 5 | `app/globals.css:1` | Blocking `@import url('https://fonts.googleapis.com/...')` — Google Fonts loaded synchronously, blocking first paint and adding network RTT to the critical path. |
| 6 | `app/analytics/page.tsx` | Imports `LineChart`, `BarChart`, `TradingCalendar`, `NewsCalendar`, `SymbolHeatmap` directly — all bundled on every analytics route hit. |
| 7 | `app/accounts/page.tsx:~81` | `new Map(...)` rebuilt on every render (not memoized). |
| 8 | `app/page.tsx:51-68` | Dashboard fetches `Promise.all([...])` with no `AbortController`. If user nav's away mid-fetch, the handler still fires on unmounted component. |

## Solution Architecture

### Strategy: scope re-renders, then lazy-load, then memoize

```
Highest impact first:
  1. Zustand selectors with useShallow  → kills cascade
  2. React.memo on heavy components     → cuts redundant work
  3. next/font replaces @import         → frees critical path
  4. Dynamic imports for analytics      → cuts analytics route bundle
  5. Virtualize PositionsTable          → handles long lists
  6. AbortController + useMemo nits     → polish
```

### Detailed plan per problem

#### 1. Scope WS-driven re-renders via `useShallow`

Zustand v5 ships `useShallow` (also available via `zustand/shallow`). Convert object/array selectors to:

```ts
import { useShallow } from "zustand/shallow";
const { positions, accountInfo } = useMT5Store(
  useShallow((s) => ({ positions: s.positions, accountInfo: s.accountInfo })),
);
```

Single-primitive selectors don't need it. Replace in: `PositionsTable.tsx`, `EquityChart.tsx`, `LiveDataPanel.tsx`, and any other page-level subscriber that pulls multiple fields.

Additionally: split the store update inside `useMT5Stream` so that `equity`, `positions`, and `accountInfo` are updated SEPARATELY (only set what changed). This way, components subscribed to only `positions` don't re-render on equity ticks.

#### 2. React.memo wrappers

Wrap these components with `React.memo` (default shallow-prop comparison is sufficient because we now have stable references from `useShallow`):

- `PositionsTable`
- `EquityChart`
- `LiveDataPanel`
- `TradingCalendar`
- `SymbolHeatmap`
- `NewsCalendar`
- `FundAccountCard`

Inline anonymous handler props passed by parents (`onClose={() => ...}`) defeat memo — audit call sites and wrap in `useCallback` where memoized children receive them.

#### 3. `next/font` migration

Add to `app/layout.tsx`:

```ts
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

Apply the variables to `<body className={...}>` and update `globals.css`:

- Remove the `@import url('https://fonts.googleapis.com/...')` line.
- Reference `var(--font-sora)` and `var(--font-jbmono)` in `body { font-family: var(--font-sora), system-ui, sans-serif; }` and any class that uses `JetBrains Mono`.

#### 4. Dynamic imports for analytics

`app/analytics/page.tsx`:

```tsx
import dynamic from "next/dynamic";

const TradingCalendar = dynamic(() => import("@/components/analytics/TradingCalendar"), { ssr: false });
const SymbolHeatmap = dynamic(() => import("@/components/analytics/SymbolHeatmap"), { ssr: false });
const NewsCalendar = dynamic(() => import("@/components/ui/NewsCalendar"), { ssr: false });
// EquityChart already dynamic-ready if it imports recharts at module level
```

The recharts pieces (`LineChart`, `BarChart`) are used inside `EquityChart` and a small bar inside the analytics page; wrap the bar component into its own file if not already, then dynamic-import it.

#### 5. PositionsTable virtualization

Use `react-window` (`FixedSizeList`). Threshold: virtualize only when `positions.length > 20`. Below that, fall back to current direct map (avoid the extra wrapper overhead for typical 0-10 positions). The row component is `React.memo`'d. Row height: measure once with `getBoundingClientRect` of the current default style and hardcode (e.g. `52px`); revisit if cramped.

#### 6. useMemo + AbortController polish

- `app/accounts/page.tsx`: wrap the `Map` build in `useMemo(() => new Map(...), [fundAnalytics])`.
- `app/page.tsx`: dashboard fetch — use `AbortController` ref; abort on cleanup. Pattern (verbatim used in `trading/page.tsx` already, copy it).
- `components/ui/NewsCalendar.tsx`: ensure `useEffect` deps are correct so `fetchNews` doesn't double-fire on remount.

## File Structure

| Path | Status | Purpose |
|------|--------|---------|
| `frontend/app/layout.tsx` | MODIFY | next/font imports + body className |
| `frontend/app/globals.css` | MODIFY | Remove Google Fonts `@import`, use CSS variables |
| `frontend/lib/store.ts` | MODIFY | Split setters (set only what changed) |
| `frontend/hooks/useMT5Stream.ts` | MODIFY | Use the split setters |
| `frontend/components/providers/StreamProvider.tsx` | MODIFY (small) | Ensure single mount; no behavioral change |
| `frontend/components/mt5/PositionsTable.tsx` | MODIFY | React.memo + useShallow + optional virtualization |
| `frontend/components/mt5/EquityChart.tsx` | MODIFY | React.memo + useShallow |
| `frontend/components/mt5/LiveDataPanel.tsx` | MODIFY | React.memo + useShallow |
| `frontend/components/analytics/TradingCalendar.tsx` | MODIFY | React.memo + fix useMemo deps |
| `frontend/components/analytics/SymbolHeatmap.tsx` | MODIFY | React.memo + fix useMemo deps |
| `frontend/components/analytics/FundAccountCard.tsx` | MODIFY | React.memo |
| `frontend/components/ui/NewsCalendar.tsx` | MODIFY | React.memo + useEffect deps |
| `frontend/app/accounts/page.tsx` | MODIFY | useMemo for Map |
| `frontend/app/analytics/page.tsx` | MODIFY | Dynamic imports for charts/calendars |
| `frontend/app/page.tsx` | MODIFY | AbortController on dashboard fetch |
| `frontend/package.json` | MODIFY | Add `react-window` + `@types/react-window` |
| `frontend/__tests__/store.test.ts` | NEW | Verify split setters only update what changed (referential equality on other slices) |
| `frontend/__tests__/components/PositionsTable.test.tsx` | NEW | Memo verification: same props → no re-render |

## Behavior Preservation

- No API call change.
- No URL change.
- No design-system token change (CSS vars stay; only the font-loading mechanism changes).
- Sonner toasts unaffected.
- Sidebar state unaffected.
- Numbers, formatting, colors all unchanged.

## Testing Plan

Vitest is already configured (`"test": "vitest run"`). Add:

1. `store.test.ts` — assert that calling `setPositions(...)` does not mutate `accountInfo` (referential equality preserved).
2. `PositionsTable.test.tsx` — render with identical props twice via `rerender`; assert React.memo prevents internal effect runs (use a render counter ref or `vi.fn` callback prop).

Manual smoke:
- `npm run dev` boots
- Connect MT5; WS stream active; observe React DevTools Profiler: PositionsTable re-render count when only equity ticks should be **0**.
- Navigate to /analytics: heavy charts visible after small delay (dynamic load); subsequent navigations should be cached.
- Network tab: no Google Fonts CSS request; fonts served from same origin.

## Bundle Budget Sanity (optional but recommended)

After all changes, run `npm run build` and note the analytics route bundle size. Target: at least 20% reduction. Record number in the spec verification section.

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `useShallow` import path differs in zustand version | Low | zustand 5.0.11 ships `useShallow` from `zustand/shallow`. Confirm path on first use. |
| `next/font` doesn't load JetBrains Mono italic correctly | Low | Pass `style: ['normal', 'italic']` explicitly. |
| `react-window` adds bundle size more than memo saves | Low | ~6KB gzip; PositionsTable benefit dominates once positions > 30. Threshold gate avoids overhead for short lists. |
| Dynamic imports break SSR | Low | `ssr: false` opted on each heavy chart; analytics page is client component. |
| Vitest setup breaks under React 19 | Medium | Project already has vitest 3.2.4 + @testing-library/react 16.3.0 (React 19 compatible). |

## Success Criteria

- React DevTools Profiler: PositionsTable re-renders 0 times on equity-only ticks (was N per tick).
- No `https://fonts.googleapis.com/css2` request on cold load.
- `npm run build` succeeds.
- Analytics route initial JS bundle reduced ≥ 20% (informal target).
- Vitest: 2 new tests added and green.
- No visual regressions on a manual page-by-page walk.

## Out of Scope

- TradingView Charting Library replacement
- Real-time chart libraries (lightweight-charts) — separate evaluation
- Server-side analytics aggregation (would change API contract; deferred)
- React Compiler enablement
