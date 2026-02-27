# Palette's Journal

## 2024-05-22 - Clickable Divs vs Buttons
**Learning:** Found critical accessibility pattern violation in file selection list where `div`s with `onClick` were used instead of buttons, making the UI inaccessible to keyboard users.
**Action:** Always use `<button type="button">` for interactive list items, ensuring `w-full text-left` is applied to maintain layout.

## 2024-05-23 - Native Confirm vs AlertDialog
**Learning:** Found usage of native `window.confirm` for destructive actions, which breaks design system consistency and offers poor accessibility control compared to Radix `AlertDialog`.
**Action:** Replace all `window.confirm` calls with Shadcn `AlertDialog` components to ensure keyboard accessibility, focus management, and visual consistency.
