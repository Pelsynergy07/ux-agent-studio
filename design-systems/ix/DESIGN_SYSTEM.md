---
name: Siemens iX
description: Open-source Siemens design system for industrial software (web components, classic theme).
engine: ix
renderable: true
---

# Building with Siemens iX

Every screen must be buildable by an engineering team using iX **as is**. Use only iX components and
iX theme tokens. If something isn't in iX, compose it from iX components and plain layout HTML
(`div` with flex/grid), and say so in the notes.

## Page shell (use this on every screen)
```html
<ix-application>
  <ix-application-header name="Product name">
    <ix-icon-button icon="alarm-bell" variant="tertiary"></ix-icon-button>
    <ix-avatar username="Jane Doe"></ix-avatar>
  </ix-application-header>
  <ix-menu>
    <ix-menu-item icon="home">Home</ix-menu-item>
    <ix-menu-item icon="alarm" active>Alarms</ix-menu-item>
  </ix-menu>
  <ix-content>
    <ix-content-header slot="header" header-title="Page title" header-subtitle="Optional subtitle"></ix-content-header>
    <!-- page content -->
  </ix-content>
</ix-application>
```
For a dialog state, render the underlying page plus an `ix-modal` structure inline, or describe the dialog as its own screen.

## Rules
- **Text:** use `<ix-typography format="h1…h6 | body | body-sm | label | label-sm | display | code">` (add `bold` for emphasis, `text-color="soft|weak"` for secondary text), not raw `h1`/`p` styling.
- **Colour and spacing:** only theme tokens in CSS, for example `var(--theme-color-1)`, `var(--theme-color-soft-bdr)`,
  `var(--theme-color-std-text)`, `var(--theme-color-weak-text)` and spacing `var(--theme-space-1)` to `var(--theme-space-6)`. Never hex colours.
- **Layout:** `ix-layout-grid` > `ix-row` > `ix-col size="…"` (12 columns), or simple flex/grid divs in `css`.
- **Tables:** `<table class="table">` with `thead`/`tbody` (styled by iX). Put status in `ix-pill` and row actions in `ix-icon-button`.
- **Status and severity:** `ix-pill variant="alarm|critical|warning|info|success|neutral"`. Never rely on colour alone; always include a text label.
- **Empty, loading and error states:** `ix-empty-state`, `ix-spinner`, `ix-message-bar type="alarm|critical|warning|info|success|neutral"`.
- **Icons:** use only these names: home, cogwheel, search, plus, minus, close, trashcan, pen, download, upload, filter, info, warning, error, success, check, user-management, user-profile, chevron-right, chevron-left, chevron-down, chevron-up, refresh, export, import, calendar, clock, alarm, alarm-bell, notification, notifications, maintenance, trend, list, list-sorted, eye, location, star, more-menu, context-menu, document, document-success, copy, link, open-external, lock, plant-details, checkbox, undo, redo, play, pause, stop, history, barchart, piechart, table, dashboard, sort-ascending, sort-descending.
- **Accessibility:** label every input (`label` attribute), give icon-only buttons an `aria-label`, and keep a logical heading order.
- **Lo-fi vs hi-fi:** the markup is the same. Lo-fi is shown with a greyscale wireframe theme, so put
  effort into structure, hierarchy, real content and states. The full colour theme is applied later.
