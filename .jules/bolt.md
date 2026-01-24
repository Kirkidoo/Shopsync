## 2024-05-23 - Optimizing List Rendering with Memoization

**Learning:** When rendering a list where each item contains a complex component (like a `Select` with many options) inside a state-managed parent (like `MediaManager`), any state update in the parent causes all list items to re-render. This is particularly expensive when each item creates a new React element tree for its children (e.g., `SelectContent` children).

**Action:** Extract the list item into a separate component wrapped in `React.memo`. This ensures that only the modified item re-renders. Additionally, ensure that callback props passed to the memoized component are stable (using `useCallback`) to prevent unnecessary re-renders. If the callback depends on changing state (like `variants`), use `useRef` to access the latest state inside the callback without invalidating the memoization.

## 2026-01-24 - Pre-computation for List Rendering Lookups

**Learning:** Performing a `filter` on a large dataset inside a list rendering loop (O(N*M)) causes significant rendering lag. Even if the list itself is paginated, the repeated iteration over the full dataset for each row is expensive.

**Action:** Pre-compute a lookup map (e.g., grouped by ID or handle) using `useMemo` in the parent hook/component (O(N)). Pass this map to the list component to allow O(1) lookups inside the render loop.
