## 2024-05-24 - [Replaced blocking `confirm()` with `AlertDialog`]
**Learning:** Native `window.confirm()` halts the main thread and offers a jarring, non-accessible experience. Users prefer non-blocking, integrated dialogs (like Shadcn `AlertDialog`) that maintain context and support keyboard navigation.
**Action:** Always replace `confirm()` with `AlertDialog` for destructive actions to ensure consistency and accessibility.
