# coss UI

Components in `src/components/ui/` are adapted from https://github.com/cosscom/ui/tree/main/packages/ui/src/components. Local import paths replace workspace aliases; unused variants and helpers are omitted. Buttons and dialogs are restyled with gitmsg's current theme tokens. Application layout is specific to gitmsg.

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

The current fullscreen messenger uses Telegram Web A as a visual reference,
not copied GPLv3 application code. Provenance, measurements and limitations
are documented in `docs/TELEGRAM_DESIGN.md`. The original GitHub-backed
application remains MIT licensed. No Telegram logos or icon font are bundled.
The wallpaper in `public/chat-pattern.svg` is original gitmsg artwork under MIT.
No Telegram application source, wallpaper, logo or icon font is distributed.

Roboto Regular/Medium Latin/Cyrillic subsets: Copyright 2011 Google Inc.
All Rights Reserved. Apache License 2.0, included in
`public/fonts/Roboto-LICENSE.txt`; attribution in `Roboto-NOTICE.txt`.

Self-hosted Geist Mono uses the SIL Open Font License in `public/fonts/LICENSE.txt`.
Unused Cal Sans and Geist Sans assets have been removed.

# Kokonut UI

`src/components/kokonutui/` contains source downloaded directly from
https://github.com/kokonut-labs/kokonutui at commit
`b794a23376a3c016dd39924d17b9068b3d08006f`.
Copyright (c) 2025 kokonutUI, MIT License. Full original terms are in
`src/components/kokonutui/LICENSE`; component author headers are preserved.
See that directory's README and `sources.json` for source URLs, hashes and
local adaptations. Neutral hairlines, easing and prompt framing also reference
the upstream `app/globals.css` and `components/kokonutui/ai-prompt.tsx`.

# QR generation

`qrcode-generator` 2.0.4: Copyright (c) 2009 Kazuhiko Arase, MIT License.
The full MIT terms above apply to this notice.
