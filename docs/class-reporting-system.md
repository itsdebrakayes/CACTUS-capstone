# CACTUS Class Reporting System

## Overview

The Class Reporting System allows enrolled students, class representatives, year representatives, lecturers, and guild administrators to submit, verify, and act on real-time reports about class sessions. Verified reports automatically update the in-app timetable (calendar overrides), notify all enrolled students, and adjust the reporter's trust score.

---

## Database Schema

### New Tables

| Table | Purpose |
|---|---|
| `course_sessions` | Recurring weekly schedule slots for each course |
| `course_session_overrides` | One-off calendar changes created when a report is verified |
| `class_reports` | Student-submitted reports about a class session |
| `class_report_votes` | Weighted votes cast by course members on a pending report |
| `trust_score_events` | Audit log of every trust score change per user |
| `class_report_comments` | Discussion comments attached to a class report (class chat) |
| `push_subscriptions` | PWA Web Push subscription endpoints per user |
| `user_notifications` | In-app notification records created on report verification |

### Modified Tables

| Table | New Columns |
|---|---|
| `users` | `trustScore INT DEFAULT 50`, `suspensionStatus ENUM('none','active') DEFAULT 'none'`, `suspendedUntil TIMESTAMP NULL` |

---

## Report Types

| `reportType` | Description |
|---|---|
| `class_cancelled` | Class will not run today |
| `lecturer_late` | Lecturer has not arrived; class may start late |
| `room_changed` | Class has moved to a different room |
| `time_changed` | Class start or end time has changed |
| `class_confirmed` | Class is confirmed to be running as scheduled |
| `other` | General update |

---

## Role-Based Vote Weights

Each vote is weighted by the voter's role. Higher-weight votes move the verification score faster.

| Role | Vote Weight |
|---|---|
| Student | 1 |
| Class Representative (course membership) | 2 |
| Year Representative (global role) | 2 |
| Guild Administrator (global role) | 3 |
| Lecturer (global role or course membership) | 5 |

---

## Verification Thresholds

When a report is submitted, the system calculates two thresholds:

- **Required threshold** — the minimum weighted score needed to verify the report.
- **Rejection threshold** — the maximum (most negative) weighted score before the report is rejected.

### Formula

```
alpha = 0.1  (class rep)  or  0.3  (student)
roleMultiplier = 0.5  (class rep)  or  1.0  (student)
beta = 0.5
normalisedTrust = trustScore / 100

required = ceil(alpha × classSize × roleMultiplier × (1 − beta × normalisedTrust))
required = max(1, required)

rejection = −max(2, ceil(0.25 × classSize))
```

### Special Cases

- **Lecturer** or **Guild Admin** reporters receive `required = 0`, meaning their reports are instantly verified.
- All thresholds are stored on the report at creation time and do not change as votes arrive.

---

## Report Lifecycle

```
PENDING → VERIFIED  (verificationScore ≥ requiredThreshold)
PENDING → REJECTED  (verificationScore ≤ rejectionThreshold)
PENDING → EXPIRED   (background job, expiresAt has passed)
```

Reports expire after **24 hours** if neither threshold is reached.

---

## Trust Score System

Trust scores are integers in the range **[0, 100]**, starting at **50** for every new user.

### Score Changes

| Event | Reporter | Correct Voter | Incorrect Voter |
|---|---|---|---|
| Report verified | +2 | +1 | −1 |
| Report rejected | −5 | +1 | −1 |
| Report expired | −2 | — | — |

A "correct voter" is one whose vote matched the final outcome (upvote on a verified report, or downvote on a rejected report).

### Effect on Thresholds

A higher trust score reduces the number of confirmations required for future reports, as the `normalisedTrust` term in the threshold formula increases.

---

## Suspension System

If a user accumulates **3 or more rejected reports within a 7-day window**, they are suspended from submitting new class reports for **24 hours**. Suspended users receive a `FORBIDDEN` error when attempting to submit a report.

The background job `clearExpiredSuspensions` (runs every 30 minutes) automatically lifts suspensions once `suspendedUntil` has passed.

---

## Calendar Override Logic

When a report is verified and the report is linked to a `courseSessionId`, the system creates a `course_session_overrides` record for the `reportDate`. The override stores the original and new room/time values and a boolean `isCancelled` flag.

The `timetable.getMyTimetable` endpoint returns each session with its active override for today, allowing the frontend to display the current state of each class.

---

## Notifications

When a report is verified:

1. An `user_notifications` record is created for **every enrolled student** in the course.
2. The notification includes a human-readable title and message derived from the report type.
3. Clients can poll `push.getNotifications` or subscribe to the SSE realtime stream for live updates.

### Push Notifications (PWA)

Students can register a Web Push subscription via `push.subscribe`. The subscription endpoint, `p256dhKey`, and `authKey` are stored in `push_subscriptions`. The server can use these to send Web Push messages when reports are verified (requires a VAPID key pair configured in environment variables).

---

## Class Chat

Each class report has an associated comment thread accessible via the `classChat` router. All enrolled students can read and post comments. Comments are ordered chronologically and support deletion by the original author.

---

## API Reference (tRPC)

### `timetable`

| Procedure | Type | Description |
|---|---|---|
| `getMyTimetable` | query | Returns all enrolled sessions with today's overrides |
| `getCourseSessions` | query | Returns sessions for a specific course |
| `createCourseSession` | mutation | Creates a session (class rep / lecturer / admin) |

### `classReports`

| Procedure | Type | Description |
|---|---|---|
| `submitReport` | mutation | Submit a new class report |
| `getReportsByCourse` | query | Get pending (or all) reports for a course |
| `getReport` | query | Get a single report with votes |
| `voteOnReport` | mutation | Cast or update a vote on a pending report |
| `getMyTrustScore` | query | Get own trust score and history |
| `getMySuspensionStatus` | query | Get own suspension status |

### `classChat`

| Procedure | Type | Description |
|---|---|---|
| `getCourseChat` | query | Get all reports + comments for a course |
| `addComment` | mutation | Add a comment to a report |
| `getComments` | query | Get comments for a report |
| `deleteComment` | mutation | Delete own comment |

### `push`

| Procedure | Type | Description |
|---|---|---|
| `subscribe` | mutation | Register a Web Push subscription |
| `unsubscribe` | mutation | Remove a Web Push subscription |
| `getNotifications` | query | Get in-app notifications |
| `markRead` | mutation | Mark a notification as read |

---

## Background Jobs

| Job | Schedule | Description |
|---|---|---|
| `handleClassReportExpiry` | Every 10 minutes | Expires pending reports past their `expiresAt` and applies −2 trust penalty |
| `clearExpiredSuspensions` | Every 30 minutes | Lifts suspensions whose `suspendedUntil` has passed |
| `cleanupExpiredWalkingRequests` | Every 15 minutes | Marks open walking requests as expired |
| `cleanupExpiredClaims` | On demand | Expires legacy `class_claims` records |

---

## Security

- All class report and chat endpoints require authentication (`protectedProcedure`).
- Membership in the course is verified before any read or write operation.
- Suspended users cannot submit new reports.
- Only the original comment author can delete their own comment.
- Official announcements (via the existing `courses.postAnnouncement` route) still require class rep or admin role.

---

## Migration

The schema changes are captured in `drizzle/0008_cactus_reporting_system.sql`. Run `pnpm db:push` to apply the migration to the database.
