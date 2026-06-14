# TraderDiary UI Redesign Design

Date: 2026-04-01
Status: Approved in brainstorming, pending written-spec review

## Context

TraderDiary is a local-first MT5 management and trading tool for prop-firm traders. The current frontend already contains meaningful functionality, but the UI has drifted into a mixed state:

- Some screens feel intentionally designed while others still read as rough admin panels.
- Styling is heavily split between global tokens and one-off inline styles.
- Information density is inconsistent across Dashboard, Accounts, Trading, and Analytics.
- The current dark visual language does not offer a calmer neutral mode for planning/review workflows.
- Risk information exists, but the hierarchy is not consistently strong enough across pages.

The redesign will keep existing workflows and business logic intact while replacing the visual system, layout hierarchy, and shared UI language.

## Goals

- Redesign the app around a modern signal-first fintech interface.
- Make account/risk state visible before secondary analytics or decorative content.
- Improve speed of scanning and action-taking across all major screens.
- Unify the whole app under one layout and component system.
- Support both desktop and mobile/tablet usage credibly.
- Introduce a neutral default theme plus a deliberate dark mode for trading/monitoring sessions.
- Reduce one-off styling in favor of reusable tokens, classes, and components.

## Non-Goals

- No backend/API behavior changes are required for the redesign.
- No workflow rewrite: the user should still recognize the same app and task flow.
- No new major product modules are introduced as part of this redesign.
- No redesign of business logic for rule validation, MT5 connectivity, or analytics calculations.
- No separate design system for light and dark mode; dark mode is a variant of the same system.

## User Priorities

The user explicitly prioritized the redesign as:

1. Account, risk, and warning visibility
2. Fast task flow and execution speed
3. Readability and clean presentation

This priority order drives all page hierarchy decisions.

## Approved Visual Direction

The chosen direction is:

- Signal Grid for overall structure
- Neutral theme as default
- Manual dark theme for switching into trading/monitoring mode
- Premium fintech polish borrowed selectively from a calmer "clean fintech" style

The product should feel more modern and cleaner than the current dark trading UI, but still operate as a control surface rather than a generic SaaS dashboard.

## App Shell

### Shared structure

All primary pages will share the same shell:

- Compact left navigation rail on desktop
- Bottom navigation on smaller screens/mobile
- Lightweight page header
- Persistent top status/risk strip above the primary work area
- Main content area plus one supporting context area where needed

The shell should answer "what needs attention right now?" before it presents secondary content.

### Navigation

Desktop behavior:

- Replace the visually heavy sidebar with a slimmer navigation rail
- Keep navigation persistent and low-friction
- Reserve horizontal space for the content area rather than the nav

Mobile behavior:

- Replace desktop rail behavior with bottom navigation
- Keep key status context near the top of the page
- Important warnings and actions must stack rather than disappear

### Theme mode behavior

Theme behavior will be explicit:

- Neutral mode is the default mode for planning, review, and journaling workflows
- Dark mode is a deliberate session mode for live trading and monitoring
- Theme selection should be user-controlled and persisted locally

The recommended implementation approach is a root theme attribute (for example `data-theme`) applied at the app shell level, backed by CSS variables.

## Information Hierarchy

### Primary rule

Every main screen should present information in this order:

1. Risk and state
2. Immediate action context
3. Secondary summaries
4. Deep detail tables/charts

### Status strip

The top status strip is the cross-app signal layer. It should be able to show, depending on page context:

- Daily drawdown status
- Max drawdown status
- Locked/warning/healthy fund state
- Payout timing
- MT5 connection/live status
- Action-blocking conditions

This strip should be compact, readable, and present on all major screens, not just the dashboard.

## Component Language

The redesign will standardize the frontend around a shared component language.

### Design principles

- Soft neutral surfaces instead of heavy glass everywhere
- Thin borders and spacing do more of the work than background effects
- Status color is used with restraint and intent
- Rounded components, but not soft/playful consumer styling
- Strong numeric alignment and legibility for trading data

### Shared component patterns

The UI should be rebuilt around reusable primitives/patterns such as:

- App shell / page container
- Page header
- Status strip / metric strip
- Surface card
- Metric card
- Alert card
- Data table
- Empty state
- Error state
- Skeleton/loading state
- Segmented controls
- Action buttons
- Risk/status badges
- Structured form fields

The exact component names can be finalized during planning, but the design requires a shared layer rather than per-page bespoke styling.

### Cards

Cards should use:

- Quiet surface
- Thin border
- Strong spacing
- Optional top-edge status accent only when status matters

Cards should not default to loud glows or excessive decoration.

### Alerts

Alerts should distinguish between:

- Informational guidance
- Warning states
- Blocking/error states
- Success confirmation

They should be visually clear but not visually overwhelming. Full-width red slabs should be avoided unless the message is truly blocking and critical.

### Tables

Tables remain important for accounts, trades, and analytics. The redesign should keep them, but improve them via:

- Cleaner row chrome
- Better numeric alignment
- Consistent header treatment
- Stronger distinction between positive/negative/risk cells
- Responsive fallback behavior on smaller screens

The redesign should not replace all tabular views with cards. Accounts and analytics still need desktop-efficient data tables.

### Forms

Forms should become more structured:

- Clear labels and grouping
- Stronger spacing
- Better action hierarchy
- Reusable field treatment
- Clear separation between safe actions, destructive actions, and primary submit/execute actions

## Theme Tokens

The app should centralize its visual system through tokenized variables rather than continuing to rely on scattered inline style literals.

The token system should cover:

- Background layers
- Surface layers
- Borders
- Primary text / secondary text / muted text
- Accent
- Success
- Warning
- Error
- Focus ring / interactive states

The same token structure must work in both neutral mode and dark mode.

## Page-by-Page Design Mapping

### Dashboard

The dashboard becomes the risk-and-state board.

Primary behavior:

- Surface warnings first
- Show overall account health quickly
- Keep payout timing and key account state visible
- Preserve quick navigation to working screens

The dashboard should lead with signals and summaries, then fall through to recent trades and account overview detail.

### Accounts

Accounts becomes a cleaner management registry.

Primary behavior:

- Compare accounts quickly
- Scan health/status without opening details
- Search, filter, and manage accounts with less visual noise
- Keep connect/disconnect and edit/delete actions visually structured

The page should be table-first on desktop because comparison and management efficiency matter more than presentation density. Card presentation can remain as a secondary/mobile-friendly mode, but the primary design direction is an efficient registry rather than a decorative card wall.

### Trading

Trading becomes the clearest execution workspace in the app.

Primary behavior:

- Show symbol/risk/action context immediately
- Make blocked/warning account states obvious before execution
- Keep preview quality high
- Reduce ambiguity around whether the batch is safe, warning-level, or blocked

The trading screen should visually prioritize confidence before execution. It should be the strongest page in the redesign after the shell itself.

### Analytics

Analytics becomes a layered review surface.

Primary behavior:

- Show overview metrics cleanly
- Separate high-level review from detailed journal analysis
- Reduce current visual overload
- Preserve data depth without collapsing into a cluttered admin report

The redesign should make it easier to move from overview to journal/calendar/deeper analysis without the page feeling visually noisy.

## Data Flow And Architecture Guardrails

The redesign should preserve current frontend behavior patterns where possible:

- Keep the existing page route structure unless a strong planning reason appears later
- Preserve current API client usage and backend contracts
- Preserve Zustand store responsibilities unless a clear UI need requires light reorganization

Recommended frontend architecture direction:

- Move more shared UI styling into reusable classes/components
- Centralize page layout and shell logic
- Use page-specific sections/components instead of very large page files where practical
- Reduce inline style sprawl, especially on top-level pages

No data-model redesign is required for this UI effort.

## State Design

All major screens must have intentional visual states for:

- Loading
- Empty/no-data
- Error/failure
- Success/confirmation
- Warning/blocking business-rule state

### Loading

Loading states should resemble the shape of the real screen rather than generic blank placeholders.

### Empty

Empty states should always explain the next useful action rather than simply saying there is no data.

### Error

Errors should distinguish between:

- Retryable fetch/API failure
- Business rule violation
- Action blocked by risk or state

### Success

Success states should be restrained and operational, not celebratory or noisy.

## Motion

Motion should be limited and purposeful.

Allowed emphasis:

- Page enter/reveal
- Subtle hover/selection transitions
- Clear state transitions
- Live status indicators where real-time state exists

Avoid:

- Decorative looping animations
- Motion that competes with risk/status information
- Inconsistent animation styles between pages

## Responsiveness

The redesign must work across desktop, laptop, and mobile/tablet.

Rules:

- Critical warnings and actions must remain visible on small screens
- Dense tables should degrade intentionally, not just overflow without hierarchy
- Navigation behavior should adapt to screen size rather than simply shrinking the desktop shell
- Page layouts should stack gracefully without losing the risk-first hierarchy

## Accessibility

The redesign must preserve or improve usability in both themes.

Requirements:

- Strong text/background contrast in neutral and dark themes
- Risk colors must remain legible without relying on color alone
- Numeric data should remain easy to scan
- Interactive states should have clear hover/focus/active treatment

## Acceptance Criteria For Implementation

The redesign is successful when:

- Dashboard, Accounts, Trading, and Analytics all visibly belong to the same system
- Neutral and dark mode both render coherently
- Risk/status hierarchy is stronger than in the current UI
- Trading is visually clearer and more confidence-building before execution
- Loading/empty/error states look intentional on all major screens
- Inline style usage is materially reduced in favor of shared styling patterns
- Desktop and mobile experiences are both usable and visually considered

## Verification Approach

Implementation should be considered incomplete until it is verified through a combination of:

- Frontend build/lint checks
- Manual desktop review of Dashboard, Accounts, Trading, and Analytics
- Manual mobile/narrow-width review of the same screens
- Neutral mode review
- Dark mode review
- State review for loading, empty, error, and success surfaces on key pages

The goal of verification is not just "the page renders," but "the redesigned system stays coherent across pages, breakpoints, and theme modes."

## Risks And Constraints

- The current frontend contains many page-specific inline styles, so implementation will require deliberate extraction rather than superficial polish.
- The worktree is already active, so UI work must avoid overwriting unrelated ongoing changes.
- The redesign should not accidentally hide critical trading data in the name of cleanliness.

## Planning Readiness

This spec is ready for implementation planning under the following scope:

- Rebuild the app shell and theme system
- Introduce reusable UI primitives/patterns
- Redesign Dashboard, Accounts, Trading, and Analytics to fit the approved system
- Keep existing workflows and backend contracts intact

No unresolved planning placeholders remain that would block planning.
