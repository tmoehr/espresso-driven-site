# espressoDriven Site — Project Notes

## Navigation convention
Every content section (excluding the footer) must have a corresponding nav link in the header.
Links appear in the same order as their sections in the DOM.

Current order: Assets → Contact → Imprint

When adding a new section:
1. Add `id="<name>"` to the `<section>` element
2. Add `<a href="#<name>" class="nav-link">Label</a>` in `.nav-links` at the matching position
3. The hamburger menu inherits the links automatically — no extra changes needed
