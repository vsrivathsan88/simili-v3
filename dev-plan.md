## Simili MVP – Phased Development Plan (low-risk, fewest errors)

### Scope and guardrails
- **Goal**: Low-latency, voice-first MVP with Gemini Live (audio+vision), scene on left, student canvas on right, tutor reasons about student marks and image, not procedures.
- **Non-goals**: No server-rendering, no bundler in production; no secrets in the browser; keep main thread light; AudioWorklets for heavy audio.

### Confirmed decisions (consistent with PRD)
- **Build/dev**: Vite for local dev; production ships **buildless ESM** via `importmap` + `esm.sh`.
- **Model**: Gemini Live (default: `gemini-2.5-flash` for vision calls).
- **Auth**: Tiny `/server` endpoint mints short-lived client tokens; no long-lived keys in browser.
- **Audio**: Reuse current AudioWorklets; keep worklets lightweight; ensure backpressure, start/stop timing.
- **Canvas**: Integrate `tldraw` for pen/highlighter/labels/lasso, plus simple stamps for fraction bars and number lines.
- **Assets**: Store curated scene media locally under `public/scenes/...` for MVP.
- **Scenes**: Initial set can differ from examples; do not hardcode scene list into code.
- **Tools**: Add `vision`, `canvasDiff`, `rubric` tools with zod schemas; integrate with Zustand and Live tool-calls.
- **State**: Normalize app to Zustand slices with small selectors; avoid prop drilling.
- **Teacher console**: Later (not MVP).
- **Transcript**: Generate at end-of-session; export JSON + canvas SVG when consented.
- **Observability**: Capture semantic events + errors; keep raw audio out; SLO timing.
- **Offline**: Tolerate 5 s blips with in-memory queue + reconcile.
- **A11y**: Keep light for MVP; transcript region `role="log"` and keyboardable basics.
- **Performance**: Target Chromebooks; cap canvas effects; maintain 60 FPS.

### Target structure (migrate gradually; no big-bang)
```
/public/
  index.html        # importmap + root; CDN ESM via esm.sh
  /scenes/          # curated local media for MVP
/src/
  /audio/           # AudioWorklets, recorder/streamer, registry
  /live/            # GenAI Live client + WS glue
  /tools/           # tool zod schemas + tools registry
  /components/      # React UI (console, canvas, tray)
  /hooks/           # shared hooks (live api, audio, scene)
  /state/           # Zustand slices (connection, audio, scene, transcript, canvas, tools)
  /styles/          # CSS
/server/            # minimal token/relay endpoint (dev+prod)
```

Incremental moves to minimize errors:
- Start by leaving existing files in place; introduce new directories side-by-side.
- Migrate modules slice-by-slice; update imports per PR; keep adapters during interim.

---

## Phases & acceptance per phase

### Lesson-first overlay (on top of existing app)
- Build lesson UI/UX as a standalone view layered on current code; defer onboarding/landing.
- Reuse `useLiveApi`, `LiveAPIContext`, `ControlTray`, `AudioRecorder`/`AudioStreamer` to minimize changes.
- Add new UI under `components/lesson/*` and a simple scene picker; mount via `App.tsx` toggle.
- Keep state in small Zustand slices (`scene`, `canvas`, `transcript`) and adapt existing state until migration finishes.
Acceptance: Lesson view works end-to-end without restructuring the whole app.

### Phase 0 – Baseline guardrails (fast)
- Add importmap to `public/index.html` (dev toggled off; prod on). Keep Vite dev.
- Ensure TypeScript strict stays on; confirm ESLint/Prettier status quo.
Acceptance: App boots in dev (Vite) unchanged; `index.html` works standalone for a smoke test page.

### Phase 1 – Auth: ephemeral token server
- Add `/server` tiny endpoint to mint short-lived tokens for Gemini Live + vision.
- Dev-only CORS; env vars server-side only; never embed keys in browser.
Acceptance: Client fetches token before connecting; no key exposure; connection opens.

### Phase 2 – Live client wiring (reuse existing)
- Reuse `GenAILiveClient`; connect with ephemeral token; keep existing events.
- Ensure `inputTranscription`/`outputTranscription` events surface to state.
Acceptance: Mic press → server turn starts < 400 ms; first audio < 700 ms (dev target).

### Phase 3 – Audio pipeline tightening
- Keep `AudioRecorder`/`AudioStreamer` + Worklets; verify 16 kHz PCM path, backpressure, start/stop timing.
- Keep main thread free of heavy encode/decode.
Acceptance: No UI jank while streaming; VU meter updates; stop on disconnect.

### Phase 4 – Zustand slices
- Create slices: `connection`, `audio`, `transcript`, `scene`, `canvas`, `tools`.
- Use small selectors; avoid prop drilling; retain current UI with adapters.
Acceptance: Existing UI reads from slices without regressions; minimal re-renders.

### Phase 5 – Canvas (tldraw) integration
- Mount tldraw in right panel; add tools: pen, highlighter, text, lasso.
- Implement simple stamps: fraction bars (repeatable units), number line (0–1 with evenly spaced ticks).
- Persist minimal canvas state in slice; emit semantic events for changes.
Acceptance: Student can draw/label whole, place unit marks, drop number line with even spacing.

### Phase 6 – Tools registry (zod) + tool-calls
- Define zod schemas for `vision`, `canvasDiff`, `rubric`.
- Implement client-side registry; wire to tool-call events from Live.
- `vision`: cloud call to Gemini-2.5-Flash (via server), return objects/regions; degrade gracefully.
- `canvasDiff`: derive semantic events from tldraw changes.
- `rubric`: score conceptual signals; produce chips.
Acceptance: Tool-call roundtrip works; logs show schema-validated requests/responses; tutor references image/marks.

### Phase 7 – Transcript + export (consent-gated)
- Accumulate transcript with timestamps and event chips.
- End-of-session export: `session.jsonl` (turns + events) and canvas `scene.svg`.
- Consent toggle in a simple start modal; default off.
Acceptance: With consent on, user can download JSONL + SVG; off → nothing persisted.

### Phase 8 – Observability & errors
- Capture semantic events and client timings (first audio token, tool-call RTTs).
- On error, record minimal payload + user agent; throttle duplicates; use `sendBeacon` on unload.
- No raw audio logging.
Acceptance: Errors visible in console and sent to server; p50/p95 visible in a simple log view.

### Phase 9 – Offline blip tolerance (≤ 5 s)
- In-memory queue of outbound messages/events; suspend sends on disconnect; replay on reconnect.
- Reconcile server state: drop duplicates using client ids.
Acceptance: Brief Wi‑Fi blip does not crash or lose student work; user sees reconnect banner.

### Phase 10 – A11y & performance polish
- Transcript region `role="log"`; focus management for mic button; basic keyboard for canvas tool switching.
- Limit effects; ensure 60 FPS canvas on a Chromebook; avoid heavy filters.
Acceptance: Keyboard nav works for essentials; FPS stable in test scene.

---

## PR sequencing (minimize risk)
1) Importmap in `public/index.html`; smoke page (no feature changes).
2) `/server` token endpoint; client handshake with ephemeral token.
3) Live client + audio timing checks; maintain existing UI.
4) Introduce Zustand slices with adapters (no UI change yet).
5) Integrate tldraw canvas + basic tools; log canvas semantic events.
6) Tools registry + zod schemas; wire `vision` (cloud), `canvasDiff`, `rubric`.
7) Transcript accumulation + consented export (JSONL + SVG).
8) Observability + error beacons + simple timings.
9) Offline queue/reconnect reconciliation.
10) A11y/perf polish for Chromebook target.

Each PR: small scope, isolated, with e2e smoke on dev.

---

## Risks & mitigations
- **AudioWorklet registration fails**: Retry after `AudioContext.resume()`; degrade to language-only coaching.
- **tldraw plugin surface**: Start with simple stamps (bars/number line) before deeper custom shapes.
- **Tool-call schema drift**: Use `zod.safeParse`; on failure, log and degrade to language-only prompt.
- **Latency regressions**: Gate costly operations behind web worker/worklet; profile on Chromebook early.

---

## Acceptance mapping to PRD
- **A. Scene-driven sense-making**: Phases 5–6 (canvas + tools).
- **B. Unit fraction understanding**: Phases 5–6 (stamps + rubric).
- **C. Misconception handling**: Phase 6 (`canvasDiff` → corrective prompts).
- **D. Flow & latency**: Phases 2–3 + 8 (timings and budgets).
- **E. Teacher visibility (later)**: Not MVP; chips present in transcript export for review.

---

## Demo script (for pilot)
1) Select a scene (e.g., bottle ruler) → mic on → observe aloud.
2) Mark whole/unit on canvas; drop number line; place 1/b evenly spaced.
3) Tutor references specific regions/marks; prompts justification; switches rep if helpful.
4) End session → export JSONL + SVG; review events and timing.


