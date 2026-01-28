# Palette's Journal

## 2024-05-22 - Clickable Divs vs Buttons
**Learning:** Found critical accessibility pattern violation in file selection list where `div`s with `onClick` were used instead of buttons, making the UI inaccessible to keyboard users.
**Action:** Always use `<button type="button">` for interactive list items, ensuring `w-full text-left` is applied to maintain layout.

## 2024-05-24 - Native Confirm vs AlertDialog
**Learning:** Found usage of `window.confirm` for destructive actions, which is jarring and less accessible than the design system's dialogs.
**Action:** Replace all instances of `window.confirm` with Shadcn UI `AlertDialog` component to ensure consistent, accessible warnings for destructive actions.
