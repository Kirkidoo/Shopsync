## 2024-05-24 - Accessible Status Indicators
**Learning:** Tooltip triggers wrapping non-interactive elements (like `div`) are inaccessible to keyboard users. Additionally, hiding status indicators on hover to reveal action buttons forces users to lose context when performing actions.
**Action:** Always use `<button type="button">` for interactive tooltip triggers. Position status indicators (like "Assigned") to coexist with action buttons (like "Delete") instead of swapping them, ensuring both are visible and accessible.
