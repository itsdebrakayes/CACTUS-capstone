# CACTUS Proof of Concept — TODO

## Phase 1–8: Core Backend & Frontend

- [x] Database schema with 16 tables and geohash indexing
- [x] tRPC API routes for all 5 features (walking, claims, reports, check-ins, footpaths)
- [x] SSE realtime event system (server-sent events)
- [x] Background job scheduler (TTL countdown, check-in monitoring)
- [x] Core algorithms: geohashing, trust scoring, claim validation
- [x] 48 passing vitest tests (4 test files)
- [x] Dashboard layout with split pane (map 70% + panels 30%)
- [x] WalkingBodyPanel component with trust score, availability toggle, star rating
- [x] ActionPanels component (Claims, Reports, Check-In) with voting UI
- [x] CactusMap component (Mapbox GL JS)
- [x] useSSE hook for realtime event streaming
- [x] Geolocation tracking (navigator.geolocation.watchPosition)
- [x] Live event feed panel

## Phase 9: Mapbox Token, Voting UI, Map Interactivity

- [x] Mapbox public token set and validated (pk.eyJ1...)
- [x] UWI Mona Campus as default map center (18.0035, -76.7497)
- [x] Marker clustering for nearby walkers
- [x] Route visualization using Mapbox Directions API (walking profile)
- [x] Click-to-select destination mode for Check-In
- [x] Hazard pins with severity-based colors and TTL progress bar
- [x] Footpath overlay layer (admin-drawn, GeoJSON)
- [x] Voting UI for Class Claims (ThumbsUp/ThumbsDown confirm/deny)
- [x] Voting UI for Caution Reports (still_there / not_there)
- [x] Home landing page with feature overview and login CTA
- [x] Auto-redirect authenticated users to /dashboard
- [x] Integration test suite (16 tests covering all routers)

## Pending / Future Work

- [ ] Admin footpath drawing tool (Mapbox Draw, admin-only)
- [ ] User-suggested alternate routes (submit GeoJSON LineString)
- [ ] Course management UI (search courses by code, not just ID)
- [ ] Push notifications for check-in failures
- [ ] Mobile-responsive layout improvements
- [ ] Campus-specific map style (satellite + labels)
- [ ] Configurable campus center (admin settings panel)
- [ ] End-to-end testing with two real devices
