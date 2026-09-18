# Design direction

The dashboard in this repository is the visual source of truth. Match its existing
screens, shared components, tokens, typography, spacing, icons, and interaction patterns
before introducing new UI.

For new components or interaction patterns, beUI (https://beui.dev/) is the preferred
reference. Check its registry and motion guides when the existing component set does not
cover the need, then adapt the pattern to this project's design system and dependencies.
This does not mean every new component must be implemented from beUI; reuse existing
components and tokens when they already solve the problem, and do not add dependencies only
to match an example. Any beUI component we adopt must be restyled to use this project's
orange palette, semantic color tokens, typography, surfaces, borders, and interaction
states; never import beUI's visual colors as-is.

## Design principles

- Calm, light workspace surfaces with hairline borders.
- One clear orange accent for selected navigation, focus, and primary actions.
- Dense but readable navigation; use whitespace and dividers instead of heavy cards.
- Small, neutral supporting text. Do not use color alone to communicate status.
- Treat the current dashboard and its shared components as the source of truth for new UI.
- Use beUI as the first external reference for new component patterns when the existing
  component set does not cover the interaction, while keeping the result consistent with
  this dashboard.
- Use Phosphor Icons via `@phosphor-icons/react` for navigation, actions, and status icons.
- Reuse the existing shadcn-style components in `src/components/ui` when implementing
  these patterns.

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
