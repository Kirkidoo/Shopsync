## 2025-02-23 - Focus Visibility in Hidden Containers
**Learning:** In Tailwind, when controls are hidden via opacity inside a container, using `focus-within:opacity-100` on the container is critical for keyboard accessibility. `group-hover` alone leaves keyboard users navigating blind.
**Action:** Always add `focus-within:opacity-100` (or appropriate visibility utility) to any container that reveals child controls on hover.
