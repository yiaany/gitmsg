# Kokonut UI source components

Downloaded directly from [kokonut-labs/kokonutui](https://github.com/kokonut-labs/kokonutui)
at commit `b794a23376a3c016dd39924d17b9068b3d08006f` (MIT), not a runtime CDN or registry loader.

- `command-button.tsx`: the real conversation search control and keyboard shortcut.
- `particle-button.tsx`: the message submit control, driven by actual send state.
- `loader.tsx`: shown only while real repository history is loading.
- `slide-text-button.tsx`: the GitHub setup navigation link.

Original headers and license are retained. Local changes are limited to keyboard
safety, reduced-motion handling, monochrome colors and removing blur from the
message submit transition. The real GitHub, media and encryption flows are not
replaced with component demos or simulated async actions.

Typography matches the upstream site's Geist / Geist Mono stack, self-hosted
under `public/fonts/`. Neutral surfaces, 10–14% hairlines and the
`cubic-bezier(0.23, 1, 0.32, 1)` easing follow the upstream sources. Existing
Base UI primitives retain accessible focus management and form behavior.
