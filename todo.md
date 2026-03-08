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

## Phase 16-19: Map UI Rebuild, Algorithm Hardening, Demo Mode

### Map UI (Waze-style)
- [ ] Floating caution/report button overlaid on map (bottom-right, yellow triangle)
- [ ] Hazard report bottom sheet with campus-specific categories (grid of icons)
- [ ] Campus categories: Broken Light, Flooding, Broken Path, Suspicious Activity, Obstruction, Violent Incident, Slippery Surface, Construction
- [ ] Severity-based pin colors on map (red=high, orange=medium, yellow=low)
- [ ] TTL countdown ring on hazard pins
- [ ] Still There / Not There vote buttons on pin popup
- [ ] Active hazard count badge on caution button
- [ ] Walking partner FAB (floating action button) on map
- [ ] Check-in destination tap-to-set mode

### Algorithm Hardening (per PDF spec)
- [ ] Bayesian trust score: C·m + n·p / (C + n) with safety penalty λ·flags
- [ ] Time-decay on walking ratings (stale ratings matter less)
- [ ] Class claim threshold: ceil(α·N · role_multiplier · (1 - β·user_trust))
- [ ] Claim trust update: T/(C+T+F) Bayesian formula
- [ ] Strike system: 4-strike escalation for class reps (warning → bypass suspend → longer suspend → semester ban)
- [ ] Strike forgiveness: 30-day clean streak decays strikes
- [ ] Caution report TTL: still_there extends, not_there reduces, severity-weighted
- [ ] Path-Report Reliability Score (separate from class trust and walking trust)
- [ ] Reputation-weighted confirmations for caution reports
- [ ] Re-validation prompts for stale reports (age > threshold)
- [ ] Check-in: ETA + buffer monitoring, no-progress detection

### Demo / Simulation Mode
- [ ] Seed demo data: mock walkers, hazard pins, class claims on UWI Mona
- [ ] Demo mode toggle that shows simulated nearby walkers on map
- [ ] Simulated SSE events for demo (fake hazard reports, claim updates)
- [ ] All panels testable without real GPS or other users

## Phase 20: Course Management System

### Backend
- [x] Extended courses table: description, thumbnailUrl, room, lecturer, department fields
- [x] courseAnnouncements table: type, title, body, isOfficial, status, upvotes, downvotes
- [x] courseMemberships table: userId, courseId, membershipRole (student/class_rep/lecturer)
- [x] savedCourses table for bookmarking
- [x] tRPC courses router: getMyCourses, getAllCourses, getCourseById, getSavedCourses, saveCourse, enroll
- [x] tRPC courses router: getAnnouncements, getCourseAnnouncements, postAnnouncement, submitCourseReport
- [x] tRPC courses router: voteAnnouncement (upvote/downvote), reviewAnnouncement (approve/reject)
- [x] tRPC courses router: getClassRepStats, getClassRepCourses, getCourseHealth, getPendingAnnouncements
- [x] DB migration applied (upvotes/downvotes columns added)
- [x] 10 UWI Mona courses seeded (COMP3161, COMP2140, COMP2201, PSYC2001, SOCI2005, MATH2401, ECON2010, BIOL2201, CHEM1010, COMP3901)
- [x] Sample course memberships and announcements seeded

### Frontend
- [x] CoursesPage: grid view, My Courses / Saved / Discover tabs, search, status badges (Active Update, New Content)
- [x] CourseDetailsPage: hero image/gradient, ACTIVE NOW badge, lecturer/room/size meta, quick-report buttons (Lecturer Late, Cancelled, Room Changed), community updates feed with upvote/downvote
- [x] ClassRepDashboard: stats grid (Active Issues, Pending Reports, Verified Today, My Courses), broadcast button, pending report cards with Verify/Reject, course health bars
- [x] CourseReportingPage: 6-type announcement grid (Cancelled, Lecturer Late, Room Changed, Rescheduled, Materials, General), compose form with title/body, student submissions list with Approve/Reject
- [x] AppLayout updated: Class Chat tab replaced with Courses tab (BookOpen icon, /courses route)
- [x] App.tsx: 4 new routes wired (/courses, /courses/:id, /courses/:id/rep, /courses/:id/reporting)
- [x] Class rep role gating: only class_rep membership can access Rep Dashboard and post official announcements
- [x] 122 tests still passing after all changes

## Phase 21: Auth Cleanup & Bug Fixes

- [x] Remove studentId field from users table schema and all related code
- [x] Remove studentId from signup form and backend signup procedure
- [x] Add emailVerified boolean and verificationCode + verificationExpiry fields to users table
- [x] Build sendVerificationEmail helper (6-digit code via nodemailer SMTP)
- [x] Add tRPC procedures: sendVerificationCode, verifyEmail
- [x] Update signup flow: after signup, redirect to /verify-email page
- [x] Build VerifyEmailPage: enter 6-digit code, auto-submit, paste support, 60s resend cooldown
- [x] Block login for unverified accounts (or show banner)
- [x] Fix Dashboard "View Details" button — navigates to /courses/:id
- [x] Verify all backend endpoints — 122 tests passing
