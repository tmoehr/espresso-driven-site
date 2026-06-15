# espressodriven Site — Project Notes

## Navigation convention
Every content section (excluding the footer) must have a corresponding nav link in the header.
Links appear in the same order as their sections in the DOM.

Current order: Assets → Contact → Imprint

When adding a new section:
1. Add `id="<name>"` to the `<section>` element
2. Add `<a href="#<name>" class="nav-link">Label</a>` in `.nav-links` at the matching position
3. The hamburger menu inherits the links automatically — no extra changes needed

## Code Quality

- Apply SOLID principles and Clean Code practices in every implementation
- **Follow the DRY principle rigorously.** Never duplicate logic — extract a shared include, method, or constant instead of copy-pasting.
- No magic numbers — use named constants or enums
- Apply appropriate Design Patterns where they add clarity or flexibility
- Always consider performance implications; optimize where measurable impact exists
- Flag potential performance bottlenecks with a short inline comment explaining the tradeoff
- Prefer readability over cleverness
