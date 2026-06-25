# Quickstart: Color Scheme Validation Guide

**Feature**: Color Scheme Optimization | **Date**: 2026-06-24

## Prerequisites

- Dev server running: `cd client && npx vite`
- Modern browser with DevTools (Chrome recommended for contrast checking)
- Existing test account (admin role for full page access)

## Validation Scenarios

### Scenario 1: Theme Toggle Persistence

**Goal**: Verify theme switch works and persists across page reloads.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Start on dark theme (default) | Dark background (`#0a101c`), cyan accent visible |
| 2 | Click theme toggle (🌙/☀️ button in header) | Instant switch to light theme; no flash of unstyled content |
| 3 | Refresh the page (F5) | Light theme persists (from localStorage) |
| 4 | Click toggle again | Dark theme restored |
| 5 | Clear localStorage, refresh | Defaults to dark theme |

### Scenario 2: Contrast Verification (Dark Theme)

**Goal**: Verify all text meets WCAG AA contrast (4.5:1 for normal text).

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Dashboard as admin | Stat card values clearly readable; stat labels visible |
| 2 | Navigate to Audit Log | Table rows readable; header text distinct |
| 3 | Open form fields (e.g., Add Asset) | Placeholder text visible (`--text-muted` ≥ #94a3b8) |
| 4 | DevTools → inspect any text → check computed color | Text primary = `#f1f5f9`, secondary = `#94a3b8` |

**Contrast tool**: Open Chrome DevTools → Rendering → "CSS Overview" → check contrast issues.

### Scenario 3: Contrast Verification (Light Theme)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Switch to light theme | Cards have visible borders on white background |
| 2 | Navigate pages | Text readable, no washed-out sections |
| 3 | Check `--border-default` opacity | Should be ≥ 0.14 (more visible than dark theme's 0.10) |

### Scenario 4: New Status Colors

**Goal**: Verify the new `--status-*` tokens render correctly.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to Active Sessions | Connected sessions show green (`--status-success`) status indicator |
| 2 | Navigate to Audit Log → terminated sessions | "Blocked" tags use red (`--status-error`) |
| 3 | Check TDesign Tag components | Success=green, Warning=amber, Danger=red, Info=sky |

### Scenario 5: Secondary Accent (Amber)

**Goal**: Verify the new amber accent appears in appropriate places.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to Dashboard | Secondary stats/indicators may use amber accent |
| 2 | Check focus rings on interactive elements | Focus-visible ring uses `--accent-warm` (amber) |
| 3 | Hover over interactive cards | Border or shadow transition uses warm accent subtly |

### Scenario 6: Session Replay Page

**Goal**: Verify replay player colors survived the theme changes.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to Session Replay | Control bar colors correct in both themes |
| 2 | Play a recording | Glow ring uses `--accent` (cyan), not hardcoded color |
| 3 | Check "LIVE" indicator | Uses `--status-success` green |

### Scenario 7: Dashboard Data Viz

**Goal**: Verify the 8-color data viz palette renders distinct colors.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Dashboard | Stat cards use distinct visual indicators |
| 2 | Check color variety | At least 4 distinct color categories visible |

## Run Commands

```bash
# Start dev server
cd client && npx vite

# Build for production verification
cd client && npx vite build && npx vite preview

# Check for hardcoded color values that should use tokens
cd client && rg '#[0-9a-fA-F]{6}' src/ --type tsx --type css | grep -v node_modules | grep -v '//'
```

## Success Criteria

- [ ] Both themes render without visual regressions on all 14 pages
- [ ] No hardcoded `#06b6d4` or `#f59e0b` in component TSX files (should use Tailwind classes)
- [ ] Light theme borders are perceptibly visible (current issue: near-invisible)
- [ ] Text-muted (#94a3b8) is readable in dark mode
- [ ] Theme toggle works instantly (<100ms visual change)
- [ ] TDesign components (Table, Button, Tag, Dialog, etc.) render correctly in both themes
