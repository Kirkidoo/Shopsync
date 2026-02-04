# Palette's Journal

## 2024-05-22 - Clickable Divs vs Buttons
**Learning:** Found critical accessibility pattern violation in file selection list where `div`s with `onClick` were used instead of buttons, making the UI inaccessible to keyboard users.
**Action:** Always use `<button type="button">` for interactive list items, ensuring `w-full text-left` is applied to maintain layout.

## 2024-05-23 - Tooltip Accessibility & Positioning
**Learning:** Tooltips triggered by non-interactive elements (like `div`) are inaccessible to keyboard users. Also, status indicators positioned in the same corner as hover-revealed actions (like delete) create visual conflict.
**Action:** Always use `<button type="button">` for tooltip triggers. Position informational badges (like assignment status) in a different corner (e.g., bottom-right) from primary actions (e.g., top-right) to allow persistent visibility.
