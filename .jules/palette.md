# Palette's Journal

## 2024-05-22 - Clickable Divs vs Buttons
**Learning:** Found critical accessibility pattern violation in file selection list where `div`s with `onClick` were used instead of buttons, making the UI inaccessible to keyboard users.
**Action:** Always use `<button type="button">` for interactive list items, ensuring `w-full text-left` is applied to maintain layout.

## 2024-05-23 - Tooltip Triggers for Non-Interactive Elements
**Learning:** Tooltip triggers that wrap non-interactive elements (like `div` or `span`) are not focusable by default, making the tooltip inaccessible to keyboard users.
**Action:** Replace wrapper `div`s with `<button type="button">` for tooltip triggers, ensuring they have an appropriate `aria-label` if the icon alone is insufficient.
