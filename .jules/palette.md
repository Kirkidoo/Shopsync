# Palette's Journal

## 2024-05-22 - Clickable Divs vs Buttons
**Learning:** Found critical accessibility pattern violation in file selection list where `div`s with `onClick` were used instead of buttons, making the UI inaccessible to keyboard users.
**Action:** Always use `<button type="button">` for interactive list items, ensuring `w-full text-left` is applied to maintain layout.

## 2024-05-23 - Hover Conflicts with Positioning
**Learning:** Tooltip triggers inside a container that changes state on hover (e.g., showing an overlay) can become inaccessible if the overlay covers the trigger or if the trigger hides itself. Position absolute elements carefully to avoid overlap.
**Action:** When designing hover interactions, ensure controls remain visible and reachable. Use `z-index` or separate positioning (e.g., bottom vs top corners) to prevent conflict between overlays and persistent indicators.
