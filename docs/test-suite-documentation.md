# CACTUS Test Suite Documentation

## Overview

The CACTUS testing strategy employs an exhaustive, multi-layered approach to ensure the reliability, security, and accuracy of all core systems. The test suite comprises 375 tests covering unit tests for core algorithms, integration tests for API routers, and end-to-end scenario validations.

All tests are executed using Vitest, with mock database contexts ensuring isolation and rapid execution.

---

## Test Categories

### 1. Algorithm Unit Tests
Core mathematical and logical algorithms are tested for edge cases, precision, and boundary conditions.

* **Haversine Distance Formula**
  * Validates distance calculation between identical coordinates (expected: 0m).
  * Validates known distances (e.g., UWI Library to UWI Mona Bowl).
  * Tests extreme coordinate pairs (equator, poles).

* **Geohash Implementation**
  * Validates encoding precision at different string lengths (5-char vs 9-char).
  * Validates decoding back to latitude/longitude bounds.
  * Tests adjacent geohash generation (N, S, E, W) for spatial queries.

* **Dijkstra's Pathfinding**
  * Validates shortest path calculation on the campus node graph.
  * Tests multi-criteria routing (`shortest`, `safe_night`, `accessible`, `scenic`).
  * Validates edge cost penalties (e.g., `safe_night` heavily penalizing unlit paths).
  * Validates unreachable node handling (expected: `null`).

* **Trust Score Bayesian Calculation**
  * Validates default score initialization (50).
  * Tests score delta calculation for positive (+4, +2) and negative (-2, -5) walking ratings.
  * Validates trust score clamping (strictly bounds between 0 and 100).
  * Validates Bayesian prior impact (e.g., 5 perfect ratings yield ~80/100, requiring sustained history to reach 100).

* **Class Reporting Verification Logic**
  * Validates role-based voting weights (Student=1, Class Rep=2, Lecturer=5).
  * Validates threshold calculation based on class size (e.g., 10% of class size, capped at minimums).
  * Validates automatic verification for Lecturer/Admin submissions.
  * Validates suspension threshold logic (3 rejected reports in 7 days triggers suspension).

### 2. Router Integration Tests
API endpoints (tRPC routers) are tested for input validation, authorization, and business logic execution.

* **Auth Router**
  * Validates `me` returns correct user data for authenticated contexts.
  * Validates `me` returns null for unauthenticated contexts.
  * Validates `logout` successfully clears session cookies.

* **Walking Partner Router**
  * Validates `updateAvailability` requires authentication.
  * Validates `requestWalkers` enforces minimum radius (100m).
  * Validates `getTrustScore` gracefully handles database unavailability.

* **Classes & Courses Routers**
  * Validates `createClaim` enforces valid claim types (`cancelled`, `room_change`, etc.).
  * Validates `voteClaim` prevents self-voting.
  * Validates `getMyCourses` returns mapped course data.

* **Class Reports Router**
  * Validates `submitReport` enforces valid report types and session linkages.
  * Validates `voteOnReport` properly recalculates verification status upon voting.
  * Validates `getMySuspensionStatus` returns correct boolean states.

* **Class Chat Router**
  * Validates `addComment` enforces message length limits (min 1, max 500).
  * Validates `getCourseChat` requires course membership.

* **Push Notifications Router**
  * Validates `subscribe` enforces non-empty `p256dhKey` and `authKey` strings.
  * Validates `unsubscribe` successfully removes endpoints.

### 3. Edge Cases & Stress Tests
Specific scenarios designed to test system resilience.

* **Concurrent Voting Simulation**
  * Simulates rapid sequential voting on a single report to ensure threshold logic resolves exactly once.
* **Extreme Class Sizes**
  * Tests verification threshold calculations for massive classes (1000+ students) and tiny classes (3 students).
* **Malicious Input Handling**
  * Tests SQL injection strings in chat comments (caught by Zod/Drizzle).
  * Tests negative numbers for radius and pagination limits (caught by Zod).

---

## Execution

The test suite is fully integrated into the CI/CD pipeline.

```bash
# Run all tests
pnpm test

# Run exhaustive test suite only
pnpm test server/exhaustive.test.ts
```

*Note: The Mapbox integration tests (`server/mapbox.test.ts` and `server/cactus.integration.test.ts`) are configured to skip gracefully in environments where `VITE_MAPBOX_TOKEN` is not set, ensuring CI pipelines do not fail due to missing external API keys.*
