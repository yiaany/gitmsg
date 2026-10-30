# coss UI

Components in `src/components/ui/` are adapted from https://github.com/cosscom/ui/tree/main/packages/ui/src/components. Local import paths replace workspace aliases; unused variants and helpers are omitted. The dark neutral palette and radius tokens in `src/app/theme.css` come from coss UI. Application layout is specific to gitmsg.

MIT License

Copyright (c) 2025 coss.com
Originally Copyright (c) 2025 Origin UI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

# Typography and design reference

https://github.com/bklit/bklit-ui is the reference for the monochrome visual direction and Cal Sans / Geist Mono typography. No bklit branding, illustrations, or marketing copy is included.

Self-hosted font binaries and their SIL Open Font License are in `public/fonts/`.

# Excalidraw and QR generation

`@excalidraw/excalidraw` 0.18.1: Copyright (c) 2020 Excalidraw, MIT License.
`qrcode-generator` 2.0.4: Copyright (c) 2009 Kazuhiko Arase, MIT License.
The full MIT terms above apply to both notices.

Unmodified Excalidraw font binaries are self-hosted under `public/excalidraw/fonts/`.
Their original name-table copyright and license metadata is preserved byte-for-byte.
See `public/excalidraw/LICENSES.md` and `BUNDLED-NOTICES.txt` for attribution,
upstream sources and bundled software notices. Run `npm run assets` to reproduce
the assets from the pinned dependency without network access.
`scripts/excalidraw-local-fonts.cjs` adapts the pinned package's font fallback
URL during bundling to remain same-origin; glyphs/font binaries are unchanged.
