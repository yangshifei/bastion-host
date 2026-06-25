# CSS Custom Property Contract

**Feature**: Color Scheme Optimization | **Date**: 2026-06-24

## Contract Purpose

This document defines the **public API** of the design token system. Any component or page that consumes CSS custom properties must reference only the semantic tokens listed here. Raw primitive tokens are implementation details and may change without notice.

## Stable Tokens (Public API)

These tokens are guaranteed stable across releases. Components may freely reference them.

### Surface Tokens

| Token | Description | Dark Default | Light Default |
|-------|-------------|-------------|---------------|
| `--bg-deep` | Deepest background (terminals, code blocks) | `#060a12` | `#f0f4f8` |
| `--bg-page` | Page-level background | `#0a101c` | `#f7f9fb` |
| `--bg-surface` | Card/panel/table background | `#111827` | `#ffffff` |
| `--bg-elevated` | Modal/dropdown/hover elevation | `#1a2332` | `#f4f7fa` |

### Border Tokens

| Token | Description | Dark Default | Light Default |
|-------|-------------|-------------|---------------|
| `--border-subtle` | Subtle separators (card internal borders) | `rgba(148,163,184,0.08)` | `rgba(100,116,139,0.10)` |
| `--border-default` | Default component borders | `rgba(148,163,184,0.10)` | `rgba(100,116,139,0.14)` |

### Text Tokens

| Token | Description | Dark Default | Light Default |
|-------|-------------|-------------|---------------|
| `--text-primary` | Primary body text, headings | `#f1f5f9` | `#0f172a` |
| `--text-secondary` | Secondary labels, descriptions | `#94a3b8` | `#475569` |
| `--text-muted` | Placeholders, disabled text | `#94a3b8` | `#64748b` |

### Accent Tokens

| Token | Description | Dark Default | Light Default |
|-------|-------------|-------------|---------------|
| `--accent` | Primary brand color | `#06b6d4` | `#0891b2` |
| `--accent-hover` | Accent on hover | `#22d3ee` | `#06b6d4` |
| `--accent-soft` | Subtle accent background tint | `rgba(6,182,212,0.12)` | `rgba(8,145,178,0.08)` |

### Secondary Accent Tokens (NEW)

| Token | Description | Dark Default | Light Default |
|-------|-------------|-------------|---------------|
| `--accent-warm` | Warm accent (highlights, focus) | `#f59e0b` | `#d97706` |
| `--accent-warm-hover` | Warm accent on hover | `#fbbf24` | `#f59e0b` |
| `--accent-warm-soft` | Subtle warm accent background | `rgba(245,158,11,0.12)` | `rgba(217,119,6,0.08)` |

### Status Tokens (NEW)

| Token | Description | Dark Default | Light Default |
|-------|-------------|-------------|---------------|
| `--status-error` | Errors, critical, blocked | `#ef4444` | `#dc2626` |
| `--status-error-soft` | Error background tint | `rgba(239,68,68,0.12)` | `rgba(220,38,38,0.10)` |
| `--status-warning` | Warnings, medium risk | `#f59e0b` | `#d97706` |
| `--status-warning-soft` | Warning background tint | `rgba(245,158,11,0.12)` | `rgba(217,119,6,0.10)` |
| `--status-success` | Success, active, connected | `#22c55e` | `#16a34a` |
| `--status-success-soft` | Success background tint | `rgba(34,197,94,0.12)` | `rgba(22,163,74,0.10)` |
| `--status-info` | Information, progress, neutral | `#0ea5e9` | `#0284c7` |
| `--status-info-soft` | Info background tint | `rgba(14,165,233,0.12)` | `rgba(2,132,199,0.10)` |

### Data Viz Tokens (NEW)

| Token | Description | Value |
|-------|-------------|-------|
| `--viz-0` | Primary metric | `#06b6d4` |
| `--viz-1` | Secondary metric | `#f59e0b` |
| `--viz-2` | Tertiary | `#6366f1` |
| `--viz-3` | Growth/positive | `#22c55e` |
| `--viz-4` | Decline/negative | `#f43f5e` |
| `--viz-5` | Category E | `#8b5cf6` |
| `--viz-6` | Category F | `#0ea5e9` |
| `--viz-7` | Category G | `#14b8a6` |

---

## Unstable Tokens (Implementation Detail)

These tokens exist in the CSS but are **not part of the public contract**. Components MUST NOT reference them directly. Use semantic tokens instead.

- `--color-slate-*` — Use `--text-*` or `--bg-*` instead
- `--color-cyan-*` — Use `--accent*` instead
- `--color-amber-*` — Use `--accent-warm*` instead
- `--color-red-*`, `--color-emerald-*`, etc. — Use `--status-*` instead
- `--td-*` — TDesign internal overrides; managed centrally

## Contract Version

**Version**: 1.0.0
**Last Updated**: 2026-06-24
**Breaking Change Policy**: Removing or renaming a Stable Token is a BREAKING change. Adding new tokens is backward-compatible.
