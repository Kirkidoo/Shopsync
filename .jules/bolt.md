## 2024-05-23 - Optimizing List Rendering with Memoization

**Learning:** When rendering a list where each item contains a complex component (like a `Select` with many options) inside a state-managed parent (like `MediaManager`), any state update in the parent causes all list items to re-render. This is particularly expensive when each item creates a new React element tree for its children (e.g., `SelectContent` children).

**Action:** Extract the list item into a separate component wrapped in `React.memo`. This ensures that only the modified item re-renders. Additionally, ensure that callback props passed to the memoized component are stable (using `useCallback`) to prevent unnecessary re-renders. If the callback depends on changing state (like `variants`), use `useRef` to access the latest state inside the callback without invalidating the memoization.

## 2024-05-24 - Optimizing Lookup in Render Loops

**Learning:** The application uses a central data hook (`useAuditData`) that passes raw data to heavy list components (`AuditTable`). Performing `data.filter()` inside the render loop of a list item (or the list map function) causes O(N*M) complexity, which scales poorly. Pre-calculating a lookup map in the hook (O(N)) reduces render complexity to O(M).

**Action:** When seeing `data.filter(...)` inside a `map` render loop, immediately look to move that calculation to a `useMemo` in the parent hook or component and pass a lookup map.
