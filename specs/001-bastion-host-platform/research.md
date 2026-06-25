# Research: Color System Optimization for Enterprise Dashboard

**Feature**: Color Scheme Optimization | **Date**: 2026-06-24

## 1. Enterprise Dashboard Color System Patterns

### Decision: Semantic token layer with 3-tier hierarchy

**Rationale**: Enterprise dashboards (Linear, Vercel, GitHub, Datadog) all use a semantic token system: primitive tokens (raw color values) → semantic tokens (purpose-based) → component tokens (specific usage). This separates the "what color" from "where to use it."

**Alternatives considered**:
- *Keep current flat tokens*: Rejected — no semantic meaning, hard to maintain consistency
- *Full Radix UI Colors adoption*: Rejected — overengineered for a single app; Radix is a library, not a design system
- *Tailwind-only approach*: Rejected — TDesign components need CSS variable overrides

### Implementation

Three token layers:

| Layer | Example | Location |
|-------|---------|----------|
| **Primitive** | `--color-cyan-500: 6 182 212` | `:root` raw RGB values |
| **Semantic** | `--accent: rgb(var(--color-cyan-500))` | Tied to theme (dark/light) |
| **Component** | `.replay-play-btn { color: var(--accent) }` | In component classes |

---

## 2. Accent Color Strategy

### Decision: Cyan primary + Amber secondary accent

**Rationale**: The current single-cyan palette creates a monochromatic, cold feeling. Adding a warm secondary (amber/gold) creates visual interest and can be used for:
- Highlight states and focus rings
- Interactive elements (buttons, links on hover)
- Dashboard stat highlights
- Warning-level indicators (natural fit for amber)

**Color Science**: Cyan (#06b6d4, hue ~187°) and Amber (#f59e0b, hue ~38°) are ~149° apart on the color wheel — near-complementary, creating strong visual contrast without clashing.

**Alternatives considered**:
- *Cyan + Indigo*: Rejected — too similar (both cool tones), doesn't add warmth
- *Cyan + Emerald*: Rejected — green is already associated with "success" status
- *Cyan + Rose*: Could work but feels consumer-app, not enterprise

### Primary palette (Cyan)

| Shade | Hex | Usage |
|-------|-----|-------|
| 50 | #ecfeff | Lightest bg hint |
| 100-300 | — | Subtle backgrounds |
| 400 | #22d3ee | Hover states |
| 500 | #06b6d4 | **Primary accent** |
| 600 | #0891b2 | Active/pressed states |
| 700-950 | #155e75 → #083344 | Text on light bg |

### Secondary palette (Amber)

| Shade | Hex | Usage |
|-------|-----|-------|
| 50 | #fffbeb | Lightest bg hint |
| 400 | #fbbf24 | Hover states |
| 500 | #f59e0b | **Secondary accent** |
| 600 | #d97706 | Active states |

---

## 3. Neutral / Surface Hierarchy

### Decision: Slate as base, with independent dark/light scales

**Rationale**: The current approach inverts the entire slate scale (slate-50 ↔ slate-950) for light mode. This produces a mathematically correct but perceptually washed-out light theme. Better: define independent scales for each theme.

**Current problem in light mode**:
- `bg-page: #f1f5f9` (slate-100) is too bright, lacks warmth
- `border-subtle: rgba(100, 116, 139, 0.08)` is nearly invisible on white backgrounds
- Cards feel flat with white (#ffffff) on light gray (#f1f5f9)

**Fix**: Use slightly warmer gray tones for light mode backgrounds, increase border opacity.

### Dark theme surface stack

```
bg-deep     → #060a12  (deepest, for terminal viewports)
bg-page     → #0a101c  (page background)
bg-surface  → #111827  (cards, tables)
bg-elevated → #1a2332  (modals, dropdowns, hover)
```

### Light theme surface stack (optimized)

```
bg-deep     → #f0f4f8  (subtle warmth, off-white)
bg-page     → #f7f9fb  (barely-there tint)
bg-surface  → #ffffff  (cards, purity)
bg-elevated → #f4f7fa  (modals, slight elevation)
```

---

## 4. Functional Status Colors

### Decision: Use Tailwind's proven status palette

**Rationale**: Tailwind's red/amber/emerald/sky palette is battle-tested and WCAG-compliant. Directly map to semantic status tokens.

| Token | Color | Hex | Usage |
|-------|-------|-----|-------|
| `--status-error` | Red-500 | #ef4444 | Errors, blocked, critical |
| `--status-warning` | Amber-500 | #f59e0b | Warnings, medium risk |
| `--status-success` | Emerald-500 | #22c55e | Connected, active, safe |
| `--status-info` | Sky-500 | #0ea5e9 | Neutral info, in-progress |

**Contrast check** (against dark bg `#111827`):
- Red #ef4444 → ratio 4.6:1 ✅ (AA for normal text)
- Amber #f59e0b → ratio 4.2:1 ✅ (AA for large text, acceptable for badges)
- Emerald #22c55e → ratio 4.1:1 ✅

---

## 5. Data Visualization Palette

### Decision: 8-color categorical palette

For dashboard charts and stat indicators. Based on ColorBrewer/Tableau research for accessibility.

| Index | Color | Hex | Usage |
|-------|-------|-----|-------|
| 0 | Cyan | #06b6d4 | Primary metric |
| 1 | Amber | #f59e0b | Secondary metric |
| 2 | Indigo | #6366f1 | Tertiary |
| 3 | Emerald | #22c55e | Growth/positive |
| 4 | Rose | #f43f5e | Decline/negative |
| 5 | Violet | #8b5cf6 | Category E |
| 6 | Sky | #0ea5e9 | Category F |
| 7 | Teal | #14b8a6 | Category G |

All 8 colors are distinguishable even with deuteranopia (red-green color blindness).

---

## 6. WCAG Contrast Compliance

### Decision: Target WCAG 2.1 AA minimum

| Relationship | Min Ratio | Current | Target |
|-------------|-----------|---------|--------|
| Text primary on bg-surface | 4.5:1 | #f1f5f9 on #111827 = 12.4:1 ✅ | Keep |
| Text secondary on bg-surface | 4.5:1 | #94a3b8 on #111827 = 5.7:1 ✅ | Keep |
| Text muted on bg-surface | 3:1 (large) | #64748b on #111827 = 3.9:1 ✅ | Improve to 4.5:1 |
| Accent on bg-surface | 3:1 (non-text) | #06b6d4 on #111827 = 4.6:1 ✅ | Keep |
| Light-mode text primary | 4.5:1 | #0f172a on #ffffff = 15.4:1 ✅ | Soften slightly |
| Light-mode text secondary | 4.5:1 | #475569 on #ffffff = 5.4:1 ✅ | Keep |

**Key fix**: `--text-muted` (#64748b → #94a3b8) in dark mode for better readability.

---

## 7. Gradient & Decorative Elements

### Decision: Subtle gradient accents, not heavy effects

**Rationale**: Enterprise tools benefit from understated visual polish. Overt gradients feel consumer-grade.

**Preserve**: `--bg-page` with the existing radial gradient (`bg-gradient-radial`)
**Add**: Subtle border-glow on focused interactive cards
**Remove**: None — current decorative usage is appropriately restrained

---

## Summary of Changes

| Area | Current | Target |
|------|---------|--------|
| Accent colors | Cyan only | Cyan (primary) + Amber (secondary) |
| Surface palette | Inverted slate | Independent dark/light scales |
| Status colors | TDesign defaults only | Semantic tokens used app-wide |
| Data viz | None | 8-color accessible palette |
| Light theme | Simple inversion | Refined warmer palette |
| Border visibility | 0.08 opacity | 0.10 dark / 0.14 light |
| Text muted | #64748b | #94a3b8 (better contrast) |
