# coss UI

Components in `src/components/ui/` are adapted from https://github.com/cosscom/ui/tree/main/packages/ui/src/components. Local import paths replace workspace aliases; unused variants and helpers are omitted. Buttons and dialogs are restyled with the Kokonut UI neutral tokens. Application layout is specific to gitmsg.

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

The initial monochrome direction used https://github.com/bklit/bklit-ui as a reference. The current typography and component styling use Kokonut UI's Geist / Geist Mono stack. No upstream branding, illustrations or marketing copy is included.

Self-hosted font binaries and their SIL Open Font License are in `public/fonts/`.

# Kokonut UI

`src/components/kokonutui/` contains source downloaded directly from
https://github.com/kokonut-labs/kokonutui at commit
`b794a23376a3c016dd39924d17b9068b3d08006f`.
Copyright (c) 2025 kokonutUI, MIT License. Full original terms are in
`src/components/kokonutui/LICENSE`; component author headers are preserved.
See that directory's README and `sources.json` for source URLs, hashes and
local adaptations. Neutral hairlines, easing and prompt framing also reference
the upstream `app/globals.css` and `components/kokonutui/ai-prompt.tsx`.
Geist Latin and Cyrillic WOFF2 files are unmodified copies of the fonts served
by kokonutui.com, redistributed under the included SIL Open Font License.

# QR generation

`qrcode-generator` 2.0.4: Copyright (c) 2009 Kazuhiko Arase, MIT License.
The full MIT terms above apply to this notice.
