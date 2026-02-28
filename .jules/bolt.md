## 2024-05-23 - Optimizing List Rendering with Memoization

**Learning:** When rendering a list where each item contains a complex component (like a `Select` with many options) inside a state-managed parent (like `MediaManager`), any state update in the parent causes all list items to re-render. This is particularly expensive when each item creates a new React element tree for its children (e.g., `SelectContent` children).

**Action:** Extract the list item into a separate component wrapped in `React.memo`. This ensures that only the modified item re-renders. Additionally, ensure that callback props passed to the memoized component are stable (using `useCallback`) to prevent unnecessary re-renders. If the callback depends on changing state (like `variants`), use `useRef` to access the latest state inside the callback without invalidating the memoization.

## 2026-01-31 - Optimizing Table Rendering with Pre-computed Grouping

**Learning:** When rendering a list of items (like a table) where each row requires filtering the entire dataset to find related items (e.g., variants of a product), performance degrades to O(N*M) where N is rows per page and M is total dataset size.

**Action:** Pre-compute the grouping (e.g., a map of `handle -> items[]`) once in the data hook/service (O(M)). Then, inside the row component, perform an O(1) lookup. This dramatically reduces the complexity of rendering, especially for large datasets.
