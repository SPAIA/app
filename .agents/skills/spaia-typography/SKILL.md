---
name: spaia-typography
description: SPAIA's three-typeface type system (Montserrat / IBM Plex Sans / DM Mono) and the rules for which one a given piece of text takes. Applies whenever creating or editing any visual/UI element in the SPAIA app — headings, card titles, metrics, labels, buttons, table cells, axis text, device/spot IDs, timestamps, dashboards, slides. Also applies when writing or reviewing CSS/Tailwind that sets font-family, font-weight, or letter-spacing.
user-invocable: false
---

# SPAIA type system

Three typefaces, each with one job. Tokens live in `src/app.css` (`--font-display`, `--font-sans`, `--font-mono`); pairs with the (currently missing) `SPAIA-design-guidelines.md` referenced at the top of that file.

## The rule

Ask what the text is **doing**, not how big it is.

| It's... | Face | Token / utility |
|---|---|---|
| Something you **look at** — headline, card title, a figure on display | **Montserrat** | `var(--font-display)`, `.spaia-display`, `.spaia-title`, `h1–h4`, `[data-slot="card-title"]` |
| Something you **read through** — sentence, caption, cell, button, form field | **IBM Plex Sans** | `var(--font-sans)` (the default via `@apply font-sans` on `html`) |
| Something a **machine produced** — ID, timestamp, coordinate, reading, or the label naming one | **DM Mono** | `var(--font-mono)`, `.spaia-inset-label` |

## Hard rules (never violate)

1. **Montserrat never below 16px.** Below that, use Plex Sans, or DM Mono if the string is machine-written. A 19px card title is safe; a 10px label never is.
2. **Montserrat display leading floor is 1.12** (`.spaia-display` already sets this). Don't tighten it per-instance because one English headline looked loose — German copy is full of umlauts that clip at tighter leading.
3. **DM Mono is weight 500 below 11px, 400 at/above.** It has no bold and doesn't need one — caps + letter-spacing (`tracking-[0.13em]`–`[0.16em]`) already carry emphasis on every string it sets.
4. **IBM Plex Sans stops at 700.** No ExtraBold/Black — the browser synthesizes (faux-bold) anything heavier, which reads as a rendering fault. If 700 isn't enough emphasis, the element wants Montserrat instead, not a heavier sans weight.
   - ⚠️ Only weights 400/500/600 are currently imported in `app.css` (`@fontsource/ibm-plex-sans/{400,500,600}.css`) — 700 is not loaded, so `font-bold`/`font-weight:700` on Plex Sans currently synthesizes too, even though 700 is meant to be the real ceiling. Import `@fontsource/ibm-plex-sans/700.css` before relying on real 700.
5. **Every compared figure gets `font-variant-numeric: tabular-nums`** (the `.tabular` class, or automatic via `table td` / `[data-slot="card"] .value`). Metrics, table columns, axis values, timestamps — anything set side-by-side or updated in place.
6. **Mono is only for things a machine wrote.** Device ID, timestamp, coordinate, reading, or a label naming one. Never a headline, never body copy, never decoration — that's what quietly signals "SPAIA measures things."
7. **Spot/device codes avoid mixing `0` and `O`.** DM Mono already separates them by width/weight, so don't "fix" ambiguity with a slash or dot in running text — if a printed-signage context is genuinely ambiguous, fix the code format, not the font.

## The scale

If a size/weight/leading combination isn't in one of these tables, it's either one of these under a different name, or it shouldn't exist.

**Montserrat — display — never below 16px**

| Role | Size | Weight | Leading | Tracking |
|---|---|---|---|---|
| Screen headline | 40–112px (`.spaia-display`: `clamp(2.5rem,5vw,7rem)`) | 800 | 1.12 | −0.02em |
| Section heading | 28px | 700 | 1.2 | −0.015em |
| Card title (`.spaia-title`) | 19px | 700 | 1.25 | −0.01em |
| Hero figure | 34px | 800 | 1 | −0.02em (+ tabular-nums) |
| Metric value (`.spaia-inset-value`) | 24px | 800 | 1 | −0.02em (+ tabular-nums) |

**IBM Plex Sans — text — never above 700**

| Role | Size | Weight | Leading | Tracking |
|---|---|---|---|---|
| Body | 15px | 400 | 1.55 | 0 |
| Body small | 13px | 400 | 1.5 | 0 |
| Table cell | 14px | 400 | 1.45 | 0 (+ tabular-nums if numeric) |
| Button label | 14.5px | 700 | 1 | 0 |
| Caption / helper | 12px | 400 | 1.45 | 0 |

**DM Mono — machine — weight 500 below 11px**

| Role | Size | Weight | Leading | Tracking |
|---|---|---|---|---|
| Eyebrow | 11px | 500 | 1.3 | 0.16em · caps |
| Label / inset label (`.spaia-inset-label`) | 10px | 500 | 1.3 | 0.13em · caps |
| Tag / chip | 10px | 500 | 1 | 0.14em · caps |
| Device string | 13px | 400 | 1.4 | 0.02em |
| Axis label | 9.5px | 500 | 1 | 0.04em |
| Footer | 11px | 400 | 1.4 | 0.08em |

## Quick self-check before shipping a visual element

- A displayed number → Montserrat 800 + tabular-nums, never Plex Sans (even bold) — Plex is for reading, not looking at.
- A heading below 16px → wrong face; drop to Plex Sans or promote the size.
- Anything needing more punch than Plex 700 → switch to Montserrat, don't fake a heavier sans weight.
- Any axis/table/timestamp/ID text → DM Mono, weight per the 11px threshold above.
- Two numbers being compared anywhere (table column, metric pair, timestamp) → tabular-nums on both.
