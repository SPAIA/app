# Bugmeister — App Specification v1

> SPAIA x Kiezwald · Gamified citizen science insect observation for Berlin

---

## 1. Stack

| Layer | Choice |
|---|---|
| Framework | SvelteKit + TypeScript |
| Hosting | Cloudflare Workers (`@sveltejs/adapter-cloudflare`) |
| Database | Cloudflare D1 (SQLite) |
| Auth | Supabase Auth |
| Maps | Stadia Maps (MapLibre GL JS) |
| Payments | Stripe Checkout (hosted) |
| Storage | Cloudflare R2 (future photo uploads) |
| i18n | svelte-i18n (EN / DE / NL) |
| Styling | Tailwind CSS v4 + DaisyUI v5 + DM Sans / DM Mono (Google Fonts) |

### Tailwind + DaisyUI config
- Tailwind CSS v4 via `@tailwindcss/vite` plugin
- DaisyUI v5 (`npm i -D daisyui@latest`) — used for: `btn`, `input`, `badge`, `card`, `modal`, `drawer`, `toast`, `progress`, `avatar`
- Define one custom DaisyUI theme `bugmeister` mapping wireframe tokens to DaisyUI semantic colours:

```css
/* app.css */
@import "tailwindcss";
@plugin "daisyui" {
  themes: bugmeister --default;
}

@plugin "daisyui/theme" {
  name: "bugmeister";
  default: true;
  --color-primary:          #1D9E75;
  --color-primary-content:  #ffffff;
  --color-secondary:        #534AB7;
  --color-secondary-content:#ffffff;
  --color-accent:           #BA7517;
  --color-accent-content:   #ffffff;
  --color-base-100:         #f8f7f4;
  --color-base-200:         #f0efe9;
  --color-base-300:         #e4e3dc;
  --color-base-content:     #1a1a18;
  --radius-btn:             0.75rem;
  --radius-box:             0.75rem;
}

@theme {
  --font-sans: 'DM Sans', sans-serif;
  --font-mono: 'DM Mono', monospace;
  /* Rarity colours for direct Tailwind use */
  --color-green-light:  #E1F5EE;
  --color-green-mid:    #9FE1CB;
  --color-amber-light:  #FAEEDA;
  --color-purple-light: #EEEDFE;
}
```
- DaisyUI handles commodity UI (`btn`, `input`, `badge`, `modal`, `toast` etc.)
- Custom gamification components (InsectGrid, TimerDisplay, KiezCard, ShareCard) are hand-written Tailwind utilities — no extra lib needed
- No `<style>` blocks except keyframe animations (pulse, tap-scale)

### i18n (svelte-i18n)
- **Locales:** `en` (default), `de`, `nl`
- **Library:** `svelte-i18n` — `$_('key')` syntax throughout all components
- **Detection order:** URL param `?lang=de` → `localStorage` → browser `Accept-Language` → fallback `en`
- **File structure:**
```
src/lib/i18n/
  en.json
  de.json
  nl.json
  index.ts      -- initialise svelte-i18n, export helpers
```
- All user-facing strings externalised — **no hardcoded copy in `.svelte` files**
- Kiez rivalry copy (e.g. "Moabit needs a Bugmeister. Wedding is beating you.") is parametrised:
```json
{
  "welcome.rivalry": "{kiez} needs a Bugmeister. {rival} is beating you.",
  "observe.cta": "Begin — {kiez} is counting on you",
  "close.headline": "You just saw what they missed.",
  "email.cta": "Your cards travel with you."
}
```
- Level titles localised (Stadtökologe etc. are German-native, use equivalents in EN/NL)
- Insect type names localised (Bees → Bienen → Bijen etc.) — resolved from `insect_types.name` key, not raw DB string

### Cloudflare Worker config
- `adapter-cloudflare` with `platform.env` for D1 bindings
- All secrets via `wrangler secret` / `.dev.vars` locally
- `wrangler.toml` D1 binding name: `DB`

---

## 2. Routes

```
/                          → Welcome / onboarding (screen 0)
/observe                   → Setup + live FIT count flow (screens 2 → 3 → 4 → 5)
/leaderboard               → Kiez rankings (screen 1)
/explore                   → Map + hub list (screen 6)
/hub/[slug]                → Hub detail + QR entry point (pre-fills /observe)
/hub/new                   → Create hub (post hub-pack purchase)
/hub-pack                  → Hub Pack product page + Stripe checkout (screen 7)
/collection                → User profile, XP, cards, streaks
/share/[sessionId]         → Shareable session result card (OG image-ready)
/auth/login                → Email+password + magic link
/auth/callback             → Supabase OAuth/magic link callback
/api/stripe/webhook        → Stripe webhook handler (Worker route)
/hub/[slug]/dashboard      → Hub owner dashboard (sessions, sightings, observer count)
/api/hub/[slug]/live       → Public JSON endpoint — live hub stats polling (no auth required)
```

### QR deep-link pattern
Poster QR codes point to `/hub/[slug]?ref=qr`. On load, the app:
1. Stores `hub_slug` in session/localStorage
2. If user is anonymous or logged out → shows Welcome with "Start observing at [Hub Name]" CTA
3. On start → pre-fills hub in Setup screen

---

## 3. Auth

**Provider:** Supabase Auth (email+password, magic link/OTP)

**Anonymous flow:**
- User can tap through Welcome → Setup → Observe → Cards entirely without an account
- Session data held in memory / localStorage
- On Cards/Share screen: "Save your sightings + join the leaderboard" prompt triggers sign-up
- On sign-up, anonymous session data is merged into the new account

**Auth states:**
```
ANON       → can observe, cannot save to leaderboard or collection
REGISTERED → full access
ADMIN      → can manage hubs, insect types, seed data (checked via profiles.role)
```

**Supabase tables used for auth:**
- `auth.users` (Supabase managed)
- `public.profiles` (created via trigger on `auth.users` insert)

---

## 4. Database (Cloudflare D1)

> Supabase Auth is the identity layer only. All app data lives in D1.

### Schema

```sql
-- Insect types (DB-driven, extendable)
CREATE TABLE insect_types (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,       -- 'Bees', 'Beetles', etc.
  icon        TEXT NOT NULL,              -- emoji
  rarity      TEXT NOT NULL DEFAULT 'common', -- common | rare | epic
  xp_value    INTEGER NOT NULL DEFAULT 10,
  sort_order  INTEGER DEFAULT 0,
  active      INTEGER DEFAULT 1           -- 0 = hidden
);

-- Hubs (admin-seeded + user-created via hub pack)
CREATE TABLE hubs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  kiez        TEXT NOT NULL,              -- district label e.g. 'Moabit'
  icon        TEXT DEFAULT '🌿',
  lat         REAL,
  lng         REAL,
  owner_id    TEXT,                       -- supabase user uuid, null = admin-seeded
  active      INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- User profiles (mirrors auth.users)
CREATE TABLE profiles (
  id          TEXT PRIMARY KEY,           -- supabase user uuid
  display_name TEXT,
  home_kiez   TEXT,
  role        TEXT DEFAULT 'user',        -- user | admin
  xp_total    INTEGER DEFAULT 0,
  level       INTEGER DEFAULT 1,
  streak_days INTEGER DEFAULT 0,
  streak_last_date TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- Observation sessions
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,           -- uuid
  user_id     TEXT NOT NULL,              -- supabase uuid (or 'anon:deviceid')
  hub_id      INTEGER REFERENCES hubs(id),
  hub_name    TEXT,                       -- denormalised for anon sessions
  kiez        TEXT,
  weather     TEXT,                       -- sunny | partly | overcast | rainy
  focal_area  TEXT,                       -- free-text observer description of habitat patch
  lat         REAL,                       -- GPS at time of session start
  lng         REAL,
  duration_min INTEGER NOT NULL,          -- 1 | 3 | 5 | 10 (10 is default/recommended)
  started_at  TEXT,
  completed_at TEXT,
  total_count INTEGER DEFAULT 0,
  xp_earned   INTEGER DEFAULT 0,
  shared      INTEGER DEFAULT 0
);

-- Individual sighting taps within a session
CREATE TABLE sightings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  insect_type_id INTEGER REFERENCES insect_types(id),
  insect_name TEXT NOT NULL,              -- denormalised
  count       INTEGER DEFAULT 1,
  tapped_at   TEXT DEFAULT (datetime('now'))
);

-- Hub Pack orders
CREATE TABLE hub_orders (
  id              TEXT PRIMARY KEY,       -- Stripe session id
  user_id         TEXT NOT NULL,
  hub_name        TEXT,                   -- name user wants for their hub
  kiez            TEXT,
  stripe_status   TEXT DEFAULT 'pending', -- pending | paid | failed
  hub_id          INTEGER REFERENCES hubs(id), -- set after hub is created
  created_at      TEXT DEFAULT (datetime('now'))
);
```

### D1 Indexes
```sql
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_hub ON sessions(hub_id);
CREATE INDEX idx_sightings_session ON sightings(session_id);
CREATE INDEX idx_hubs_kiez ON hubs(kiez);
```

### Leaderboard query (Kiez ranking)
```sql
SELECT
  h.kiez,
  SUM(s.total_count) AS total_sightings,
  COUNT(DISTINCT s.user_id) AS observer_count
FROM sessions s
JOIN hubs h ON s.hub_id = h.id
WHERE s.completed_at >= datetime('now', '-30 days')
GROUP BY h.kiez
ORDER BY total_sightings DESC;
```

---

## 5. Screens & Components

### Screen map
```
/                    WelcomeScreen
/leaderboard         LeaderboardScreen
/observe             SetupScreen → ObserveScreen → CardsScreen → SummaryScreen
/explore             ExploreScreen (Stadia map + hub list)
/hub/[slug]          HubDetailScreen (QR landing)
/hub-pack            HubPackScreen → Stripe redirect
/hub/new             CreateHubScreen (post-payment)
/collection          CollectionScreen
/share/[sessionId]   ShareScreen
/auth/login          LoginScreen
```

### Key components
```
src/lib/components/
  InsectGrid.svelte        -- tap-to-count grid with animation
  TimerDisplay.svelte      -- countdown with progress bar (DM Mono)
  KiezCard.svelte          -- leaderboard row with rank + bar
  InsectCard.svelte        -- collection card (common/rare/epic styling)
  MiniCard.svelte          -- small card in collection location set
  HubPin.svelte            -- map pin component
  ShareCard.svelte         -- dark green shareable session card
  XPBar.svelte             -- level progress bar
  StreakBar.svelte          -- 7-day streak display
  WeatherPicker.svelte     -- 4-option weather selector
  TimerPicker.svelte       -- 1/3/5/10 min selector (10 pre-selected)
```

---

## 6. Maps (Stadia Maps)

- **Library:** MapLibre GL JS via `maplibre-gl` npm package
- **Style:** Stadia Alidade Smooth (or OSM Bright for outdoor feel)
- **API key:** stored in `STADIA_API_KEY` env var, passed to style URL
- **Used on:** `/explore` and hub detail pages
- **Features v1:**
  - Hub pins with custom SVG markers
  - Tap pin → open hub detail sheet
  - User GPS location dot (browser geolocation API)
  - Cluster pins when zoomed out

```typescript
// Style URL pattern
const styleUrl = `https://tiles.stadiamaps.com/styles/alidade_smooth.json?api_key=${STADIA_API_KEY}`;
```

---

## 7. Payments (Stripe)

### Flow
1. User taps "Order my hub pack" on `/hub-pack` (pay-what-you-want pricing)
2. Server creates Stripe Checkout Session (Worker server action)
3. User redirected to Stripe hosted checkout
4. On success → redirected to `/hub/new?order={stripe_session_id}`
5. `/hub/new` verifies payment status via Stripe API, then lets user name + locate their hub
6. On submit → creates hub in D1, marks order as fulfilled

### Webhook handler (`/api/stripe/webhook`)
- Listens for `checkout.session.completed`
- Updates `hub_orders.stripe_status = 'paid'`
- Idempotent (check order id before processing)

### Env vars
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID          -- pay-what-you-want hub pack price (custom amount)
```

---

## 8. Gamification Logic

### XP values (from insect_types table)
| Rarity | XP | Examples |
|---|---|---|
| common | 5–10 | Bees, Butterflies, Flies, Ants, Wasps |
| rare | 20 | Beetles, Spiders |
| epic | 50 | Other (unidentified / unusual) |

### Levels
```typescript
const XP_THRESHOLDS = [0, 100, 250, 500, 900, 1500, 2500]; // Level 1–7

const LEVEL_TITLES = [
  'Curious Passer-by',   // 1
  'Kiez Naturalist',     // 2
  'Field Observer',      // 3
  'Kiez Guardian',       // 4
  'Bugmeister',          // 5
  'Stadtökologe',        // 6
  'Berliner Insektenheld', // 7
];
```
Level title is stored on `profiles.level` (integer) and resolved client-side — no DB column needed for title.

### Leaderboard-first UX
The leaderboard is shown **before** the observation begins, not after. This is intentional — users understand the stakes (Kiez rivalry, gap to leader) before being asked to put in the effort. Welcome → Leaderboard → Setup → Observe is the intended cold-start flow.

### Streak logic
- A streak increments if user completes a session on a calendar day not yet counted
- Streak resets if `streak_last_date` is more than 1 day ago
- Checked + updated in `POST /api/sessions/complete`

### Cards / collection
- A card is "unlocked" when a user sights that insect type for the first time at a given hub
- Cards are **location-specific** — a Beetle card from Moawald is a distinct entry from one earned at Tiergarten
- Locked slots shown as `???` until unlocked (8 slots per hub)

### Email capture (Close / Summary screen)
- Shown after session cards, framed as "your cards travel with you" — not newsletter language
- On submit: upsert to `profiles.email` if registered, or store to a `pending_emails` table if anon
- This is the primary non-intrusive conversion point for anonymous users

### Tally form (out of scope — data integration note)
A parallel Tally form captures richer field observation data from the same pilot location. Bugmeister is the lightweight gamified layer on top. No integration required for v1, but session `id` + `hub_slug` should be noted as potential join keys if data is ever merged.

---

## 9. Insect Types (Seed Data)

```sql
INSERT INTO insect_types (name, icon, rarity, xp_value, sort_order) VALUES
  ('Bees',        '🐝', 'common', 10, 1),
  ('Butterflies', '🦋', 'common', 10, 2),
  ('Flies',       '🪰', 'common',  8, 3),
  ('Beetles',     '🪲', 'rare',   20, 4),
  ('Ants',        '🐜', 'common',  5, 5),
  ('Wasps',       '🐝', 'common', 10, 6),
  ('Spiders',     '🕷️', 'rare',   20, 7),
  ('Other',       '🦗', 'epic',   50, 8);
```

### Hub Seed Data (Berlin)
```sql
INSERT INTO hubs (slug, name, kiez, icon, lat, lng) VALUES
  ('tiergarten',      'Tiergarten',             'Mitte',   '🌳', 52.5145, 13.3501),
  ('humboldthain',    'Volkspark Humboldthain',  'Wedding', '🌿', 52.5495, 13.3842),
  ('naturkundemuseum','Naturkundemuseum',         'Mitte',   '🏛️', 52.5304, 13.3814),
  ('moawald',         'Moawald',                 'Moabit',  '🌿', 52.5279, 13.3400);
```

---

## 10. Env Vars Summary

```bash
# .dev.vars (local) / wrangler secret (prod)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=    # server-side only
STADIA_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=
```

---

## 11. Assumptions & Open Questions

| # | Assumption | Revisit when |
|---|---|---|
| A1 | Kiez is a text label on each hub (no GeoJSON district lookup) | If you want GPS auto-assignment to Kiez without a hub pin |
| A2 | Insect list is DB-driven (extendable via admin) | Already decided — just noting it's not hardcoded |
| A3 | Anonymous sessions use `anon:{fingerprint}` as user_id, not persisted to D1 until sign-up | If you want anon data to contribute to leaderboard |
| A4 | Share screen generates a static HTML page at `/share/[id]` with OG meta tags | If you want canvas-rendered image export, needs additional work |
| A5 | No push notifications in v1 | Streak reminders would use Capacitor Push later |
| A6 | Capacitor shell is out of scope for this build — web-first, mobile-responsive | When ready to ship to App Store |

---

## 12. Project Structure

```
bugmeister/
├── src/
│   ├── app.html
│   ├── app.css                  -- CSS custom properties (design tokens)
│   ├── lib/
│   │   ├── components/          -- Svelte UI components
│   │   ├── i18n/
│   │   │   ├── en.json
│   │   │   ├── de.json
│   │   │   ├── nl.json
│   │   │   └── index.ts         -- init + locale helpers
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   └── queries.ts       -- typed D1 query helpers
│   │   ├── auth.ts              -- Supabase client helpers
│   │   ├── stripe.ts            -- Stripe helpers
│   │   ├── gamification.ts      -- XP, level, streak logic
│   │   └── types.ts             -- shared TypeScript types
│   └── routes/
│       ├── +layout.svelte       -- nav, auth state
│       ├── +page.svelte         -- Welcome
│       ├── observe/
│       ├── leaderboard/
│       ├── explore/
│       ├── hub/
│       │   ├── [slug]/
│       │   │   ├── +page.svelte         -- hub detail / QR landing
│       │   │   └── dashboard/           -- hub owner dashboard
│       │   └── new/
│       ├── hub-pack/
│       ├── collection/
│       ├── share/[sessionId]/
│       ├── auth/
│       │   ├── login/
│       │   └── callback/
│       └── api/
│           ├── sessions/
│           ├── hub/
│           │   └── [slug]/
│           │       └── live/            -- live hub stats endpoint (public)
│           └── stripe/
│               └── webhook/
├── static/
├── migrations/
│   └── 0001_initial.sql
├── wrangler.toml
└── SPEC.md
```
