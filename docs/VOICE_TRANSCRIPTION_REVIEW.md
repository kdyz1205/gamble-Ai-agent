# Voice transcription upgrade for Claude review

This branch adds a pragmatic "record → upload → transcribe → parse" path without breaking the existing typed flow.

## What changed

### 1) Frontend composer upgraded
`src/components/CenteredComposer.tsx`

- keeps browser speech recognition only as live preview
- records real audio with `MediaRecorder`
- uploads audio to `/api/transcribe` when recording stops
- uses final transcript as the text submitted into the existing parse flow
- supports language toggle: `Auto / EN / 中`
- falls back to preview text if server-side transcription fails

### 2) New server transcription route
`src/app/api/transcribe/route.ts`

- accepts multipart audio upload
- sends audio to OpenAI transcription endpoint when `OPENAI_API_KEY` is present
- falls back to `previewText` when API key is missing or upstream fails
- keeps return shape stable:
  - `transcript`
  - `language`
  - `provider`
  - `usedFallback`

### 3) API client added transcription helper
`src/lib/api-client.ts`

- adds `transcribeAudio(blob, { languageHint, previewText })`

### 4) Home page wiring tightened
`src/app/page.tsx`

- composer now receives `isParsing`
- drafting edit composer also uses the same busy state
- local parser now reuses unified amount parser

## Required env vars

At minimum, for real server-side transcription:

- `OPENAI_API_KEY`

Optional:

- `OPENAI_TRANSCRIBE_MODEL`
- `OPENAI_BASE_URL`

## Review points for Claude

1. confirm `gpt-4o-mini-transcribe` is the model you want to use
2. decide whether to auto-submit immediately after transcription or show editable transcript first
3. consider moving recorder logic from component into a dedicated hook
4. consider adding hotword / name dictionary normalization after transcript
5. review whether parse route should receive `transcriptMeta` later
