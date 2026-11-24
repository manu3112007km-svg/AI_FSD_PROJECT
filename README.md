# ResQNet – Intelligent Emergency Response & Resource Management System

**Tagline:** *Intelligent Coordination. Faster Response. Stronger Communities.*

ResQNet is a full-stack, AI-powered emergency reporting, coordination, resource allocation, hospital capacity, and situational awareness platform.

> **Official Emergency Disclaimer:** ResQNet is an emergency coordination prototype and does not replace official public safety services. If you are experiencing an immediate life-threatening emergency, contact **911**, **112**, or your local emergency services directly.

---

## Architecture Overview

- **Frontend:** React 19, TypeScript, Tailwind CSS v4 (Pure Gold & Silver theme with **Times New Roman** typography), Motion, Recharts, Leaflet + OpenStreetMap, jsPDF (`jspdf` + `jspdf-autotable`).
- **Backend:** Node.js + Express + WebSockets (`ws` on `/ws`), JWT Authentication (`jsonwebtoken`), salted `scrypt` password hashing, sliding-window rate limiting, and RBAC enforcement.
- **Database:** 17-table normalized relational schema enforced with foreign keys and indexes (`src/server/db/database.ts` via Node 22 SQLite `WAL` mode, plus PostgreSQL/PostGIS reference DDL in `database/schema.sql`).
- **AI Engine:** Server-side `@google/genai` (`gemini-4-hydrogen`) with strict JSON schema extraction, natural-language report parsing, database-grounded decision support, and deterministic rule-based fallbacks when `GEMINI_API_KEY` is unavailable.

---

## Demonstration Accounts

All demonstration accounts are explicitly labeled in the UI and use password **`ResQNet2026!`** (or 1-click Demo Role login on the portal):

| Role | Email | Capabilities |
| :--- | :--- | :--- |
| **Super Administrator** | `admin@resqnet.demo` | Full platform oversight, user/org management, audit logs, demo data reset |
| **Emergency Coordinator** | `coordinator@resqnet.demo` | Incident verification, AI advisory review, smart resource dispatch, AI assistant |
| **Emergency Responder** | `responder@resqnet.demo` | Accept assignments, update field progress (`Response in Progress`, `Assistance Provided`) |
| **Hospital Administrator** | `hospital@resqnet.demo` | Update ED status, general/ICU bed availability, medical facilities |
| **Citizen** | `citizen@resqnet.demo` | Submit reports (with natural language AI & GPS consent), track updates, view hospitals |

---

## Setup & Execution

1. **Environment Variables** (see `.env.example`):
   - `GEMINI_API_KEY` — Optional for live Gemini AI calls (deterministic fallback rules operate automatically when unset).
   - `JWT_SECRET` — Optional signing secret for JWT tokens.
   - `PORT` — Defaults to `3000`.
2. **Install & Run:**
   ```bash
   npm install
   npm run dev
   ```
3. **Run Unit & Integration Tests:**
   ```bash
   npx --yes tsx --test src/server/domain/rules.test.ts
   npx --yes tsx --test src/server/api.test.ts
   ```
4. **Build & Production Start:**
   ```bash
   npm run build
   npm start
   ```

---

## Key REST API Endpoints

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/demo-login`, `GET /api/auth/me`
- `GET /api/incidents`, `POST /api/incidents`, `GET /api/incidents/:id`, `PATCH /api/incidents/:id`, `POST /api/incidents/check-duplicates`
- `GET /api/resources`, `POST /api/resources`, `PATCH /api/resources/:id`, `POST /api/resources/allocate`, `GET /api/resources/recommendations/:incidentId`
- `GET /api/hospitals`, `POST /api/hospitals`, `PATCH /api/hospitals/:id/capacity`, `PATCH /api/hospitals/:id/verify`
- `GET /api/analytics/overview`, `GET /api/analytics/predictive`
- `POST /api/ai/analyze-incident`, `POST /api/ai/extract-report`, `POST /api/ai/decision-support`, `POST /api/ai/generate-summary`
- `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/read-all`
- `GET /api/admin/users`, `POST /api/admin/users`, `PATCH /api/admin/users/:id`, `GET /api/admin/organizations`, `PATCH /api/admin/organizations/:id`, `GET /api/admin/audit-logs`, `POST /api/admin/reset-demo`
