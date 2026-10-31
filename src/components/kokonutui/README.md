# Kokonut UI source components

Downloaded directly from [kokonut-labs/kokonutui](https://github.com/kokonut-labs/kokonutui)
at commit `b794a23376a3c016dd39924d17b9068b3d08006f` (MIT), not a runtime CDN or registry loader.

- `command-button.tsx`: the real conversation search control and keyboard shortcut.
- `particle-button.tsx`: the message submit control, driven by actual send state.
- `loader.tsx`: shown only while real repository history is loading.

Original headers and license are retained. Local changes are limited to keyboard
safety, reduced-motion handling, monochrome colors and removing blur from the
message submit transition. The real GitHub, media and encryption flows are not
replaced with component demos or simulated async actions.

Chat typography uses Roboto/system fonts; code uses self-hosted Geist Mono.
Unused upstream components and font assets are not bundled. Existing Base UI
primitives retain accessible focus management and form behavior.
