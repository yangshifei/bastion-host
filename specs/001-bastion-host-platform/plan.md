# Implementation Plan: Color Scheme Optimization

**Branch**: `001-bastion-host-platform` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: User request: "整体系统的颜色搭配给我一个优化方案"

## Summary

Refine the bastion host's visual identity by introducing a cohesive design token system. Replace the current monochromatic cyan+slate palette with a proper semantic color hierarchy: primary/secondary accent, functional status colors (info/success/warning/error), dedicated light theme palette, and data visualization colors. Improve WCAG contrast ratios and visual depth.

## Technical Context

**Language/Version**: TypeScript 5.x / React 18

**Primary Dependencies**: Tailwind CSS 3.x (utility-first CSS), TDesign React (component library with theming), CSS custom properties

**Storage**: N/A (CSS-only change; user theme preference already persisted in `appStore`)

**Testing**: Visual regression via manual review in Chrome/Firefox/Edge; no automated visual testing

**Target Platform**: Modern browsers (Chrome, Firefox, Edge last 2 versions). Desktop-first layout.

**Project Type**: Web application (React SPA frontend + Express backend)

**Performance Goals**: No runtime cost — all color logic in CSS custom properties. Theme switch must complete within 100ms (instant repaint).

**Constraints**: Must preserve existing component markup. No DOM structure changes. Only CSS variables, Tailwind config, and TDesign overrides touched.

**Scale/Scope**: ~600 lines of CSS, 1 Tailwind config, 1 main stylesheet. Affects all ~14 pages and ~12 components.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project has no formal constitution file (`.specify/memory/constitution.md` not found). Using CLAUDE.md principles as guidance:

| Gate | Status | Notes |
|------|--------|-------|
| **Simplicity First** | ✅ PASS | CSS custom properties are the simplest mechanism; no CSS-in-JS or build-time theming |
| **Surgical Changes** | ✅ PASS | Only CSS and config files modified; no component logic touched |
| **Goal-Driven** | ✅ PASS | Success criteria: improved contrast, visual hierarchy, light theme quality |
| **No Abstraction for Single Use** | ✅ PASS | Design tokens are inherently multi-use across entire app |
| **Match Existing Style** | ✅ PASS | Preserves existing component class names and markup structure |

## Project Structure

### Documentation (this feature)

```text
specs/001-bastion-host-platform/
├── plan.md              # This file
├── research.md          # Phase 0: Color system research
├── data-model.md        # Phase 1: Design token specification
├── quickstart.md        # Phase 1: Validation guide
└── contracts/           # Phase 1: CSS custom property contract
    └── tokens.md        # Design token interface
```

### Source Code (files touched)

```text
client/
├── src/
│   ├── styles/
│   │   └── globals.css          # PRIMARY: All CSS custom properties + component classes
│   └── tailwind.config.js       # Tailwind color/spacing extension
└── index.html                   # Possibly: font imports
```

**Structure Decision**: Single web app structure. Color tokens are defined as CSS custom properties in `:root` / `html[theme-mode='dark']` / `html[theme-mode='light']` blocks. Tailwind config references these variables. All component markup stays unchanged.

## Complexity Tracking

No violations to justify. This is a pure CSS refinement with minimal surface area.
