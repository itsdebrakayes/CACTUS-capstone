# Software Testing Specification Document
**Project:** CACTUS (Campus Assistant for Class Tracking, Updates, and Safety)  
**Author:** Manus AI  
**Date:** May 11, 2026  

---

## 1. Introduction

### 1.1 Purpose
This document outlines the software testing specification for the CACTUS system. It details the testing strategy, environment, categories, and the specific test cases executed across the application. The goal is to verify that all core algorithms, API endpoints, and integration points function correctly, securely, and reliably under various conditions.

### 1.2 Scope
The test suite covers the backend logic, mathematical algorithms, role-based verification rules, and all tRPC routers. It includes 375 distinct test cases executed via the Vitest framework. Frontend UI components and Mapbox visual rendering are excluded from this specific automated suite, though Mapbox integration endpoints are tested.

---

## 2. Test Environment

* **Testing Framework:** Vitest
* **Runtime:** Node.js (via pnpm)
* **Database Mocking:** In-memory SQLite / Context stubbing
* **Authentication Mocking:** Context overriding via `TrpcContext`
* **Execution Command:** `pnpm test`

---

## 3. Test Categories and Specifications

The test suite is divided into three primary categories: Algorithm Unit Tests, Router Integration Tests, and Edge Case / Stress Tests.

### 3.1 Algorithm Unit Tests

These tests validate the mathematical and logical correctness of the system's core utilities.

#### 3.1.1 Geohash Utilities
**Objective:** Verify that geographic coordinates are correctly encoded, decoded, and queried.

| Test Case | Input | Expected Result | Pass/Fail Criteria |
|---|---|---|---|
| Precision Encoding | `18.0035, -76.7497, 7` | `7-character string` | Length must exactly equal 7. |
| Prefix Matching | `18.0035, -76.7497` and `18.0036, -76.7498` | Identical 5-char prefix | The first 5 characters must match for close coordinates. |
| Ring Generation | `18.0035, -76.7497, 6` | Center + Ring 1 + Ring 2 arrays | Must return 8 neighbors for Ring 1 and 16 for Ring 2. |
| Boundary Handling | `0, 0` or `90, 180` | Valid hash string | Must not throw exceptions at the equator or poles. |

#### 3.1.2 Haversine Distance Formula
**Objective:** Ensure accurate distance calculations between geographic points.

| Test Case | Input | Expected Result | Pass/Fail Criteria |
|---|---|---|---|
| Identical Coordinates | `18.0, -76.75` to `18.0, -76.75` | `0` | Distance must be exactly 0. |
| Known Distance Shift | `0.01° latitude shift` | `~1110m` | Result must be between 900m and 1300m. |
| Symmetry | `A to B` vs `B to A` | Identical values | `haversine(A,B) == haversine(B,A)` within 0.001 precision. |

#### 3.1.3 Dijkstra's Pathfinding
**Objective:** Validate multi-criteria routing across the campus graph.

| Test Case | Input | Expected Result | Pass/Fail Criteria |
|---|---|---|---|
| Shortest Path | `mode: "shortest", nodes: A-B-C` | `[A, B, C]` | Must select the path with the lowest total distance. |
| Safe Night Mode | `mode: "safe_night", blocked edge` | `[A, C]` | Must bypass edges where `confirmedViolenceCount >= 3`. |
| Accessible Mode | `mode: "accessible", steps edge` | `[A, C]` | Must bypass edges where `hasSteps === true` or slope > 8%. |
| Unreachable Node | `Isolated node` | `null` | Must return null gracefully when no path exists. |

#### 3.1.4 Trust Score Calculation (Bayesian)
**Objective:** Verify that user trust scores calculate correctly based on rating history.

| Test Case | Input | Expected Result | Pass/Fail Criteria |
|---|---|---|---|
| Default Initialization | Empty array | `~0.7 (70/100)` | Score must reflect the Bayesian prior mean. |
| Perfect History | 50 recent 5-star ratings | `> 0.95` | Score must approach 1.0. |
| Terrible History | 50 recent 1-star ratings | `< 0.30` | Score must drop significantly. |
| Time Decay | 1 recent 5-star vs 1 old 5-star | `recent > old` | Recent ratings must carry higher mathematical weight. |
| Safety Penalty | 1 rating, 2 flags | `~30% reduction` | Each flag must reduce the calculated score by 15%. |

#### 3.1.5 Class Reporting Verification Logic
**Objective:** Validate the rules engine for verifying crowdsourced class updates.

| Test Case | Input | Expected Result | Pass/Fail Criteria |
|---|---|---|---|
| Vote Weighting | Student, Class Rep, Lecturer | `1, 2, 5` | Roles must return correct integer weights. |
| Rejection Threshold | Class size: 100 | `25` | Threshold must equal 25% of class size, capped appropriately. |
| Status Determination | 10 confirms, 2 denies, req: 8 | `"verified"` | Must return "verified" when confirms meet threshold. |
| Suspension Trigger | 3 rejected reports in 7 days | Suspension applied | User must be suspended for 24 hours. |

---

### 3.2 Router Integration Tests

These tests validate the API endpoints, ensuring correct input parsing, authorization, and database interactions.

#### 3.2.1 Auth & Local Auth Routers
**Objective:** Verify session management and authentication.

| Test Case | Input | Expected Result | Pass/Fail Criteria |
|---|---|---|---|
| Authenticated `me` | Valid session cookie | User Object | Must return the full user profile. |
| Unauthenticated `me` | No session cookie | `null` | Must return null without throwing an error. |
| Logout | Valid session | Success | Must execute `res.clearCookie()` and return success. |

#### 3.2.2 Walking Partner Router
**Objective:** Verify the matching and availability system.

| Test Case | Input | Expected Result | Pass/Fail Criteria |
|---|---|---|---|
| Update Availability | `lat, lng, radius` | Success | Must update the database and return success. |
| Request Walkers | `radius: 50m` | Validation Error | Must reject radius below 100m. |
| Get Trust Score | Valid User ID | `50` | Must return the user's current trust score. |

#### 3.2.3 Class Reports Router
**Objective:** Verify the submission and voting flow for class updates.

| Test Case | Input | Expected Result | Pass/Fail Criteria |
|---|---|---|---|
| Submit Report | `type: "cancelled", valid session` | Report Object | Must create the report and link to the course session. |
| Vote on Report | `claimId, vote: "confirm"` | Success | Must record the vote and recalculate the verification score. |
| Prevent Self-Voting | `claimId` (own report) | Error | Must throw an authorization error. |

#### 3.2.4 Class Chat Router
**Objective:** Verify discussion thread functionality.

| Test Case | Input | Expected Result | Pass/Fail Criteria |
|---|---|---|---|
| Add Comment | `message: ""` | Validation Error | Must reject empty strings. |
| Get Course Chat | `courseId` (not enrolled) | Error | Must reject if user is not a member of the course. |

#### 3.2.5 Push Notifications Router
**Objective:** Verify Web Push subscription management.

| Test Case | Input | Expected Result | Pass/Fail Criteria |
|---|---|---|---|
| Subscribe | `p256dhKey: "", authKey: ""` | Validation Error | Must reject empty cryptographic keys. |
| Unsubscribe | Valid session | Success | Must delete the subscription record. |

---

### 3.3 Edge Cases & Stress Tests

**Objective:** Ensure system resilience under unusual or extreme conditions.

| Test Case | Scenario | Expected Result | Pass/Fail Criteria |
|---|---|---|---|
| Extreme Class Sizes | Class size = 3 | Threshold = 1 | Must enforce minimum thresholds regardless of percentages. |
| Extreme Class Sizes | Class size = 2000 | Threshold = 50 | Must enforce maximum caps on required votes. |
| Trust Score Clamping | Calculated score = 1.5 | `1.0` | Must strictly clamp trust scores between 0.0 and 1.0. |
| Trust Score Clamping | Calculated score = -0.5 | `0.0` | Must strictly clamp trust scores between 0.0 and 1.0. |
| Malicious Input | SQL Injection in chat | Sanitized/Rejected | Drizzle ORM and Zod must prevent injection execution. |

---

## 4. Execution and Reporting

The test suite is executed via the command line using `pnpm test`. The CI/CD pipeline is configured to run these tests on every pull request to the `main` branch. 

* **Total Tests:** 375
* **Current Passing Rate:** 100% (375/375)
* **Coverage:** Algorithms, Pathfinding, tRPC Routers, Verification Logic.

*(Note: Mapbox integration tests are configured to skip gracefully if the `VITE_MAPBOX_TOKEN` environment variable is not present, preventing false negatives in CI environments.)*
