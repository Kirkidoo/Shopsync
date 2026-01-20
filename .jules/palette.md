# Palette's Journal

## 2024-05-22 - Clickable Divs vs Buttons
**Learning:** Found critical accessibility pattern violation in file selection list where `div`s with `onClick` were used instead of buttons, making the UI inaccessible to keyboard users.
**Action:** Always use `<button type="button">` for interactive list items, ensuring `w-full text-left` is applied to maintain layout.

## 2025-02-23 - Native Confirm vs Shadcn Alert
**Learning:** Native `confirm()` blocks the thread and breaks visual consistency with the design system.
**Action:** Always use `AlertDialog` from the component library for destructive confirmations to maintain a seamless, accessible experience.
