---
---

The site build and the flip check install Chromium with the Playwright action of the template, from a cache. The development dependency `@mark1russell7/conventions` moves to `^0.45.1`, because the site config keys of the action start in 0.45.0. Only the CI and the development tools change, thus no package gets a release.
