# Design direction

The dashboard in this repository is the visual source of truth. Match its existing
screens, shared components, tokens, typography, spacing, icons, and interaction patterns
before introducing new UI.

For new components or interaction patterns, [Beautiful UI](https://www.beautifului.dev/)
is the preferred external reference. It is a catalog of crafted primitives for AI-native
interfaces, including agent progress, reasoning traces, streaming responses, approvals,
tool calls, data tables, workflow diagrams, insights, code changes, and screen control.
Use it to study interaction structure and information hierarchy, then adapt the pattern to
this project's design system and dependencies.

This does not mean every new component must be implemented from Beautiful UI; reuse existing
components and tokens when they already solve the problem, and do not add dependencies only
to match an example. Any pattern we adopt must be restyled to use this project's orange
palette, semantic color tokens, typography, surfaces, borders, and interaction states.
Beautiful UI's creamery-operations content is reference/demo content only; product copy and
domain data must remain specific to this project.

## Design principles

- Calm, light workspace surfaces with hairline borders.
- One clear orange accent for selected navigation, focus, and primary actions.
- Dense but readable navigation; use whitespace and dividers instead of heavy cards.
- Small, neutral supporting text. Do not use color alone to communicate status.
- Treat the current dashboard and its shared components as the source of truth for new UI.
- Use Beautiful UI as the first external reference for new AI-interface patterns when the
  existing component set does not cover the interaction, while keeping the result consistent
  with this dashboard.
- Make agent work legible: show progress, sources, tool calls, proposed changes, and human
  approval points when they are relevant to the workflow.
- Prefer compact, composable workspace primitives over decorative panels or marketing UI.
- Remove generic shell filler such as demo labels, placeholder-data notices, and broad
  operational-status claims when they do not help the user complete a task. Keep only copy
  that explains navigation, data, or an available action.
- Use Phosphor Icons via `@phosphor-icons/react` for navigation, actions, and status icons.
- Reuse the existing shadcn-style components in `src/components/ui` when implementing
  these patterns.

## Beautiful UI reference catalog

Use the following Beautiful UI primitives as a pattern vocabulary. Select the smallest
primitive that explains the user action or agent state; do not reproduce the entire catalog
in a single screen.

### Agent and conversation patterns

- **Loading State** — pixel-grid loader with shimmer and elapsed time.
- **Thinking** — expandable steps for reasoning, search, coding, or other traceable work.
- **Streaming Text** — streamed answer with inline sources, actions, and follow-ups.
- **Approval Card** — human-in-the-loop question with explicit options and continue/skip
  actions.
- **Tool Chips** — compact representation of tool calls, code edits, and messages.
- **Task Rows** — live task status for running, failed, and completed work.
- **Chat** — tabbed conversation with reasoning replies and a composer.
- **Prompt Bar** — composer with mentions, commands, model selection, and dictation affordance.
- **Recommendation Card** — suggested action with confidence, alternatives, and accept action.
- **Context Cards** — retrieved knowledge chunks with source and content metadata.

### Data and workflow patterns

- **Diff Table** — proposed edits to tabular data.
- **Records Table** — sortable CRM-style grid with tags and relationship status.
- **Filter Table** — status chips that reorganize live data.
- **Sidebar Nav** — collapsible workspace/chat navigation with lightweight hover states.
- **Search** — command search with live filtering, suggestions, and an empty state.
- **Flowchart** — trigger and condition steps on a dotted workflow canvas.
- **Insight Cards** — paged agent insights with compact trend visualizations.
- **Code Block** — line-numbered code with Code/Diff views.
- **Fine-tune Card** — inspector for adjusting layout and visual properties.
- **Selection Actions** — selected text passed to the agent for rewrite, shortening, tone,
  or grammar actions.
- **Agent Screen** — view, teach, and record an agent's screen activity.

### Adaptation rules

- Keep the current dashboard's light surfaces, hairline borders, typography, spacing, and
  orange accent as the visual source of truth.
- Preserve the existing shadcn-style component APIs and compose them before creating a new
  primitive.
- Keep agent states explicit and recoverable: distinguish loading, working, awaiting approval,
  completed, failed, and empty states.
- Keep source, confidence, and proposed-action metadata close to the content it qualifies.
- Use progressive disclosure for detailed traces, diffs, and context so the primary workflow
  remains scannable.
- Do not copy Beautiful UI's sample creamery data, colors, or branding into product flows.

## Core color palette

These are the normalized values used by the dashboard and should be the source of truth for
new shell UI.

| Token            | Value                 | Use                                                            |
| ---------------- | --------------------- | -------------------------------------------------------------- |
| `brand`          | `#FD6100`             | Active navigation, primary actions, focus ring, selected icons |
| `brand-hover`    | `#FD6100`             | Brand hover state; keep the accent stable and restrained       |
| `ink`            | `#4A4A4A`             | Primary shell text                                             |
| `ink-soft`       | `#7B7B7B`             | Secondary text, inactive icons, section labels                 |
| `ink-faint`      | `#A3A3A3`             | Placeholder text and low-emphasis icons                        |
| `line`           | `#EEEEEE`             | Sidebar borders, input borders, dividers                       |
| `line-soft`      | `#F0F0F0`             | Raised controls and subtle separators                          |
| `surface`        | `#FFFFFF`             | Cards, controls, popovers                                      |
| `surface-muted`  | `#FCFCFC`             | Very soft page/shell surface                                   |
| `surface-sunken` | `#F6F6F6`             | Hover surfaces and keyboard shortcut pills                     |
| `surface-raised` | `#F0F0F0`             | Small control backgrounds                                      |
| `destructive`    | `oklch(0.58 0.22 27)` | Destructive actions and errors                                 |

### Semantic shadcn tokens

Use these values when the existing component API expects semantic tokens rather than the
named shell palette:

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: #fd6100;
  --primary-foreground: #ffffff;
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.58 0.22 27);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: #fd6100;
  --radius: 0.625rem;
}
```

Useful chart accents from the same source are `#F97316`, `#A855F7`, `#EF4444`,
`#F59E0B`, and `#22C55E`. Use them only when a visualization needs multiple series;
the workspace shell itself stays orange, neutral, and low contrast.

## Sidebar

### Anatomy

```text
┌────────────────────────────────┐
│ workspace/account control  [‹] │  43px header row
│ [ Search                    ⌘ K]│  34px desktop / 40px touch
│                                │
│ WORKSPACE                   ˅  │  collapsible section label
│   ◉ Dashboard                  │
│   ◌ Orders                     │  40px touch target
│   ◌ Products                   │
│                                │
│ COMMUNICATION               ˅  │
│   ◌ Inbox                 12   │
│                                │
│                                │
│   Invite team                 │  optional footer action
└────────────────────────────────┘
```

### Layout and states

- Desktop width: `18rem` / `288px`; collapsed icon rail: `68px`.
- Surface: `#FAFAFA`; right border: `1px solid #EEEEEE`; vertical padding: `8px`.
- Keep the sidebar as a flex column. The navigation list owns the scroll region; the
  footer stays visible.
- The account/workspace control is a compact white control with a `22px` logo/avatar,
  `6px` radius, and `#EEEEEE` border.
- Search is a white bordered pill-like control with a small `⌘ K` shortcut pill using
  `#F6F6F6`. The search dialog is a separate surface, not an expanding sidebar row.
- Group navigation into collapsible sections such as `Workspace`, `Communication`, and
  `Admin`. Section labels use `12px` text in `#7B7B7B` with a small chevron.
- Navigation rows use a `40px` minimum touch target, `8px` horizontal padding, `6px`
  radius, and a `20px` icon box.
- Inactive rows: text and icons in `#7B7B7B` / `#A3A3A3`; hover surface `#F6F6F6`.
- Active row: `#FFF1E6` surface, `#FD6100` text, and `#FD6100` icon.
- Count badges use `#FD6100` with white text, `11px` type, and a full pill radius.
- Collapsed mode keeps the icons and active treatment, hides labels, and exposes the
  destination through `title` text or an accessible name.

### Responsive behavior

- At widths below the desktop breakpoint, the sidebar becomes a drawer no wider than
  `min(18rem, calc(100vw - 3rem))`.
- Use `100dvh`, safe-area insets, and a full-screen backdrop. The trigger is a `40px`
  square white button with a `#EEEEEE` border and a visible focus ring.
- Opening the drawer translates it into view and enables the backdrop. Selecting a route
  closes the drawer.
- Respect `prefers-reduced-motion`: remove transform animation and retain only a short
  opacity transition or an immediate state change.

### Nav-row recipe

The nav row should receive navigation behavior through props while keeping the dashboard's
visual treatment:

```jsx
function SidebarNavRow({ active, icon: Icon, label, badge, onClick }) {
  return (
    <button
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        'flex min-h-10 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
        active
          ? 'bg-[#FFF1E6] text-[#FD6100]'
          : 'text-[#7B7B7B] hover:bg-[#F6F6F6] hover:text-[#4A4A4A]',
      )}
    >
      <Icon
        className={cn('h-5 w-5 shrink-0', active ? 'text-[#FD6100]' : 'text-[#A3A3A3]')}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge}
    </button>
  )
}
```

## Workspace navbar / header

The workspace header is a quiet page-context bar rather than a marketing navbar. It should
sit above the main content and explain where the user is without competing with the page's
primary action.

### Anatomy and tokens

- Height: `64px` (`h-16`), `shrink-0`.
- Surface: `rgba(245, 245, 245, 0.7)` / `bg-neutral-100/70` with a light backdrop blur.
- Bottom border: `rgba(229, 229, 229, 0.8)` / `border-neutral-200/80`.
- Horizontal padding: `24px` on desktop; reduce it at narrow widths.
- Left cluster: page title at `15px`, semibold, `#171717`; optional subtitle at `12px`,
  `#737373`, with `2px` top spacing.
- Right cluster: small context/status pill, white surface, `#E5E5E5` border, `11px`
  medium text, `10px 12px` padding, full radius, and `6px` internal gap.
- Keep the header content in one flex row with `justify-between` and `gap: 16px`; allow
  long titles to truncate rather than push actions off-screen.

### Adapted header recipe

```jsx
function WorkspaceHeader({ title, subtitle, context }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-neutral-200/80 bg-neutral-100/70 px-4 backdrop-blur-sm sm:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-semibold leading-snug text-neutral-900">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 truncate text-[12px] text-neutral-500">{subtitle}</p>
        ) : null}
      </div>
      {context ? (
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-neutral-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-neutral-700">
          {context}
        </div>
      ) : null}
    </header>
  )
}
```

## Implementation guardrails

- Keep the existing `Button`, `Avatar`, `Separator`, `cn`, and Tailwind setup. Extend them
  only when a shared variant is actually needed.
- Use one consistent Phosphor weight per control family; default to `regular` and use
  `bold` only for compact emphasis such as a status arrow or overflow affordance.
- Keep route authorization, workspace membership, counts, and asynchronous search outside
  the visual components. The components should receive labels, active state, badges, and
  callbacks.
- Preserve keyboard focus, `aria-current`, accessible names, and the mobile drawer's
  close behavior.
- Do not introduce a parallel visual system or external component dependency when the
  existing dashboard components and tokens meet the need.
- If these patterns are implemented, verify the shell at narrow, intermediate, and wide
  widths, including keyboard navigation and reduced-motion behavior.
