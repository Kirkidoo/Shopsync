# Palette's Journal

## 2024-05-22 - Clickable Divs vs Buttons
**Learning:** Found critical accessibility pattern violation in file selection list where `div`s with `onClick` were used instead of buttons, making the UI inaccessible to keyboard users.
**Action:** Always use `<button type="button">` for interactive list items, ensuring `w-full text-left` is applied to maintain layout.

## 2026-01-27 - Input Form Wrappers
**Learning:** Found that standalone input+button pairs (like "Add Image") frustrate users by not supporting "Enter" to submit and lacking native validation.
**Action:** Always wrap input/button groups in a `<form>` element with `onSubmit`, using `type="submit"` for the button and specific types (e.g., `type="url"`) for inputs.
