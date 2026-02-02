# Palette's Journal

## 2024-05-22 - Clickable Divs vs Buttons
**Learning:** Found critical accessibility pattern violation in file selection list where `div`s with `onClick` were used instead of buttons, making the UI inaccessible to keyboard users.
**Action:** Always use `<button type="button">` for interactive list items, ensuring `w-full text-left` is applied to maintain layout.

## 2025-02-18 - Tooltip Accessibility & Overlapping Actions
**Learning:** Status indicators that double as tooltip triggers were being hidden on card hover (to show delete actions), making the tooltip content inaccessible to mouse users. Using a `div` also excluded keyboard users.
**Action:** Ensure tooltip triggers are always visible or persistently available. Use focusable elements (buttons) and position them to avoid overlap with other actions like delete buttons.
