100% clear. Let’s lock the MVP around your **Left = real-world image, Right = student canvas**, with the tutor (Gemini Live + vision) *reading both* and coaching sense-making—not “do the usual math.”

Here’s the **tight PRD addendum** that replaces the earlier flow and centers your pattern.

# Simili PRD — Addendum (MVP pattern + requirements)

## 1) MVP Interaction Pattern (non-negotiable)

* **Layout.**

  * **Left panel:** a single, high-signal **real-world photo/short clip** (curated set).
  * **Right panel:** a **draw + place** canvas (tldraw-like) with tools: pen, highlighter, fraction bars/units, number-line stamp, text label, lasso.
* **Voice loop (Gemini Live + Vision).**

  1. Student **observes aloud** (“What do you notice? What’s changing?”).
  2. If vague/stuck, tutor asks for **sketch or marks** (“Circle the whole you’re using,” “Show one unit,” “Label your tick marks”).
  3. Tutor **reads canvas state + image** (via tool calls) and asks **why**—not “compute.”
  4. Tutor **switches representations** only when it will clarify the student’s idea (e.g., “Drop a number line; place the unit you chose.”).
  5. Tutor **reflects back gist** to confirm (“So your whole is the *water bottle*, and one unit is the **cap height**—yes?”).

## 2) 3.NF.A.1 within this pattern (no pizza clichés)

**Goal:** understanding **1/b** as one of **b equal parts of a chosen whole**, and **a/b** as **a copies of 1/b**—*grounded in lived scenes*.

**Seed scenes (examples):**

1. **Lunch Trays:** Photo of 4 identical trays; one tray has veggie sections. Prompts: “Pick a **whole** you’ll use. Mark one **equal part** on your canvas. How do you know the parts are equal?”
2. **Water Bottle Ruler:** Photo of a bottle next to a notched sticker (no numbers). “Choose your **unit**. Show **1/5** of the bottle height; justify how you partitioned.”
3. **Bike Path Posts:** Posts between 0 and 1 mile markers. “Mark **1/4** mile on a drawn number line that matches the photo spacing. Why are your spaces equal?”
4. **Tile Mosaic:** Uneven tile sizes. “Can these tiles represent **equal parts**? If not, redraw your own equal partition. What’s your whole?”

**Anti-patterns we deliberately avoid:** pizza/circle-only area models; rapid-fire procedural drills; text-heavy prompts.

## 3) Functional Requirements (“as a user…”)

### Student

* **Observe & speak.**

  * *As a student*, I can tap the mic, describe what I notice in the photo, and have the tutor reflect my idea back.
  * *As a student*, when I’m unsure, I can ask the tutor to **show an example mark** (ghost hint) without giving away the answer.
* **Draw understanding.**

  * *As a student*, I can draw/label the **whole** I chose, place **unit marks (1/b)**, and compose **a/b** as repeated units.
  * *As a student*, I can drop a **number-line stamp**, set 0–1, and place **1/b** with evenly spaced tick spaces (not just marks).
* **Justify, not compute.**

  * *As a student*, I get prompts like “Why is that a whole?”, “How did you ensure equal parts?”, “What does each tick **mean**?”
  * *As a student*, I can ask for a **rep switch** (e.g., from area to number line) and keep my earlier marks visible.

### Teacher (pilot)

* *As a teacher*, I can see a **live transcript** with **chips** for: chosen whole, equal-parts check, unit mark consistency, “counted marks not spaces,” etc.
* *As a teacher*, I can **select a scene**, set duration (6–10 min), and enable/disable **transcript saving** (consent).

### Tutor/AI Tools (internal)

* **Vision tool:** returns objects/regions (e.g., “4 trays,” “bottle edges,” “posts spacing estimate”) and saliency hints.
* **Canvas diff tool:** emits semantic events (e.g., `setWhole(region)`, `addUnitMark(n=1, of=b)`, `composeFraction(a,b)`, `drewUnequalPartitions`, `placedTicksEqual? true/false`).
* **Rubric tool:** scores **conceptual signals** (not correctness): selected whole, equal partition evidence, unit reasoning, rep consistency.

## 4) Non-Functional Requirements

**Latency & UX**

* Mic → tutor turn start **< 400 ms**; TTS first audio **< 700 ms**; end-to-end follow-up **p95 < 1.2 s**.
* Canvas ops render at **60 FPS** on classroom Chromebooks; worklet audio never blocks UI.

**Robustness**

* Tutor remains functional offline-blip up to **5 s** (queue prompts, reconcile on reconnect).
* Vision/canvas tools fail **softly**: degrade to language-only prompts (“Describe your whole; outline it with your finger, then draw it”).

**Privacy & Safety**

* Default **no transcript persistence** unless teacher consent; audio blobs private with **14-day** TTL for research only if enabled.
* No PII beyond display name/class code; COPPA-/FERPA-friendly storage + RLS.

**Accessibility**

* Full keyboard control; **role="log"** transcript; captions toggle; color-contrast ≥ 4.5:1.
* Low-text prompts; icons + simple verbs; bilingual captions (later).

**Observability**

* Log only **semantic events** (no raw audio): chosen whole, unit marks, rep switch, misconception tags; SLO dashboards for latency.

## 5) Acceptance Criteria (MVP)

**A. Scene-driven sense-making**

* Given a curated scene, the tutor asks **observe → mark → justify** without introducing numeric procedures.
* The tutor **references the specific image regions** or student marks in follow-ups (e.g., “the *third* post you circled”).

**B. Unit fraction understanding**

* Student can **declare the whole**, show **1/b** as **one equal part**, and **a/b** as **a copies of 1/b**—in **at least two representations** (area/line/set) within a single session.

**C. Misconception handling**

* When partitions are unequal or ticks count marks not spaces, the tutor detects via **canvas diff tool** and prompts a corrective move (“Measure your spaces—should they match?”).

**D. Flow & latency**

* Voice loop meets latency targets; no audible stutter; canvas remains responsive during streaming.

**E. Teacher visibility**

* Live console shows transcript + chips in real time; session export (JSONL + canvas SVG) available if consented.

## 6) Instrumentation (what we’ll measure)

* **Conceptual rubric (per session):** whole identified (Y/N), equal parts evidence (0–2), unit reasoning (0–2), rep switch success (0–2).
* **Engagement:** avg turns/min, avg utterance length, voluntary rep switch requests.
* **Friction:** ASR repair rate, “I’m stuck” frequency before/after canvas prompt.
* **Latency SLOs:** p50/p95 for first-token audio, tool-call roundtrips, canvas ops.

## 7) Content & Scenes Backlog (starter)

* Lunch trays, water-bottle ruler, bike path posts, tile mosaic, egg carton with missing dividers, bookshelf cubbies of mixed widths.
* For each: **what can be the whole?** **what would equal parts look like?** **which rep is natural next?**

---

If you want, I can turn this into a **.md PRD** + a **scene spec JSON** (fields: `id`, `media`, `affordances`, `likely_wholes`, `misconception_traps`, `rubric_hints`) that your tools registry can use on day one.
