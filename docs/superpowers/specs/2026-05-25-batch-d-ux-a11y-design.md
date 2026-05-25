# Batch D — UX & A11y Polish

**Date**: 2026-05-25
**Status**: Approved for implementation
**Scope**: Frontend interaction polish — accessibility, loading/error states, empty states, async-form UX
**Prereq**: None (frontend-only; orthogonal to A/C; can layer on B)

## Goal

Fix the rough edges in the day-to-day user flows so screen readers can navigate, form submissions don't leave users wondering if anything happened, empty states actually point somewhere useful, and destructive actions can't be double-fired.

## Non-Goals

- Visual redesign of any page
- New features
- Color-contrast overhaul (token system already AA-compliant in dark mode)
- Internationalization
- Keyboard-driven trading (Tab-only batch execution) — separate UX project

## Problems Being Solved

| # | Location | Problem |
|---|----------|---------|
| 1 | `components/layout/Sidebar.tsx`, `components/accounts/AccountCard.tsx`, `app/trading/page.tsx` (Bid/Ask buttons), action buttons in tables | Icon-only `<button>`s without `aria-label`. Screen readers announce nothing. |
| 2 | `app/trading/page.tsx:166-193` | Calculate button shows "Calculating..." but the symbol + SL inputs remain editable — input change mid-flight causes the preview to mismatch the form state. |
| 3 | `app/page.tsx:348-359`, `app/funds/page.tsx:206-210` | Empty states ("No trades yet", "No funds configured") are dead-ends — no link/button to the relevant page. |
| 4 | `components/ui/ConfirmModal.tsx` | Confirm button does not disable during async `onConfirm`. Slow backend → user double-clicks → duplicate request. |
| 5 | Modal components (`ConfirmModal`, `EditAccountModal`, AddAccountForm) | No focus trap — Tab leaves the modal; no auto-focus on first input. |
| 6 | `app/trading/page.tsx:512-567`, account multi-select lists | Tab/focus indicator missing. Keyboard users lose track. |
| 7 | `app/page.tsx`, `app/accounts/page.tsx`, `app/funds/page.tsx`, `app/analytics/page.tsx` | Inconsistent loading skeletons — some pages render skeleton, others render nothing. |
| 8 | Mixed `alert()` / `confirm()` survivors | Audit memory said replaced — verify and fix any stragglers. |

## Solution Architecture

### 1. aria-label on every icon-only button

Add a small project convention: an icon-only `<button>` MUST have either `aria-label="..."` (preferred) or `aria-labelledby="..."` set. Sweep these files:
- `components/layout/Sidebar.tsx` (logo, collapse toggle, theme toggle, nav icons)
- `components/accounts/AccountCard.tsx` (edit, connect, delete)
- `components/mt5/PositionsTable.tsx` (close, modify, partial close, trail)
- `app/trading/page.tsx` (Bid/Ask quick-fill buttons, the symbol bar buttons)
- `app/accounts/page.tsx` view-toggle (Grid/List)
- `app/analytics/page.tsx` (Sync P&L, Backup, Restore)
- Any modal close button (X icon)

Each label should describe the ACTION ("Close position 12345", "Edit account demo-FTMO-123") with context where available, otherwise generic but specific ("Delete account", "Toggle sidebar").

### 2. Trading calculate form lock

When `calculating = true`, disable: symbol input, SL price input, risk type toggle, risk value input, accounts checkboxes, TP price input. The Calculate button already shows "Calculating...". Add `aria-busy="true"` to the form during this state.

Re-enable after the response (success OR failure).

### 3. Empty-state actions

For each empty state:
- Dashboard "No trades": add a `<Link href="/trading">Execute first batch</Link>` button.
- Funds page "No funds configured": the existing "Refresh Templates" button at the top — surface it again INSIDE the empty state body as a primary action.
- Analytics "No equity history": link to MT5 connection flow / accounts page.
- Trading "Set SL price...": add a clearer 3-step inline help (1) Pick symbol  (2) Enter SL  (3) Choose risk.

### 4. ConfirmModal async-lock

Convert `onConfirm` to support a Promise return. Track a `submitting` state. While submitting:
- Confirm button disabled, label shows "Working...".
- Backdrop dimmed; modal not closable.

Update all call sites — the `onConfirm` handlers that call async API methods can stay as-is (already async) and the modal will await them.

### 5. Modal focus trap

Add a tiny custom hook `useFocusTrap(modalRef)` that:
- On mount, saves `document.activeElement`, focuses first focusable child of modal.
- Intercepts `Tab` / `Shift+Tab` to cycle within the modal.
- On unmount, returns focus to the saved element.
- Adds `Escape` key → calls `onCancel`.

Apply to `ConfirmModal`, `EditAccountModal`. Form modals (`AddAccountForm`) keep their own first-input autofocus but get the trap behavior too.

### 6. Focus indicator CSS

Global `:focus-visible` style in `globals.css`:

```css
:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 2px;
  border-radius: 4px;
}
```

Avoids the visual noise of `:focus` on mouse clicks while still showing keyboard focus.

### 7. Loading skeleton consistency

Each route page has a top-level fetch. Ensure:
- Initial render shows `<SkeletonCard />` (already exists in `components/ui/SkeletonCard.tsx`).
- On fetch failure, show an inline error block with a Retry button.

Pages to audit: `app/page.tsx`, `app/accounts/page.tsx`, `app/funds/page.tsx`, `app/analytics/page.tsx`.

### 8. alert/confirm survivor sweep

```powershell
Select-String -Path frontend\app,frontend\components -Pattern "(alert|confirm)\(" -SimpleMatch -Recurse
```

Any matches outside `ConfirmModal.tsx` itself: replace with toast or ConfirmModal.

## File Structure

| Path | Status | Purpose |
|------|--------|---------|
| `frontend/hooks/useFocusTrap.ts` | NEW | Modal focus trap + Escape-to-close |
| `frontend/components/ui/ConfirmModal.tsx` | MODIFY | Async-submit state, focus trap, aria attrs |
| `frontend/components/accounts/EditAccountModal.tsx` | MODIFY | Focus trap |
| `frontend/components/forms/AddAccountForm.tsx` | MODIFY | Focus trap, autofocus first input |
| `frontend/components/layout/Sidebar.tsx` | MODIFY | aria-labels |
| `frontend/components/accounts/AccountCard.tsx` | MODIFY | aria-labels |
| `frontend/components/mt5/PositionsTable.tsx` | MODIFY | aria-labels on row actions |
| `frontend/app/trading/page.tsx` | MODIFY | Disable inputs on calculate; empty-state help |
| `frontend/app/page.tsx` | MODIFY | Empty-state action link; loading skeleton consistency |
| `frontend/app/funds/page.tsx` | MODIFY | Empty-state action button |
| `frontend/app/accounts/page.tsx` | MODIFY | View toggle aria-labels; loading skeleton |
| `frontend/app/analytics/page.tsx` | MODIFY | Empty-state link; Sync P&L button error toast on failure |
| `frontend/app/globals.css` | MODIFY | `:focus-visible` global rule |
| `frontend/__tests__/hooks/useFocusTrap.test.tsx` | NEW | Hook unit test |

## Behavior Preservation

- All endpoints unchanged.
- No layout changes outside the focus outline (which only shows on keyboard nav).
- All confirm/error/loading flows retain current visual rhythm — only add states that were missing.

## Testing Plan

- New test for `useFocusTrap`: render a modal with two buttons; assert Tab cycles. Assert Escape calls onClose.
- Manual a11y walk:
  - Tab from URL bar through sidebar; each item gets a visible outline.
  - Open ConfirmModal; Tab stays inside, Escape closes.
  - Calculator: while calculating, inputs are disabled (read-only attr or `disabled`).
  - Dashboard empty state: "Execute first batch" link visible and works.

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Focus trap breaks existing modal interactions | Medium | Hook is opt-in; test with the three modals first; rollback per-component possible. |
| Disabling inputs during calculate misses an edge case (e.g., user wants to update symbol mid-flight by design) | Low | Calculate is < 2s typical; disabling is the safer default. |
| `:focus-visible` global rule conflicts with bespoke focus styles | Low | Audit existing `:focus` rules; add `outline: none` overrides only where the bespoke style is intentional. |

## Success Criteria

- `grep -rEn '<button[^>]*>\s*<' frontend/components frontend/app | grep -v 'aria-label'` returns no matches (every icon-only button labeled). (Heuristic — false positives OK.)
- Tab navigation visibly highlights focused element across all pages.
- Calculator inputs are disabled during pending calculation.
- Empty states on dashboard, funds, analytics offer an action.
- ConfirmModal cannot be double-clicked.
- New `useFocusTrap` test green.
