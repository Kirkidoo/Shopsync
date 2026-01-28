## 2024-05-23 - Optimizing List Rendering with Memoization

**Learning:** When rendering a list where each item contains a complex component (like a `Select` with many options) inside a state-managed parent (like `MediaManager`), any state update in the parent causes all list items to re-render. This is particularly expensive when each item creates a new React element tree for its children (e.g., `SelectContent` children).

**Action:** Extract the list item into a separate component wrapped in `React.memo`. This ensures that only the modified item re-renders. Additionally, ensure that callback props passed to the memoized component are stable (using `useCallback`) to prevent unnecessary re-renders. If the callback depends on changing state (like `variants`), use `useRef` to access the latest state inside the callback without invalidating the memoization.

## 2025-01-28 - Optimizing List Filtering with Pre-computed Lookup

**Learning:** Performing `data.filter(...)` inside a rendering loop (e.g., inside `map`) is an O(N^2) or O(N*M) operation that scales poorly with dataset size. Even if the list being mapped is small (paginated), checking thousands of items in the main dataset for every rendered row is expensive.

**Action:** Pre-compute a lookup map (dictionary) using `useMemo` in the data hook (or parent component). This converts the O(N) filter operation inside the loop into an O(1) key lookup. Pass this map to the child component instead of the raw list.
