## 2024-05-23 - Optimizing List Rendering with Memoization

**Learning:** When rendering a list where each item contains a complex component (like a `Select` with many options) inside a state-managed parent (like `MediaManager`), any state update in the parent causes all list items to re-render. This is particularly expensive when each item creates a new React element tree for its children (e.g., `SelectContent` children).

**Action:** Extract the list item into a separate component wrapped in `React.memo`. This ensures that only the modified item re-renders. Additionally, ensure that callback props passed to the memoized component are stable (using `useCallback`) to prevent unnecessary re-renders. If the callback depends on changing state (like `variants`), use `useRef` to access the latest state inside the callback without invalidating the memoization.

## 2024-05-24 - Stabilizing Callbacks with useRef for Memoized Children

**Learning:** Even when child components are wrapped in `React.memo`, they will still re-render if the callback props passed to them are recreated on every render. This happens when the callback depends on state variables (like `images`) that change frequently. This negates the benefit of memoization for lists.

**Action:** Use `useRef` to store the latest version of the state variable (e.g., `imagesRef`). Then, inside the `useCallback`, access the state via `ref.current`. This allows you to remove the state variable from the `useCallback` dependency array, keeping the function reference stable across renders while still accessing the latest data. This effectively stops unnecessary re-renders of all list items when only one item is modified.
