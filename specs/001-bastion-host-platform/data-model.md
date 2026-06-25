# Design Token Specification: Color System

**Feature**: Color Scheme Optimization | **Date**: 2026-06-24

## Token Hierarchy

```
Primitive Tokens (raw color values)
  └── Semantic Tokens (purpose-based, theme-aware)
        └── Component Tokens (usage in Tailwind classes / TDesign overrides)
```

## 1. Primitive Tokens

Raw RGB channel values. Theme-invariant.

### Accent — Cyan
| Token | R | G | B | Hex |
|-------|---|---|---|------|
| `--color-cyan-50` | 236 | 254 | 255 | #ecfeff |
| `--color-cyan-100` | 207 | 250 | 254 | #cffafe |
| `--color-cyan-200` | 165 | 243 | 252 | #a5f3fc |
| `--color-cyan-300` | 103 | 232 | 249 | #67e8f9 |
| `--color-cyan-400` | 34 | 211 | 238 | #22d3ee |
| `--color-cyan-500` | 6 | 182 | 212 | #06b6d4 |
| `--color-cyan-600` | 8 | 145 | 178 | #0891b2 |
| `--color-cyan-700` | 14 | 116 | 144 | #0e7490 |
| `--color-cyan-800` | 21 | 94 | 117 | #155e75 |
| `--color-cyan-900` | 22 | 78 | 99 | #164e63 |
| `--color-cyan-950` | 8 | 51 | 68 | #083344 |

### Accent — Amber (new)
| Token | R | G | B | Hex |
|-------|---|---|---|------|
| `--color-amber-400` | 251 | 191 | 36 | #fbbf24 |
| `--color-amber-500` | 245 | 158 | 11 | #f59e0b |
| `--color-amber-600` | 217 | 119 | 6 | #d97706 |

### Neutral — Slate (dark theme)
| Token | R | G | B | Hex |
|-------|---|---|---|------|
| `--color-slate-50` | 248 | 250 | 252 | #f8fafc |
| `--color-slate-100` | 241 | 245 | 249 | #f1f5f9 |
| `--color-slate-200` | 226 | 232 | 240 | #e2e8f0 |
| `--color-slate-300` | 203 | 213 | 225 | #cbd5e1 |
| `--color-slate-400` | 148 | 163 | 184 | #94a3b8 |
| `--color-slate-500` | 100 | 116 | 139 | #64748b |
| `--color-slate-600` | 71 | 85 | 105 | #475569 |
| `--color-slate-700` | 51 | 65 | 85 | #334155 |
| `--color-slate-800` | 30 | 41 | 59 | #1e293b |
| `--color-slate-900` | 15 | 23 | 42 | #0f172a |
| `--color-slate-950` | 6 | 10 | 18 | #060a12 |

### Status colors (new semantic primitives)
| Token | R | G | B | Hex |
|-------|---|---|---|------|
| `--color-red-500` | 239 | 68 | 68 | #ef4444 |
| `--color-amber-500` | 245 | 158 | 11 | #f59e0b |
| `--color-emerald-500` | 34 | 197 | 94 | #22c55e |
| `--color-sky-500` | 14 | 165 | 233 | #0ea5e9 |

### Data viz palette (new)
| Token | R | G | B | Hex |
|-------|---|---|---|------|
| `--color-indigo-500` | 99 | 102 | 241 | #6366f1 |
| `--color-rose-500` | 244 | 63 | 94 | #f43f5e |
| `--color-violet-500` | 139 | 92 | 246 | #8b5cf6 |
| `--color-teal-500` | 20 | 184 | 166 | #14b8a6 |

## 2. Semantic Tokens (theme-aware)

### Dark Theme (`html[theme-mode='dark']`)

```css
/* Surface hierarchy */
--bg-deep:       #060a12   /* terminal viewports, deepest elements */
--bg-page:       #0a101c   /* page background */
--bg-surface:    #111827   /* cards, tables, panels */
--bg-elevated:   #1a2332   /* modals, dropdowns, hover states */

/* Borders */
--border-subtle: rgba(148, 163, 184, 0.08)
--border-default: rgba(148, 163, 184, 0.10)

/* Text */
--text-primary:   #f1f5f9
--text-secondary: #94a3b8
--text-muted:     #94a3b8    /* improved from #64748b for contrast */

/* Accent */
--accent:         #06b6d4   /* cyan-500 */
--accent-hover:   #22d3ee   /* cyan-400 */
--accent-soft:    rgba(6, 182, 212, 0.12)  /* subtle bg tint */

/* Secondary accent (new) */
--accent-warm:        #f59e0b   /* amber-500 */
--accent-warm-hover:  #fbbf24   /* amber-400 */
--accent-warm-soft:   rgba(245, 158, 11, 0.12)

/* Status (new semantic layer) */
--status-error:       #ef4444
--status-error-soft:  rgba(239, 68, 68, 0.12)
--status-warning:     #f59e0b
--status-warning-soft: rgba(245, 158, 11, 0.12)
--status-success:     #22c55e
--status-success-soft: rgba(34, 197, 94, 0.12)
--status-info:        #0ea5e9
--status-info-soft:   rgba(14, 165, 233, 0.12)
```

### Light Theme (`html[theme-mode='light']`)

```css
/* Surface hierarchy (optimized, not just inverted) */
--bg-deep:       #f0f4f8   /* slightly warm off-white */
--bg-page:       #f7f9fb   /* near-white with subtle tint */
--bg-surface:    #ffffff   /* pure white cards */
--bg-elevated:   #f4f7fa   /* barely-there elevation */

/* Borders (higher opacity for visibility on white) */
--border-subtle: rgba(100, 116, 139, 0.10)
--border-default: rgba(100, 116, 139, 0.14)

/* Text */
--text-primary:   #0f172a
--text-secondary: #475569
--text-muted:     #64748b

/* Accent (slightly darker for light bg contrast) */
--accent:         #0891b2   /* cyan-600 */
--accent-hover:   #06b6d4   /* cyan-500 */
--accent-soft:    rgba(8, 145, 178, 0.08)

/* Secondary accent */
--accent-warm:        #d97706   /* amber-600 */
--accent-warm-hover:  #f59e0b   /* amber-500 */
--accent-warm-soft:   rgba(217, 119, 6, 0.08)

/* Status */
--status-error:       #dc2626
--status-error-soft:  rgba(220, 38, 38, 0.10)
--status-warning:     #d97706
--status-warning-soft: rgba(217, 119, 6, 0.10)
--status-success:     #16a34a
--status-success-soft: rgba(22, 163, 74, 0.10)
--status-info:        #0284c7
--status-info-soft:   rgba(2, 132, 199, 0.10)
```

## 3. Component Token Mapping

How existing component classes map to new tokens:

| Component Class | Current | New Token |
|-----------------|---------|-----------|
| `.stat-card:hover` | `border-color: var(--accent)` | Same (cyan accent) |
| `.stat-icon` | `background: linear-gradient(cyan/12, cyan/4)` | `var(--accent-soft)` |
| `.sidebar-link--active` | `background: rgba(6,182,212,0.10)` | `var(--accent-soft)` |
| `.quick-action:hover` | `border-color: var(--accent)` | Same |
| `.t-button--variant-base.t-button--theme-primary` | `--td-brand-color: #06b6d4` | `var(--accent)` |
| `.t-tag--theme-warning` | TDesign default amber | `var(--accent-warm)` |
| Error messages | `--td-error-color: #ef4444` | `var(--status-error)` |
| Success indicators | `--td-success-color: #22c55e` | `var(--status-success)` |
| `.replay-play-btn` | `text-cyan-400` | `var(--accent)` |
| `.replay-player` glow | `from-cyan-500/30` | `var(--accent) / 0.30` |

## 4. TDesign Variable Override Mapping

```css
/* Brand / Primary */
--td-brand-color:              var(--accent)
--td-brand-color-hover:        var(--accent-hover)
--td-brand-color-active:       #0891b2         /* cyan-600, same both themes */
--td-brand-color-focus:        var(--accent-soft)
--td-brand-color-light:        var(--accent-soft)

/* Status */
--td-error-color:              var(--status-error)
--td-warning-color:            var(--status-warning)
--td-success-color:            var(--status-success)

/* Surfaces (TDesign components) */
--td-bg-color-page:            var(--bg-page)
--td-bg-color-container:       var(--bg-surface)
--td-bg-color-container-hover: var(--bg-elevated)
--td-bg-color-component:       var(--bg-surface)
--td-bg-color-component-hover: var(--bg-elevated)

/* Text */
--td-text-color-primary:       var(--text-primary)
--td-text-color-secondary:     var(--text-secondary)
--td-text-color-placeholder:   var(--text-muted)

/* Borders */
--td-border-level-1-color:     var(--border-default)
--td-border-level-2-color:     rgba(148, 163, 184, 0.16)  /* unchanged */
```

## 5. Tailwind Config Mapping

```js
colors: {
  cyan: {
    400: 'var(--accent-hover)',   // references semantic token
    500: 'var(--accent)',
    600: '#0891b2',
  },
  amber: {
    400: 'var(--accent-warm-hover)',
    500: 'var(--accent-warm)',
    600: '#d97706',
  },
  // Add status color shortcuts
  status: {
    error:   'var(--status-error)',
    warning: 'var(--status-warning)',
    success: 'var(--status-success)',
    info:    'var(--status-info)',
  },
}
```

## State Transitions

Theme toggle flow (unchanged from current):
```
User clicks theme toggle
  → appStore.setTheme('dark' | 'light')
  → document.documentElement.setAttribute('theme-mode', theme)
  → CSS custom properties switch instantly (no JS animation needed)
  → Browser repaints with new color values
```
