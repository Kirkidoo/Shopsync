## 2024-05-23 - Optimizing List Rendering with Memoization

**Learning:** When rendering a list where each item contains a complex component (like a `Select` with many options) inside a state-managed parent (like `MediaManager`), any state update in the parent causes all list items to re-render. This is particularly expensive when each item creates a new React element tree for its children (e.g., `SelectContent` children).

**Action:** Extract the list item into a separate component wrapped in `React.memo`. This ensures that only the modified item re-renders. Additionally, ensure that callback props passed to the memoized component are stable (using `useCallback`) to prevent unnecessary re-renders. If the callback depends on changing state (like `variants`), use `useRef` to access the latest state inside the callback without invalidating the memoization.

## 2026-01-18 - Replacing Nested Filter with Map Lookup

**Learning:** In `AuditTable`, filtering the entire `data` array (O(N)) inside the paginated render loop (O(K)) created an O(N*K) bottleneck. This caused performance degradation as the dataset size increased, even with pagination enabled, because the filter ran for every visible item on every render.

**Action:** Pre-compute a lookup Map (keyed by handle) using `useMemo` at the component level. This reduces the operation inside the loop to a Map lookup (O(1)), changing the overall complexity to O(N + K).
