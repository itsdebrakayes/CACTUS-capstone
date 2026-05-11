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

## Phase 23: Class Reporting System & Trust Score Integration

### Database Schema
- [x] `course_sessions` table: recurring weekly schedule slots per course
- [x] `course_session_overrides` table: one-off calendar changes from verified reports
- [x] `class_reports` table: richer student course reports with session linkage, room/time fields, verification score, and thresholds
- [x] `class_report_votes` table: weighted votes by role (student=1, class_rep=2, year_rep=2, guild_admin=3, lecturer=5)
- [x] `trust_score_events` table: audit log for all trust score changes
- [x] `class_report_comments` table: discussion thread per report (class chat)
- [x] `push_subscriptions` table: PWA Web Push subscription endpoints
- [x] `user_notifications` table: in-app notifications on report verification
- [x] `users.trustScore` field: integer 0–100, default 50
- [x] `users.suspensionStatus` + `users.suspendedUntil` fields: reporting suspension
- [x] Drizzle migration: `0008_cactus_reporting_system.sql`

### Backend — DB Functions
- [x] Course session CRUD: `createCourseSession`, `getCourseSessionsByCourse`, `getCourseSession`, `getCourseSessionsByUser`
- [x] Session override CRUD: `getSessionOverridesByDate`, `createSessionOverride`
- [x] Class report CRUD: `createClassReport`, `getClassReport`, `getClassReportsByCourse`, `updateClassReportStatus`, `updateClassReportScore`, `getPendingExpiredClassReports`
- [x] Report vote CRUD: `createOrUpdateClassReportVote`, `getClassReportVotes`, `getUserVoteOnReport`
- [x] Trust score: `getUserTrustScore`, `updateUserTrustScore`, `logTrustScoreEvent`, `getTrustScoreHistory`, `applyTrustScoreChange`
- [x] Suspension: `getUserSuspensionStatus`, `applyReportingSuspension`, `clearUserSuspension`, `getExpiredSuspensions`, `countRejectedReportsInWindow`
- [x] Class chat: `createClassReportComment`, `getClassReportComments`, `deleteClassReportComment`
- [x] Push subscriptions: `upsertPushSubscription`, `deletePushSubscription`, `getPushSubscriptionsByUser`, `getPushSubscriptionsForCourse`, `deleteInvalidPushSubscription`
- [x] Notifications: `createUserNotification`, `getUserNotifications`, `markNotificationRead`, `createCourseNotificationsForVerifiedReport`
- [x] Permission helpers: `isUserRegisteredForCourse`, `isUserSuspendedFromReporting`, `getVoteWeightForUser`, `getRequiredThresholdForReport`

### Backend — tRPC Routers
- [x] `timetable.getMyTimetable`: returns enrolled sessions with today's overrides
- [x] `timetable.getCourseSessions`: returns sessions for a course
- [x] `timetable.createCourseSession`: class rep / lecturer / admin only
- [x] `classReports.submitReport`: membership + suspension check, threshold calculation, auto-verify for lecturers/admins
- [x] `classReports.getReportsByCourse`: pending or all reports with vote counts
- [x] `classReports.getReport`: single report with all votes
- [x] `classReports.voteOnReport`: weighted vote, score recalculation, auto-resolve, trust score updates
- [x] `classReports.getMyTrustScore`: own trust score and history
- [x] `classReports.getMySuspensionStatus`: own suspension status
- [x] `classChat.getCourseChat`: all reports + comments for a course
- [x] `classChat.addComment` / `getComments` / `deleteComment`
- [x] `push.subscribe` / `unsubscribe` / `getNotifications` / `markRead`

### Backend — Report Lifecycle Helpers
- [x] `handleReportVerified`: creates calendar override, updates trust scores, creates notifications, emits SSE event
- [x] `handleReportRejected`: penalises reporter, rewards correct downvoters, checks suspension threshold
- [x] Notification title/message builders for all report types

### Background Jobs
- [x] `handleClassReportExpiry` (every 10 min): expires pending reports, applies −2 trust penalty
- [x] `clearExpiredSuspensions` (every 30 min): lifts expired reporting suspensions
- [x] `cleanupExpiredWalkingRequests` (every 15 min): implemented (was placeholder)
- [x] `cleanupExpiredClaims`: implemented (was placeholder)

### Tests
- [x] 63 new Vitest tests in `server/classReporting.test.ts`
  - Vote weight by role (7 tests)
  - Verification score calculation (5 tests)
  - Report status determination (6 tests)
  - Required threshold calculation (7 tests)
  - Trust score deltas for reporter and voter (7 tests)
  - Trust score clamping (4 tests)
  - Suspension threshold logic (5 tests)
  - Notification title generation (6 tests)
  - Calendar override type mapping (6 tests)
  - End-to-end scenarios: verification and rejection (10 tests)

### Documentation
- [x] `docs/class-reporting-system.md`: full system documentation

## Pending / Future Work

- [ ] Admin footpath drawing tool (Mapbox Draw, admin-only)
- [ ] User-suggested alternate routes (submit GeoJSON LineString)
- [ ] Course management UI (search courses by code, not just ID)
- [ ] Push notifications for check-in failures (VAPID key pair setup)
- [ ] Satellite map style toggle
- [ ] Configurable campus center (admin settings panel)
- [ ] Real course/schedule data from backend (currently mock data)
- [ ] End-to-end testing with two real devices
- [ ] Frontend UI for classReports, classChat, push, and timetable routers
- [ ] VAPID key pair configuration for Web Push delivery

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

## Phase 22: Report Sheet & Map Navigation

### Report Bottom Sheet
- [x] Build ReportSheet component: slide-up bottom sheet with category grid + comment textarea
- [x] Categories: Cancelled, Lecturer Late, Room Changed, Rescheduled, Materials Posted, General Update
- [x] Wire ReportSheet to CourseDetailsPage quick-report buttons
- [x] Wire ReportSheet to CourseDetailsPage (quick-report + 'More options' button)
- [x] Submit creates a courseAnnouncement with the selected category tag + comment

### Map Navigation
- [x] Add search bar to MapPage (Apple Maps style — collapsed pill, expands to full panel)
- [x] Destination input panel with campus autocomplete (18 known buildings)
- [x] Live GPS mode: uses current location as start, draws Mapbox Directions route
- [x] Simulated Walk mode: shown when GPS is off or user opts out
- [x] Faculty hub picker: FST (4 hubs: Tasties, Eng Parking, SLT2, Guild) + 4 General hubs
- [x] Animated route playback: green dot moves along route at simulated walking pace (500ms ticks)
- [x] Landmark callouts at 25%, 50%, 75% progress during simulated walk
- [x] ETA display and progress bar during navigation (HUD overlay)

## Restore reminders (added by facelift pass)
- [x] Wire dashboard "Courses in Progress" to `trpc.courses.getMyCourses` (fallback to mock if empty).
- [x] Wire dashboard "Recent Updates" to `trpc.courses.getCourseAnnouncements` (first enrolled course).
- [x] Wire desktop calendar to `trpc.timetable.getMyTimetable` + course lookup.
- [x] Wire profile "Updates" feed and "All Courses" stat to real announcements + memberships.
- [x] Restore real auth (Login.tsx) and useAuth (src/_core/hooks/useAuth.ts) against tRPC.
- [ ] Checklist strikethrough must remove items from the visible list (still UI-only mock).
