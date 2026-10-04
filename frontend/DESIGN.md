---
name: Cascade Launcher
colors:
  surface: '#f0f4f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8fafc'
  surface-container: '#f1f5f9'
  surface-container-high: '#e2e8f0'
  surface-container-highest: '#cbd5e1'
  on-surface: '#0f172a'
  on-surface-variant: '#475569'
  outline: '#64748b'
  outline-variant: '#94a3b8'
  line: '#e2e8f0'
  line-strong: '#cbd5e1'
  ink: '#1e293b'
  ink-strong: '#0f172a'
  primary: '#b45309'
  primary-hover: '#92400e'
  primary-container: '#d97706'
  primary-bright: '#fbbf24'
  primary-fixed: '#fef3c7'
  on-primary-fixed: '#78350f'
  secondary: '#4c6a92'
  tertiary: '#2f7a4a'
  warning: '#c2410c'
  danger: '#c62828'
typography:
  headline-xl: { fontFamily: Hanken Grotesk, fontSize: 36px, fontWeight: '700', lineHeight: 44px, letterSpacing: -0.03em }
  headline-lg: { fontFamily: Hanken Grotesk, fontSize: 24px, fontWeight: '600', lineHeight: 32px, letterSpacing: -0.02em }
  headline-md: { fontFamily: Hanken Grotesk, fontSize: 20px, fontWeight: '600', lineHeight: 28px, letterSpacing: -0.01em }
  headline-sm: { fontFamily: Hanken Grotesk, fontSize: 16px, fontWeight: '600', lineHeight: 24px, letterSpacing: 0em }
  body-lg: { fontFamily: Hanken Grotesk, fontSize: 16px, fontWeight: '400', lineHeight: 24px, letterSpacing: -0.01em }
  body-md: { fontFamily: Hanken Grotesk, fontSize: 14px, fontWeight: '400', lineHeight: 20px, letterSpacing: 0em }
  body-sm: { fontFamily: Hanken Grotesk, fontSize: 12px, fontWeight: '400', lineHeight: 16px, letterSpacing: 0.01em }
  label-lg: { fontFamily: Hanken Grotesk, fontSize: 14px, fontWeight: '600', lineHeight: 20px, letterSpacing: 0.01em }
  label-md: { fontFamily: Hanken Grotesk, fontSize: 12px, fontWeight: '600', lineHeight: 16px, letterSpacing: 0.02em }
  label-sm: { fontFamily: Hanken Grotesk, fontSize: 11px, fontWeight: '500', lineHeight: 14px, letterSpacing: 0.04em }
  code-md: { fontFamily: JetBrains Mono, fontSize: 13px, fontWeight: '400', lineHeight: 18px }
  code-sm: { fontFamily: JetBrains Mono, fontSize: 12px, fontWeight: '400', lineHeight: 16px }
  code-xs: { fontFamily: JetBrains Mono, fontSize: 11px, fontWeight: '400', lineHeight: 14px }
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

> Source: Google Stitch project "Cascade Browser Launcher" (projects/13312037708973892397). Type, spacing, shape and component rules come from its DESIGN.md; the palette follows its "Cascade - Nord Industrial & Amber" screen (steel + amber) rather than the DESIGN.md's cobalt/azure. Tokens live in `src/style.css`.

## Brand & Style
A launcher for orchestrating many isolated browser contexts at once. The tone is high-contrast, disciplined and calm: structural borders, a precise spatial cadence and deliberate colour signals instead of ornament. It should read as fast, reliable and containerised.

## Colors
- **Steel neutrals** carry everything structural. Canvas `#F0F4F8`; cards are white; rows nested in cards are `#F8FAFC`. Text is `#0F172A`, secondary text `#475569`, muted `#64748B`.
- **Hairlines**: `line` `#E2E8F0` for idle separation, `line-strong` `#CBD5E1` for controls and card edges.
- **Ink** `#1E293B` marks the active nav item and dark utility surfaces.
- **Amber** is the one accent: launch, live/running state, focus, selection, gauges.
  - `primary` `#B45309` for text and for filled buttons with white labels (passes AA).
  - `primary-container` `#D97706` for bars, dots, borders and tints (non-text only).
  - `primary-bright` `#FBBF24` for icons on ink.
- **Status**: `tertiary` green `#2F7A4A` for healthy/done, `secondary` Nord frost `#4C6A92` for launching, `warning` `#C2410C` for stalled, `danger` `#C62828` for failures and destructive actions. Always pair status colour with an icon or label, since warning and danger sit close in hue.

## Typography
Hanken Grotesk for UI, JetBrains Mono for values.
- Mono (`code-*`) is reserved for seeds, flags, IDs, timers, sizes and other machine values, with tabular figures forced.
- Headlines use tight negative tracking; page titles use `headline-md` at bold weight.
- Micro labels and overlines (`label-sm`, `overline`) run at weight 500–600 with positive tracking, uppercase for section headings.

## Layout & Spacing
- Fixed 260px sidebar (brand, nav, saved presets, telemetry card pinned to the bottom).
- 64px header right of the sidebar holding global launch controls: randomize-profile switch, instance stepper, backend status pill, primary Launch button.
- Launcher content is a centred column (`max-w-3xl`, 32px vertical padding) of stacked cards with 24px gaps. The run monitor uses the full content width.
- Cards pad at `space-lg`; nested rows pad at `space-md`.

## Elevation & Depth
Planar layering, no blur. White cards on the steel canvas with 1px `line-strong` borders and a faint `shadow-sm`. Nested rows step down to `surface-container-low` with `line` borders. Only active or floating elements project: drawers, modals and the primary button get the directional shadow `0 4px 12px rgba(15,23,42,.06), 0 1px 2px rgba(15,23,42,.04)` or stronger.

## Shapes
- 8px (`rounded`) for buttons, inputs, nested rows.
- 12px (`rounded-md`) for cards, modals and the matrix container.
- 4px (`rounded-sm`) for chips, badges and matrix cells.
- Full pills only for live status: the status pill, the nav run badge, status dots, switches and gauge tracks.

## Components
- **Primary button**: 40px, `primary` fill, white `label-lg`, hover `primary-hover`, 150ms ease-out, presses down 1px.
- **Secondary button**: white fill, 1px `line-strong` border; hover fills `surface-container` and darkens the border to `on-surface`.
- **Chip button** (`.chip-btn`): 28px compact variant of secondary, used for per-attribute "Random" actions.
- **Danger button**: 1px `danger` border over a 6% `danger` tint, `danger` text.
- **Inputs & selects** (`.field`): 40px, white, `line-strong` border, mono `code-sm`. Focus: `primary-container` border plus a 2px 20% amber ring.
- **Switch** (`.switch`): 32×16 pill (36×20 in the header), steel track, amber when on, white thumb.
- **Attribute rows** (`.panel`): icon + `label-lg` title + mono flag hint, `body-sm` description, control, then a `meta-row` showing the resolved value. Rows fade to 50% when the per-instance profile overrides them.
- **Chips** (`.chip`): 24px, 4px radius, `surface-container` fill, `line` border, mono text.
- **Nav**: idle items `on-surface-variant` with a `surface-container` hover; the active item is solid ink with white text and an amber icon.
- **Gauges**: 6px rounded track in `surface-container-high`, fill amber, shifting to warning/danger past 60% and 90% of the host budget.
- **Run matrix**: 32px rows with a faint zebra, amber tint and a 2px amber tick on the selected row. Step cells tint amber by duration against the step median (15% / 40% / solid `primary` beyond 2×). The running cell pulses amber; stalled cells use a warning outline; failures use a danger outline.
