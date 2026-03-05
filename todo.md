# CACTUS Proof of Concept — TODO

## Phase 1–8: Core Backend & Frontend

- [x] Database schema with 16 tables and geohash indexing
- [x] tRPC API routes for all 5 features (walking, claims, reports, check-ins, footpaths)
- [x] SSE realtime event system (server-sent events)
- [x] Background job scheduler (TTL countdown, check-in monitoring)
- [x] Core algorithms: geohashing, trust scoring, claim validation
- [x] 48 passing vitest tests (4 test files)
- [x] WalkingBodyPanel component with trust score, availability toggle, star rating
- [x] ActionPanels component (Claims, Reports, Check-In) with voting UI
- [x] CactusMap component (Mapbox GL JS)
- [x] useSSE hook for realtime event streaming
- [x] Geolocation tracking (navigator.geolocation.watchPosition)

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
- [x] Integration test suite (16 tests covering all routers)

## Phase 10: App Restructure — Dashboard-First Design

### Auth
- [x] Add password hash + student ID fields to users table
- [x] Build custom login page (email + password form)
- [x] Build signup page (name, email, student ID, password)
- [x] JWT-based session for custom auth (bcrypt password hashing)
- [x] Redirect to /dashboard after login/signup

### Navigation
- [x] Build bottom navigation bar: Dashboard · Schedule · Map · Profile
- [x] Make Dashboard the first screen after login
- [x] Move map to Map tab (secondary)
- [x] Schedule tab with weekly calendar strip
- [x] Profile tab with trust score and logout
- [x] Class Chat accessible from Dashboard quick-action button

### Dashboard Screen (matches mockup)
- [x] Greeting header: "Good Morning/Afternoon/Evening, [Name]" + date
- [x] Urgent alert banner (shows active class claims/cancellations)
- [x] Current Class card: class name, room, time remaining, LIVE NOW badge, View Details
- [x] Quick action buttons: Find Way · Class Chat · Emergency
- [x] Up Next section: next class time, name, room, professor
- [x] Recent class updates feed

### Schedule Screen (matches mockup)
- [x] Search bar: "Find specific courses"
- [x] Tabs: My Classes · Campus Events
- [x] Weekly calendar strip (Mon–Fri with current day highlighted)
- [x] Time-slotted class list with CONFIRMED / UPDATED / CANCELLED badges
- [x] Room change indicator with update note

### Class Chat Screen
- [x] List of enrolled courses with active claim count badge
- [x] Select course → see class claims feed
- [x] Submit new claim (type + message)
- [x] Vote on existing claims (confirm/deny) with optimistic updates
- [x] Confidence bar showing confirm % 

### Map Tab
- [x] Accessible via Find Way button or Map tab
- [x] Full Mapbox map (CactusMap component, UWI Mona center)
- [x] Mode selector: Explore / Walking / Reports / Check-In
- [x] Walking partner request panel link
- [x] Hazard reports panel link
- [x] Check-in destination picker

### Profile Tab
- [x] User name, email display
- [x] Trust score card with progress bar
- [x] Menu sections: Academic, Safety, Settings
- [x] Logout button

## Pending / Future Work

- [ ] Admin footpath drawing tool (Mapbox Draw, admin-only)
- [ ] User-suggested alternate routes (submit GeoJSON LineString)
- [ ] Course management UI (search courses by code, not just ID)
- [ ] Push notifications for check-in failures
- [ ] Satellite map style toggle
- [ ] Configurable campus center (admin settings panel)
- [ ] Real course/schedule data from backend (currently mock data)
- [ ] End-to-end testing with two real devices
