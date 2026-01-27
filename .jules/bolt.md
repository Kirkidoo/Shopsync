## 2024-05-23 - Optimizing List Rendering with Memoization

**Learning:** When rendering a list where each item contains a complex component (like a `Select` with many options) inside a state-managed parent (like `MediaManager`), any state update in the parent causes all list items to re-render. This is particularly expensive when each item creates a new React element tree for its children (e.g., `SelectContent` children).

**Action:** Extract the list item into a separate component wrapped in `React.memo`. This ensures that only the modified item re-renders. Additionally, ensure that callback props passed to the memoized component are stable (using `useCallback`) to prevent unnecessary re-renders. If the callback depends on changing state (like `variants`), use `useRef` to access the latest state inside the callback without invalidating the memoization.

## 2024-05-23 - Optimizing AuditTable Rendering

**Learning:** In list rendering components like `AuditTable`, performing O(N) filtering (e.g., `data.filter(...)`) inside the render loop (e.g., `map`) results in O(N*M) complexity, which scales poorly with dataset size. Additionally, passing inline arrow functions as props to memoized child components (`React.memo`) breaks memoization, causing unnecessary re-renders of the entire list on every parent update.

**Action:**
1. Pre-compute lookups (e.g., `allGroupedByHandle`) in the data hook (`useAuditData`) using `useMemo` to allow O(1) access during rendering.
2. Wrap action handlers in `useCallback` in the actions hook (`useAuditActions`) and pass them directly to child components, avoiding inline arrow functions to preserve referential equality and enable effective memoization.
