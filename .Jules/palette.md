## 2024-05-22 - Tooltip Triggers on Non-Interactive Elements
**Learning:** Tooltips on `div` or `span` elements (like status icons) are inaccessible to keyboard users because they cannot receive focus.
**Action:** Always add `tabIndex={0}`, `role="button"` (or appropriate role), and `aria-label` to non-interactive elements that trigger tooltips, or use a button element.
