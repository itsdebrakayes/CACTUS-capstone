# CACTUS Proof of Concept - TODO

## Database & Schema
- [x] Create database schema with all required tables (users, courses, walking_availability, walking_requests, walking_matches, walking_ratings, class_claims, class_claim_votes, rep_strikes, path_reports, path_report_votes, path_report_reliability, checkins, notifications_outbox, footpaths)
- [x] Add geohash indexing on walking_availability(geohash5) and path_reports(geohash6)
- [x] Create indexes for foreign keys and frequently queried columns
- [x] Run migrations and verify schema

## Backend - Core Infrastructure
- [x] Set up authentication (JWT + session management)
- [x] Create database query helpers in server/db.ts
- [x] Install required packages: ngeohash, node-cron, zod
- [x] Create shared types and constants

## Backend - API Routes
- [x] POST /walking/availability - Update GPS location and availability status
- [x] POST /walking/request - Request nearby walkers within radius
- [x] POST /walking/match/:id/respond - Accept/decline match request
- [x] POST /walking/rate - Submit rating for walking partner
- [x] POST /courses - Create course (admin)
- [x] POST /courses/:id/enroll - Add user to course
- [x] POST /courses/:id/verify-rep - Verify class representative
- [x] POST /classes/claims - Create class claim
- [x] POST /classes/claims/:id/vote - Vote on class claim
- [x] GET /classes/claims - Get claims for course
- [x] POST /reports - Create caution report
- [x] POST /reports/:id/vote - Vote on caution report
- [x] GET /reports - Get reports (optional bbox filtering)
- [x] POST /checkins - Create check-in with destination and ETA
- [x] POST /checkins/:id/complete - Manually complete check-in
- [x] GET /checkins/active - Get active check-ins
- [x] POST /footpaths - Save footpath GeoJSON
- [x] GET /footpaths - Load all footpaths
- [x] GET /realtime/events - SSE stream for real-time updates

## Backend - Core Algorithms
- [x] Implement geohash ring expansion for nearby matching (precision 6 and 5 fallback)
- [x] Implement Haversine distance filtering
- [x] Implement Bayesian trust score calculation
- [x] Implement class claim validation logic (threshold calculation based on class size)
- [x] Implement rep strike system with bypass disabling and forgiveness
- [x] Implement TTL countdown and expiration for caution reports
- [x] Implement report reliability weighting based on voter history

## Backend - Realtime & Jobs
- [x] Set up SSE event emitter and client subscriptions
- [x] Create background job for TTL countdown (runs every 5 minutes)
- [x] Create background job for check-in monitoring (runs every minute)
- [x] Emit events: walking.availability.updated, walking.request.created, walking.match.updated, trust.walking.updated, class.claim.created, class.claim.voted, class.claim.resolved, class.rep.strike, class.rep.forgiveness, reports.created, reports.voted, reports.ttl.tick, reports.expired, checkins.created, checkins.completed, checkins.failed
- [x] Create notifications_outbox entries for failed check-ins

## Frontend - Core Setup
- [x] Install Mapbox GL JS and Mapbox Draw
- [x] Set up Tailwind CSS with campus safety color scheme (navy/charcoal + mint/blue)
- [x] Create global layout structure (split-pane: map left 70%, panels right 30%)
- [x] Implement SSE client with EventSource
- [x] Set up React Router and navigation
- [x] Create authentication guards and login flow

## Frontend - Map & Dashboard
- [x] Integrate Mapbox GL JS with map centered on UWI Mona
- [x] Display user's live location (blue dot)
- [x] Display nearby anonymous walkers (small dots)
- [x] Display hazard pins (colored by severity)
- [x] Create main dashboard layout with split pane
- [x] Implement live event feed panel
- [ ] Implement map click to select destination for check-ins
- [ ] Implement Mapbox Draw for footpath editing

## Frontend - Walking Body Panel
- [x] Create toggle for "Available to Walk"
- [x] Create request walking body form (radius selector)
- [x] Display pending match cards with accept/decline buttons
- [x] Create trust score card for user
- [ ] Create rating modal for walking partners
- [x] Display real-time match updates via SSE

## Frontend - Class Claims Panel
- [x] Create course selector
- [x] Create claim composer (type + message)
- [ ] Display claims table with vote counts and status
- [ ] Create vote buttons (confirm/deny)
- [ ] Display rep status card (strike count + bypass status)
- [ ] Show real-time claim updates via SSE

## Frontend - Caution Reports Panel
- [x] Create report form (type + severity + location)
- [ ] Display report list with TTL countdown
- [ ] Create vote buttons (still-there/not-there)
- [ ] Display severity-based color coding
- [ ] Show real-time report updates and TTL ticks via SSE

## Frontend - Check-In Panel
- [x] Create destination picker (map click integration)
- [x] Create ETA selector + grace period input
- [x] Create emergency contact field
- [ ] Display status monitor with real-time updates
- [ ] Create complete button for manual completion
- [ ] Show failure notifications via SSE

## Frontend - Live Feed Panel
- [x] Display SSE events in chronological order
- [ ] Implement slide-in animation for new events
- [x] Show event type, timestamp, and brief description
- [ ] Filter events by type (optional)

## Frontend - UI Polish
- [x] Implement card styling (16-20px padding, 12-16px radius, subtle shadows)
- [x] Create status badges (Pending, Verified, Rejected, Active, Expired, Failed)
- [ ] Add subtle transitions and hover effects
- [ ] Implement responsive design for mobile
- [x] Add loading states and spinners
- [x] Add error handling and toast notifications
- [x] Optimize icon usage throughout UI

## Testing & Integration
- [x] Write vitest tests for authentication (1 test)
- [x] Write vitest tests for geohash matching algorithm (6 tests)
- [x] Write vitest tests for trust score calculation (4 tests)
- [x] Write vitest tests for claim validation logic (5 tests)
- [x] Write vitest tests for TTL countdown logic (3 tests)
- [x] Write vitest tests for check-in logic (3 tests)
- [x] Write vitest tests for timestamp utilities (2 tests)
- [ ] Test walking body flow end-to-end (two devices)
- [ ] Test class claims flow end-to-end
- [ ] Test caution reporting flow end-to-end
- [ ] Test check-in flow end-to-end
- [ ] Test SSE real-time updates
- [ ] Test background jobs execution

## Documentation & Delivery
- [ ] Create comprehensive README with setup instructions
- [ ] Document environment variables and .env.example
- [ ] Create demo script with step-by-step instructions
- [ ] Test on two devices with real geolocation
- [ ] Verify HTTPS works for mobile geolocation
- [ ] Create final checkpoint

## Known Issues to Address
- [ ] Mapbox token placeholder needs real token
- [ ] Some TypeScript errors in pre-existing components (Markdown, ComponentShowcase)
- [ ] Need to test tRPC endpoints with actual data
- [ ] Need to validate geohash matching accuracy
- [ ] Need to test SSE connection stability
