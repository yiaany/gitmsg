# Telegram Web A visual reference

Reference: https://github.com/Ajaxy/telegram-tt, pinned at
`6002824b6532f3d913997ce496d9ab5f9b86bc22` (2026-10-31 inspection).

Shell cloning failed because this environment could not resolve github.com.
The source files below were inspected over HTTPS instead. No complete clone
is claimed or bundled.

## Inspected sources

- `src/styles/index.scss` and `src/styles/_variables.scss`
- `src/components/left/main/Chat.scss`
- `src/components/middle/MiddleColumn.scss`
- `src/components/middle/message/Message.scss`
- `src/components/common/Composer.scss`
- `src/assets/fonts/roboto.css`

After the user signed in to the live https://web.telegram.org/a/ reference,
the actual computed styles were measured (without exporting account data):
16px outer panel inset, 41.168px sidebar radius, 27.44px list rounding,
72px chat rows with 54px circular avatars, 48px floating header with a 32px
radius, 48px unified composer pill with 24px radius and embedded 40px action
button. At 1086×850 the sidebar was x=16, y=16, width=358.375, height=818;
header x=390.375, y=16, width=679.625, height=48; composer x=390.375, y=786,
width=679.625, height=48. Wallpaper is shared behind all independent islands,
not confined to the message column. Live values supersede the initial
source-only interpretation (which incorrectly used an edge-to-edge grid).

The gitmsg React/CSS implementation is independent: Roboto 400/500 (system
font on Apple), 15px bubbles with 6px grouped corners, 760px conversation
lane, 464/480px incoming/outgoing maximums, 54.88px desktop dialog rounding
and a 600px mobile breakpoint. Navigation uses a separate rounded, translucent
menu (27.44px radius, 10px backdrop blur, 150ms fade/scale). Mobile columns slide
for 300ms with cubic-bezier(.25,1,.5,1); surfaces use 300ms
cubic-bezier(.33,1,.68,1). Reduced-motion preferences disable those transitions.

Light colors: white surfaces, #3390ec accent, #707579 secondary text,
#eeffde outgoing bubbles (#dcf8c5 on Apple). Dark colors: #212121 surfaces,
#000 wallpaper canvas, #766ac8 selected chats/outgoing, #8774e1 action buttons
and links, and #aaa secondary text. The seven measured peer colors are
#d45246, #f68136, #6c61df, #46ba43, #5caffa, #408acf and #d95574.

Only gitmsg's actual screens are included: conversations, message history,
composer, search and existing settings/security/integration dialogs. No
Telegram login, service-backed calls, stories, contacts, or fabricated online/read/unread
states. A single check indicates local/Git persistence, not a read receipt.
The user's screenshot is the target: dark theme by default, near-black
canvas, original doodle wallpaper, purple outgoing bubbles and selected chat.
UI icons remain Lucide; no Telegram icon font, logo or application code is bundled.

The later independent audio-call panel uses the same visual reference: a
560×680 surface, profile-color gradient, 48px circular controls and a red end-call
button. It runs gitmsg's own Git signaling and direct WebRTC lifecycle, not
Telegram's calling infrastructure. See [CALLS.md](CALLS.md).

## Interaction pass

Live inspection also measured the settings transition: paired 300ms opacity
and ±24px translations, rather than a central dialog. Settings, local profile
editing, new-conversation setup and chat search now use that left-panel pattern.
Search is in the top-left header and results scroll/highlight the target without
filtering the conversation out of the main feed. Closing search clears its query.

Attachment and emoji popups support pointer hover and click/touch, safe pointer
travel, Escape/outside dismissal, focus handling, collision-aware positioning,
and 150ms opacity/scale transitions. Only supported image/voice actions are
listed. The emoji picker has category browsing, category search and insertion
at the actual composer selection. It does not pretend to supply Telegram's
sticker/custom-emoji service. Message context menus open by right click,
long press or the keyboard-accessible options button; reactions sit above
the compact action rows. Live context rows measured 32px high with 12px radii.

On macOS both apps compute to system-ui 15px / 19.6875px for message text.
The chat list no longer shrinks its type at intermediate desktop widths, and
message timestamps flow beside the text instead of adding a separate line.

Profiles (name/bio/color/photo) now use an explicitly consented public marked
`gitmsg-profile` repository; usernames remain read-only GitHub identities.
Private chat lists and public-channel subscriptions use marked private
`gitmsg-settings`. Channel publishing follows GitHub write permission.
Creation saves a marked `.gitmsg/room.json` containing the display title/photo;
direct-chat participants are stored explicitly, not guessed from message authors.
Each participant sees the other account's published profile when available.

Pinned IDs and muted room IDs remain **device-local**. Pin cycling scrolls to
and highlights loaded, unlocked messages; deleted/locked messages are omitted.
Pin storage contains IDs, not another plaintext copy of encrypted messages.
Shared pins are not implemented. The wallpaper is a static masked gradient,
not Telegram's animated canvas.

The floating 48px creation button is hidden outside sidebar hover/focus (always
available on touch). Its compact popup is 216px wide with 32px rows, 12px row
rounding and 2px gaps. Creation uses separate screens, not tabs. Channel info
uses a 120px photo at y=80, followed by a 32px gap and 48px fields (18px gaps).
GitHub public-history consent remains explicit rather than copying Telegram's
different privacy promises. Profile editing uses one 120px photo control, 48px
fields with 18px gaps, and an immutable username. It does not invent a surname.

The chat header opens the right information panel (408px, 16px outer inset,
64px header, dark #0f0f0f background). Shared Media/Files/Links tabs filter loaded
unlocked, undeleted history and support arrow/Home/End keyboard navigation.
An unsubscribed reader sees only a 48px footer capsule with a 40px **Join Channel**
button (20px radius, 500 16px text), without an icon or explanatory card.
Joined readers see Mute/Unmute; Leave Channel is in information. There is no
Telegram gift/payment action because gitmsg has no corresponding service.

## Follow-up: profile, empty history, mobile and voice

The current live reference uses a sliding **pill** selection for shared-content
tabs, not an underline. Choosing a tab scrolls its strip to the top and changes
the heading to Shared Media; Back returns to the profile. gitmsg implements
independent 300ms pill/content transitions and lazy, verified photo tiles.
Existing direct chats open User Info, without routing through the discovery
screen's create-repository/invitation action. GitHub details remain available
in an expandable section. The subsequent inbox pass below extends updates to
saved inactive rooms as well.

The empty-feed regression was caused by a standalone empty card before a
100%-height message log. Empty feeds now use a centered service label, with a
zero-height log and no scroll anchor. All feed/jump scrolling is scoped to the
feed element, never `scrollIntoView` on an ancestor chain. Desktop verification
at 1086×850 measured clientHeight=scrollHeight=850 and scrollTop=0.

The live reference's mobile CSS explicitly removes sidebar/right-panel and
chat-row rounding at <=600px. gitmsg follows that edge-to-edge navigation,
with full-screen information, safe areas, and VisualViewport keyboard sizing.
The isolated test server can render the real build in 320/390/600/1440px iframe
layout viewports. This is **not** a touch-device or OS-keyboard emulator.
Telegram itself refuses embedding; its mobile rules were inspected read-only,
not bypassed, and a live Telegram mobile-device comparison is not claimed.
Production keeps frame-ancestors 'none' and X-Frame-Options DENY; only separate
loopback test documents can embed the isolated fixture.

At 1440×900 the verified layout has a 420px sidebar at x=16, a 548px chat
header/composer at x=452, and a 408px information panel at x=1016. Header and
composer end at x=1000, leaving the measured 16px panel gap; there is no extra
grid column or horizontal page overflow. Settings were also checked in actual
320px and 390px iframe layout viewports, with edge-to-edge navigation, a 120px
avatar and no horizontal overflow. These remain layout checks, not device tests.

The user's own sent voice note in Telegram Saved Messages was inspected
read-only. It measures 69px tall, with a 48px circular play control, 12px gap,
23px waveform and 14px duration. A one-second note has a 120px waveform lane.
gitmsg now uses a custom player rather than the browser audio controls. Actual
recorded amplitudes are bounded to 48 five-bit values in attachment metadata
(inside the encrypted payload in encrypted rooms); legacy notes can derive
their waveform after verified loading. There are no invented waveform peaks.

Recording uses Cancel, an accent-tinted waveform/timer pill, Pause/Resume and
a main **Send** action. Pause permits preview without finalizing; Send stops
and uploads directly, without a mandatory stop→preview→second-send step.
The 60-second/2MiB limits remain gitmsg-specific. Streams, timers, audio contexts
and object URLs are cleaned up on cancellation/navigation. Browser checks use
synthetic MediaStream audio in the isolated server, not the user's microphone,
and never send anything to Telegram or GitHub.

## Follow-up: settings, music and floating surfaces

The oversized-looking corner mismatch had a specific cause: Telegram's sidebar,
list rows, grouped settings and menus use `corner-shape: squircle` (computed
`superellipse(2)`), not ordinary circular corners with the same numeric radius.
gitmsg now uses that shape on the corresponding surfaces, with smaller ordinary
radii as a fallback. Circular avatars, message bubbles, header and composer keep
their own shapes; the mobile sidebar/information panel still have zero rounding.

Measured compact menus are 216px wide, with 32px rows, 12px row rounding and 2px
gaps. Their dark background is **#212121dd** (86.7% opacity), backdrop blur 10px,
and shadow `0 4px 8px 2px #1010109c`. Opening transitions opacity 0→1 and scale
0.85→1 over 150ms with cubic-bezier(.2,0,.2,1); closing takes 200ms ease-in.
Browser animation inspection confirmed actual opacity/transform transitions,
not only their stylesheet declarations. Main navigation, chat options and the
attachment popup share this surface treatment. Chat options expose Search,
Mute/Unmute, View Info and a nested GitHub-tools menu; integrations are retained
rather than replaced by nonfunctional Telegram actions. Keyboard opening,
ArrowDown navigation and Escape dismissal were exercised on the local fixture.

Settings now have a #0f0f0f dark background, black upper section, a 312px hero,
120px avatar, separated #212121 groups, 56px rows and 30px colored icons. At
1086×850 the local avatar measured x=135.1875/y=122.5, name y=295.5, first group
x=32/y=404/w=326.375 and first icon x=56/y=425, matching the live reference's
geometry. Group heights depend on actual gitmsg fields; there is no fabricated
phone, birthday, online status, Premium, Stars or Telegram account service.
Header search filters real available settings; profile editing and options use
the existing sidebar transitions.

Favorite music is optional bounded profile metadata (title, artist, validated
HTTPS URL) saved only with public-profile consent. It appears as a track link in
settings/discovery profiles and opens the music service. This is **not** uploaded
music, an embedded streaming player or Telegram's music service. Consent/save
was verified against memory-only fixture data; no reference account's personal
track or other profile data is copied into fixtures or documentation.

Additional synthetic voice checks cover cancellation while permission is pending,
Escape, stream cleanup and recovery from a deliberately rejected playback request.
First-click loading/playback was verified after removing a duplicate source update
that could interrupt `play()`. Navigating away pauses the captured audio node and
ends recording tracks with no upload. Pause/preview/resume/direct-send produced
one fixture upload with 48 waveform values; no native microphone was accessed.
Cancelling a pending browser permission request prevents later capture even if
permission resolves; it cannot dismiss the browser's own permission prompt.
Voice waveform metadata is retained when copying attachments to Saved Messages.

At that stage, the production build and 128 automated tests were local checks. Real two-account
GitHub persistence/invitations remain unverified because local OAuth credentials
are not configured. No push, deployment, profile publication or Telegram write
was performed. Full one-to-one parity across all Telegram screens is not claimed.

## Entry, inbox and photos follow-up

The entry page follows the user's monochrome reference rather than Telegram's
login page: pure #000 background, #aaa English prose, #fff headings/emphasis,
compact centered title and GitHub sign-in above it. No colored keywords, Russian
copy, promotional footer or extra bottom section. The built-in getting-started
channel uses the same `.message` / `.message-content` bubbles as conversations,
not instructional cards. It stays local and performs no GitHub writes.

Inactive saved rooms are checked sequentially (at most one every 5 seconds in a
focused visible page, 60 seconds unfocused), not in a fan-out. Actual incoming
messages update the list preview and device-local unread IDs; own sends, edits,
reactions and older loaded history do not inflate counts. Visible, focused chat
reading at the bottom clears the badge. First-ever sync establishes a baseline
instead of inventing unread messages from old history. No cross-device read
receipts, closed-site push delivery or instantaneous per-room updates are claimed.

Photo selection now opens a preview/caption dialog before any upload. Visible
photos automatically load through the existing hash verification/decryption path,
and open in a full-size viewer. A follow-up read-only inspection of the user's
new Saved Messages photo confirmed zero image/bubble gutters, caption below the
image (5px 8px 6px padding), and an inline footer. Without a caption the bubble
has zero padding, with its 18px timestamp over the image at bottom/right 4px,
10px rounding and #0003 background. Photo bounds preserve aspect ratio within
480×432; the small reference image measured 192×115.195px, followed by a 31.6875px
caption strip. Personal photo contents/captions are not copied into fixtures.

Browser verification measured identical image/bubble bounds: landscape 480×320,
portrait 216×432, and 261px image/bubble widths in a 320px layout viewport. The
caption starts exactly at the photo's bottom edge. Photo decoding keeps the feed
at the latest message unless the user scrolled away; current verification ended
within 0.5px of the bottom. Isolated incoming messages incremented a saved-room
badge from 1 to 2, then opening/focusing that room cleared it. Preview opening
made zero API writes; explicit send preserved the caption and displayed the photo
without a load button. After publication cleanup, the local build and all 144
tests pass, including the HTTP smoke tests and secret-scanner regressions.

"Propose current draft" and its draft-submission handler have been removed.

## Licensing and fonts

Telegram Web A application code is GPLv3. It is a visual reference here, not
copied implementation code; the gitmsg MIT license is unchanged. The publication
cleanup removed the previously evaluated upstream wallpaper and replaced it with
original MIT-licensed gitmsg artwork in `public/chat-pattern.svg`. No Telegram
application source, wallpaper, logos or icon font is distributed with this product.

The four unmodified Roboto WOFF2 subsets come from the pinned repository's
`src/assets/fonts/` directory. Roboto has its own Apache 2.0 license from
https://github.com/googlefonts/roboto/blob/main/LICENSE, included at
`public/fonts/Roboto-LICENSE.txt`. See also `Roboto-NOTICE.txt`.

| Local file | Upstream filename | SHA-256 |
| --- | --- | --- |
| Roboto-Regular-latin.woff2 | KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff2 | 5d1bc9b443f3f81fa4b4ad4634c1bb9702194c1898e3a9de0ab5e2cdc0e9f479 |
| Roboto-Regular-cyrillic.woff2 | KFOmCnqEu92Fr1Mu5mxKKTU1Kvnz.woff2 | daf6c28c5a080458eba26ba64a95b1fcff823944d429ccb84e8a4f3a0baf05ca |
| Roboto-Medium-latin.woff2 | KFOlCnqEu92Fr1MmEU9fBBc4AMP6lQ.woff2 | ce897833ac6e362df7c91ac8223fe511c6defcf33964928a81004600a2dd4c2e |
| Roboto-Medium-cyrillic.woff2 | KFOlCnqEu92Fr1MmEU9fABc4AMP6lbBP.woff2 | af2fdef955568dc79de38bfb097d53586855945811b638d6c41513bd62e25cc4 |
