# Context-Aware Navigation Platform

A full-stack **Progressive Web App (PWA)** for context-aware navigation and routing. This is a real product build — **not a campus/academic project**. A university campus was used purely as the **initial MVP environment** to validate the routing engine, accessibility model, real-time navigation, and analytics pipeline against a small, dense, well-understood road network. The architecture is deliberately generic and can be pointed at any road network served by OpenStreetMap / Overpass.

> **Frontend docs → [`FRONTEND.md`](FRONTEND.md)**
>
> **Backend docs → [`BACKEND.md`](BACKEND.md)**
>
> **Report lifecycle → [`REPORT_LIFECYCLE.md`](REPORT_LIFECYCLE.md)**

---

## Highlights

- **Context-aware routing** — A* pathfinding whose edge costs adapt to surface type, incline, lighting, traffic, weather, gate/access schedules, and reported hazards
- **Four routing profiles** — Standard, Accessible, Night Safety, Fastest
- **Five travel modes** — Walk, Cycle, Jog, Drive, Motorcycle
- **Real-time navigation** — GPS tracking, smooth 60fps position interpolation, off-route deviation detection with automatic rerouting, turn-by-turn voice guidance
- **Dual map rendering** — 2D (Leaflet) and 3D (MapLibre GL JS, lazy-loaded)
- **Voice input** — speech-to-text destination search with live interim results and inline error feedback
- **Community reporting** — user-submitted accessibility reports that automatically influence routing (detours around confirmed issues)
- **Analytics & heatmaps** — anonymized route sampling visualized as a movement heatmap
- **Auth & roles** — email/password + OAuth via Supabase, with an admin dashboard
- **PWA & offline** — installable, service-worker caching, works offline

---

## Architecture

Two independently deployable packages in a single monorepo:

| Package | Tech | Responsibility |
|---|---|---|
| `frontend/` | React 19 · Vite 8 · Leaflet · MapLibre GL · Supabase JS | All map, routing, and navigation logic runs **client-side** (road graph + A* in Web Workers, UI in the main thread) |
| `backend/` | Node.js · Express · PostgreSQL (prod) / SQLite (dev) | API layer: auth sync, profiles, admin stats, analytics, accessibility reports, and rate-limited proxy for geocoding + weather |

The backend has **no routing logic** — pathfinding lives entirely in the frontend so navigation works even offline.

### Key architectural decisions

- **Web Workers** keep graph building, A* pathfinding, and navigation tracking off the main thread for a smooth 60fps UI
- **Client-side routing** — the road graph is fetched from the Overpass API and cached in IndexedDB
- **Context-aware cost function** — a single `calculateEdgeCost()` weighs highway type, surface, incline, sidewalk, lighting, traffic windows, gate schedules, weather, turn penalties, and hazard reports
- **Real-time rerouting** — automatic recalculation when the user strays more than 45m off-route
- **PWA** — service worker + manifest for installability and offline use

---

## Tech Stack

**Frontend:** React 19, Vite 8, Leaflet + React-Leaflet, MapLibre GL JS, leaflet.heat, Supabase JS, Heroicons, Web Workers, Service Worker

**Backend:** Node.js ≥ 20, Express, Supabase Auth, PostgreSQL (production) / SQLite (development), Nodemailer, express-validator, rate limiting, helmet

---

## Repository Structure

```
finalyoproject/
├── README.md              # You are here
├── FRONTEND.md            # Frontend deep-dive (architecture, components, hooks, services)
├── BACKEND.md             # Backend deep-dive (schema, routes, middleware, security)
├── REPORT_LIFECYCLE.md    # Accessibility report approval → map/routing effect flow
│
├── frontend/              # React PWA
│   ├── public/            # PWA manifest, icons, service worker
│   └── src/
│       ├── context/       # Auth + focus state providers
│       ├── hooks/         # useAuth, useGeolocation, useRouting, useVoiceGuidance,
│       │                  #   useSpeechRecognition, useWeather, useRealtimeRoutes, ...
│       ├── services/      # costFunction, routing (A*), graphBuilder, geocoding,
│       │                  #   directions, gateSchedule, heatmapAnalytics, ...
│       ├── workers/       # routingWorker, graphBuilderWorker, navigationWorker
│       ├── components/    # Map, Panel, Search, Legend, Profile, Admin, Auth
│       ├── data/          # Seed location dataset for the MVP area
│       └── function/utils # distance, geometry, MinHeap, bounds, colors
│
└── backend/               # Express API
    ├── src/
    │   ├── routes/        # /auth, /admin, /analytics, /api/reports
    │   ├── middleware/    # JWT auth, admin, validation
    │   ├── services/      # email service
    │   ├── config/        # dual-database adapter
    │   └── db/            # schema + SQLite/PostgreSQL migration runners
    └── scripts/           # dev database reset
```

---

## Getting Started

### Prerequisites

- **Node.js ≥ 20** (frontend uses Node 24-era tooling; backend requires ≥ 20)
- **npm** (v10+)
- A **Supabase** project (optional for frontend dev — see below)
- A **LocationIQ** API key (backend)

### 1. Install dependencies

```bash
npm install --prefix frontend
npm install --prefix backend
```

### 2. Configure environment

**Frontend** (`frontend/.env`):

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Prod only | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Prod only | Supabase anonymous key |
| `VITE_API_URL` | No | Backend URL (prod default: the Render-deployed API) |
| `VITE_DEV_API_URL` | No | Backend URL in dev (default `http://localhost:3001`) |

> In development with **no** Supabase keys set, the app automatically falls back to a full `MockSupabaseClient` (sessions in `localStorage`) so you can develop with zero external dependencies.

**Backend** (`backend/.env`) — see [`BACKEND.md`](BACKEND.md#3-environment-variables) for the full table. The essentials:

| Variable | Required | Description |
|---|---|---|
| `JWT_ACCESS_SECRET` | Yes | Access-token signing secret |
| `JWT_REFRESH_SECRET` | Yes | Refresh-token signing secret |
| `LOCATIONIQ_API_KEY` | Yes | Geocoding API key (kept server-side) |
| `SUPABASE_URL` | Yes | Supabase project URL (password recovery / re-auth) |

> **Security:** API keys and secrets live only in local `.env` files (gitignored). Never commit real keys.

### 3. Run the backend

```bash
cd backend
npm run dev        # default http://localhost:3001
```

In development the backend uses a local **SQLite** database (auto-created and migrated on startup). Set `NODE_ENV=production` and a `DATABASE_URL` to use PostgreSQL.

### 4. Run the frontend

```bash
cd frontend
npm run dev        # http://localhost:5173
```

Open the app, register an account (or use the mock client), and plan a route.

---

## Scripts

### Frontend (`frontend/`)

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | Production build |
| `npm run lint` | ESLint over the project |
| `npm run preview` | Preview the production build |

### Backend (`backend/`)

| Command | Description |
|---|---|
| `npm run dev` | Start the API with auto-reload |
| `npm run start` | Start the API (production) |
| `npm run migrate` | Run SQLite schema migrations |
| `npm run migrate:pg` | Run PostgreSQL schema migrations |
| `npm run reset` | Reset the local SQLite database |

*(Confirm exact script names in `backend/package.json` — they may vary by version.)*

---

## Features Deep Dive

### Routing engine
Client-side **A\*** over an OSM-derived road graph, with a context-aware edge cost function:

1. Highway base cost per road type
2. Surface penalty (unpaved routes cost more, worse in rain)
3. Incline penalty (up to 3.5× on very steep edges)
4. Sidewalk availability (important for the Accessible profile)
5. Lighting (heavily weighted at night)
6. Traffic multipliers during peak hours
7. Gate/access schedule restrictions (vehicles restricted during defined windows; pedestrians always pass)
8. Turn penalties (moderate/sharp/U-turn)
9. Directional penalty to keep the search goal-oriented
10. Campus-core discount for internal roads
11. Weather modifiers and **approved hazard-report penalties** (up to effectively blocked for severe construction)

### Voice search
The microphone button in the navigation pill uses the Web Speech API (`SpeechRecognition`). It shows **live interim transcript**, animated listening feedback, and human-readable errors for unsupported browsers, denied permissions, no microphone, or silence — with Try-again/Dismiss actions. Falls back gracefully on browsers without support.

### Accessibility reporting
Users can submit accessibility issues (blocked ramps, missing curb cuts, broken surfaces, poor lighting, construction). Approved reports:
- Appear as severity-colored markers on the map
- Add cost penalties to nearby edges, so routes detour around confirmed issues
- Can be marked resolved by the reporter (removing the effect)

See [`REPORT_LIFECYCLE.md`](REPORT_LIFECYCLE.md) for the full flow.

### Analytics & heatmap
Every calculated route is sampled and bucketed geographically + temporally, then visualized as an animated heatmap with time-of-day filtering. No personal data is transmitted — only anonymized route segments.

### Admin dashboard
Real-time stats (active users, routes, security events), 7-day activity charts, profile usage breakdown, top destinations, user management, and a report review queue.

---

## Deployment

The MVP stack is containerized-friendly and was validated on **Render** (free tier):

- **Frontend** — static build (`npm run build`) served with PWA support; live at `https://ugnavigator.onrender.com`
- **Backend** — Express API; live at `https://api-ug-navigator.onrender.com`

Notes:
- Backend uses PostgreSQL (via Supabase) in production; SQLite is dev-only
- Production requires the env vars listed in [`FRONTEND.md`](FRONTEND.md#3-environment-variables) and [`BACKEND.md`](BACKEND.md#3-environment-variables)
- Keep-alive self-ping prevents free-tier cold starts

---

## Roadmap

The MVP validated the full product loop on a single campus network. Planned expansion:

- Generic road-network bootstrapping (route a new area by bounding box — no code changes)
- Turn-by-turn with voice in more locales/languages
- Transit and multi-modal (bus + walk) routing
- Real-time traffic feed integration
- Native mobile wrappers (Capacitor / TWA)

---

## License

All rights reserved. This repository is private; do not reuse the branding, data, or code without permission.
