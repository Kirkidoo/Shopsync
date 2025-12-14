## 2024-05-23 - Interactive File List
**Learning:** `div`s with `onClick` handlers are not accessible to keyboard users or screen readers. They should be `<button>` elements or have `role="button"` with `tabIndex` and keyboard event handlers.
**Action:** Replace `onClick` `div`s with `<button>` elements, ensuring type="button" to prevent form submission, and update styles to maintain layout.
