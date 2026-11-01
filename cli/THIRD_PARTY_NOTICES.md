# Terminal client dependencies

gitmsg application code is MIT licensed; see LICENSE. Dependencies are separately
distributed npm packages, not relicensed by this project. Keep their licenses and
native-code notices with any redistribution, including a standalone binary.

| Dependency | Purpose | License |
| --- | --- | --- |
| `@opentui/core`, `@opentui/react` 0.8.1 | Native terminal rendering, React integration and audio | MIT |
| `react` 19.3.1 | UI runtime | MIT |
| `@oven/bun-*` 1.4.4 | Platform-specific Bun runtime, installed by npm | MIT, with upstream third-party notices |
| `@roamhq/wrtc` / platform packages 0.10.0 | Isolated Node WebRTC audio engine | BSD-2-Clause, with upstream libwebrtc notices |

The runtime and native modules contain third-party software with additional
upstream notices. Consult the installed packages and upstream projects:
[OpenTUI](https://github.com/anomalyco/opentui),
[React](https://github.com/facebook/react),
[Bun](https://github.com/oven-sh/bun),
[node-webrtc](https://github.com/WonderInventions/node-webrtc).

Tokyo Night and Catppuccin themes use palette references, not application code.
No Telegram application source, logos, web fonts or website-only UI dependencies
are bundled in the npm terminal package.
