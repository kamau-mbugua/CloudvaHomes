# Hodi / KodiHub — Marketing Landing Page (`landing/`)

Public marketing landing page served at:
- **Production**: `https://kodihub.co.ke` *(and `https://www.kodihub.co.ke` → 308 redirect)*
- **Development**: `https://landing.kodihub.co.ke`

## Architecture & Superadmin Content Control

All text, hero copy, announcements, statistics, feature cards, pricing copy, and footer contact links are **controlled dynamically by each environment's superadmin**:

1. **Public Content API**: [`GET /api/v1/public/landing`](../backend/src/modules/platform/platform.controller.ts) returns the active `LandingPageContent` and default subscription plan pricing for that environment.
2. **Superadmin Editor**: Platform admins edit the landing page live in the web app under **Platform → Settings → Landing page** (`/admin/settings?tab=landing`), backed by `GET / PUT /api/v1/platform/landing`.
3. **Frontend (`index.html`)**: Fetches `/api/v1/public/landing` (proxied by Caddy on the landing host, with fallback to `https://api.kodihub.co.ke` on prod and `https://dapi.kodihub.co.ke` on dev) and renders the environment's superadmin-configured content.

## Local Preview

With the backend running on `http://localhost:8080`, serve `landing/` over any static HTTP server:

```bash
cd landing
python3 -m http.server 4000
```
Then open `http://localhost:4000`.
