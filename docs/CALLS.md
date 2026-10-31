# Direct audio calls

One-to-one audio in private, writable chats with a partner resolved from the
room's participant document. No group/channel/Saved Messages calling, video,
screenshare, recording, TURN credentials, relay subscription or paid calling SDK.
The interface is an independent implementation inspired by familiar call panels;
no Telegram source or branded assets are included.

## Transport and costs

1. Caller presses the phone button and grants microphone access. Help explains
   the network and privacy limits; the call surface contains only call controls.
2. WebRTC gathers candidates for **2.5 seconds**. One Git event/commit contains the
   audio offer and the candidates collected so far. There is no candidate trickle
   and no late-candidate commit loop. Candidates discovered later are not sent.
3. The other open client discovers the offer using existing sequential polling.
   Nothing acquires its microphone or connects to the caller until **Accept**.
4. Accept gathers audio/candidates for 2.5 seconds and commits one answer.
5. Audio uses a direct DTLS-SRTP WebRTC connection. **No audio bytes go into Git**
   and the app server does not relay media. Ending normally adds one end commit.

A normal call uses three signaling commits total, not hundreds. Cancellation
before an offer is submitted creates none; rejection/busy/failure can add an end
event. GitHub quotas, repository storage and website hosting limits still apply.
The absence of a paid audio service is **not** a promise of free unlimited GitHub.

The client uses public STUN endpoints at `stun.cloudflare.com:3478` and
`stun.l.google.com:19302`. STUN discovers addresses; it is not an audio relay and
has no availability guarantee. These services see network addresses. There is no
TURN fallback. Some carrier NAT, firewalls, VPNs and UDP-restricted networks will
not connect; the UI recommends trying another network instead of blaming a
particular provider with certainty.

## Lifecycle and privacy

- Incoming/outgoing, preparing, connecting, connected, declined, busy, timeout and
  failure states. Microphone mute and output-audio mute are separate. The output
  button also resumes playback if browser autoplay was blocked; it does not
  promise OS-level speaker/Bluetooth routing.
- Offers expire after 90 seconds. Connecting is bounded to 35 seconds; a broken
  connected path gets 10 seconds to recover. The timeout is not a Git delivery SLA.
- Whole batches are examined for end events before ringing. Recipient, verified
  peer ID/login, repo, branch, bounded timestamps and call ID are checked. A small
  per-tab sessionStorage list remembers handled IDs only, never SDP or audio.
- End, failure, pagehide, logout and component disposal close the peer, clear
  timers, detach output and stop every local audio track. A late microphone
  permission result is stopped too. End signaling on tab close/navigation is
  best effort, not guaranteed delivery. Resource cleanup does not wait for Git.
- Switching conversations during an active call is blocked. Use one active tab
  per account for calling; there is no cross-tab/device call handoff.
- Keep both clients open, visible and online for reliable signaling. Background
  polling slows; hidden tabs pause it. Inactive rooms rotate sequentially, so many
  saved conversations can delay or miss a 90-second incoming invitation. There
  are no closed-tab/mobile push notifications. Calls can fail in the background.
- Standard SDP/ICE parameters may contain network addresses and remain readable
  in Git history. Enable **Room Security before calling** to encrypt parameters;
  the call kind, actors, timestamps and sizes remain visible. Git writers and
  shared-key holders are trusted, not independently authenticated identities.
  WebRTC transport encryption does not fix forged signaling or a compromised site.

## Implementation and checks

`src/lib/audio-call.ts` owns resource/lifecycle state. `call-protocol.ts` bounds
audio signaling. The existing `/api/chat` writes actual event files/commits and
enforces authenticated actor, private direct-room access, default branch and room
encryption policy. Calls share existing write throttles; no per-candidate API or
rate-limit bypass exists. `use-audio-call.ts` resolves the specific call room's
security, never another open conversation's key.

`tests/audio-call.test.ts` covers batching, validation, encryption, unread
isolation, stale/replayed/wrong-peer events, consent, mute, timeout, disconnect,
cancellation races and cleanup. `tests/fixtures/call-server.ts` provides two
isolated loopback accounts on ports 3494/3495, proxying a build on 3496. It uses
in-memory APIs and generated audio tones with **real RTCPeerConnection** media;
it neither accesses GitHub nor tests physical microphone hardware. This fixture
is never imported by production. Real-account Git signaling, mobile devices and
restrictive-network compatibility require separate verification.

`tests/call-browser.mjs` is an opt-in standalone Chrome runner for the fixture.
It requires a locally runnable Chrome (`CHROME_BIN` can override its path). It
checks received audio packets/energy, mute, decline, encryption and cleanup;
it is not part of the default unit suite. In the current restricted environment,
the embedded browser produced no ICE candidates and standalone Chrome aborted
at launch. Therefore successful browser-to-browser audio has **not** yet been
verified here; tested signaling/cleanup and a passing build are not that proof.
