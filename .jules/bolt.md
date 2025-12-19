## 2024-05-23 - Optimizing List Rendering with Memoization

**Learning:** When rendering a list where each item contains a complex component (like a `Select` with many options) inside a state-managed parent (like `MediaManager`), any state update in the parent causes all list items to re-render. This is particularly expensive when each item creates a new React element tree for its children (e.g., `SelectContent` children).

**Action:** Extract the list item into a separate component wrapped in `React.memo`. This ensures that only the modified item re-renders. Additionally, ensure that callback props passed to the memoized component are stable (using `useCallback`) to prevent unnecessary re-renders. If the callback depends on changing state (like `variants`), use `useRef` to access the latest state inside the callback without invalidating the memoization.

## 2025-05-23 - Optimizing Polling Intervals with Conditional Fetching

**Learning:** Frequent polling of server actions (like `fetchActivityLogs` every 5s) causes unnecessary network traffic, serialization overhead, and client-side re-renders when the data hasn't changed. Standard React `setInterval` implementations often lead to stale closures or excessive effect re-runs if dependencies aren't managed carefully.

**Action:**
1. Modify the Server Action to accept a "version" token (e.g., `lastKnownId`) and return `null` if the data hasn't changed.
2. On the client, use `useRef` to store the latest state (e.g., `logs`) so it can be accessed inside `setInterval` without adding it to the dependency array (which would reset the timer).
3. Conditionally update state only when the Server Action returns new data.
