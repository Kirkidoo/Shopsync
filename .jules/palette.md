## 2024-05-23 - Interactive Cards Accessibility
**Learning:** Nested interactive elements (buttons/checkboxes inside a card div) create a "trap" for keyboard users if the container's controls are only revealed on hover.
**Action:** Always use `group-focus-within:opacity-100` alongside `group-hover:opacity-100` for overlays containing form controls to ensure keyboard users can see what they are interacting with.
