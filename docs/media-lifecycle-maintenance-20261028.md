# Media lifecycle maintenance — 2026-10-28

Baseline: `cfaf08a0f39b88a4e49efdcd52516850a605b94e`.

## Reproduced client defects

The baseline browser tests used real Chromium MediaStream/MediaRecorder implementations backed only by Chromium-generated fake devices. Protected identities, agent responses and transcription responses were explicit synthetic fixtures, and unexpected API writes were blocked. No physical camera, microphone, production account, proof submission or paid transcription was used.

Selected baseline checks failed for repeated microphone permission requests, a late permission grant starting after leaving the composer, recording-error handling, stale signed-in account draft results, cancelled video recordings still producing a preview, recorder-start failure retaining tracks, description-first input hiding media pickers, and a pending detached photo preview retaining its stream after navigation.

## Design

Each capture has an explicit owner from permission request through recording and finalization. Cancellation invalidates ownership before stopping the recorder and tracks, and detaches callbacks so a browser's final data/stop events cannot turn a cancellation into a save. A permission request itself is not abortable by this implementation: when a cancelled request eventually yields a stream, every returned track is stopped immediately and no recorder starts.

Normal Stop & save preserves the final browser-produced media data. Stop is guarded synchronously so two clicks cannot throw or finalize twice. Recorder failures discard incomplete content. Photo streams are owned during asynchronous video startup and image encoding, not only after a preview is mounted.

The composer has a generation boundary for known-account changes and logout. Guest-to-login and same-owner refresh retain deliberate local work; A-to-B-to-A creates distinct generations. Delayed draft, publish and transcript responses cannot update an unmounted owner. This does not claim to reverse a request already received by the server.

## Sources informing browser event handling

- W3C MediaStream Recording: https://www.w3.org/TR/mediastream-recording/ — stopping or ending recorded tracks queues final data and stop events.
- MDN getUserMedia: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia — the permission promise may stay unresolved when the user makes no choice.

## Verification contract

Retain the existing dependency audit, type/lint, database and browser gates. Add owner-transition unit assertions and media lifecycle browser regressions, including valid recording playback and normal transcription, not just cancellation. Build and test a frozen clean commit, compare the actual CI source tree, verify a non-aliased production-environment candidate, then independently recheck both formal domains and run the live regressions.

No dependency, schema, API authorization, ledger, settlement or production data mutations are part of this patch. Physical iPhone permission/keyboard/camera behavior and final real-provider speech transcription remain separate acceptance scopes; virtual-device results do not prove them.

## Source switching and compact layout follow-up

A candidate-level check also caught stale invalid URL text blocking a newly selected file. Clear the prior URL only when a real replacement file/photo/recorded clip is installed; cancelling a picker/capture retains the original URL and description. The compact English/Chinese permission controls are checked for actual text overflow and overlapping hit areas at 320px and 390px, with cancel on its own row.
