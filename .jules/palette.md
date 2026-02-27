# Palette's Journal

## 2024-05-22 - Clickable Divs vs Buttons
**Learning:** Found critical accessibility pattern violation in file selection list where `div`s with `onClick` were used instead of buttons, making the UI inaccessible to keyboard users.
**Action:** Always use `<button type="button">` for interactive list items, ensuring `w-full text-left` is applied to maintain layout.

## 2024-05-23 - Destructive Alert Dialogs
**Learning:** `AlertDialogAction` defaults to primary styling. For destructive actions (like delete), manual utility classes (e.g., `bg-red-600`) are needed as there isn't a built-in `destructive` variant in the default Shadcn setup used here.
**Action:** Use `className="bg-red-600 hover:bg-red-700"` on `AlertDialogAction` for destructive confirmations.
