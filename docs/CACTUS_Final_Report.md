# Final Project Report: CACTUS (Campus Companion Hub)

## 1. Project Definition and Investigation

### 1.1 Problem Definition
The University of the West Indies (UWI) Mona campus presents significant logistical and safety challenges for its student body. The expansive physical layout, combined with fluctuating safety conditions—particularly during evening hours—creates an environment where students frequently feel vulnerable navigating between faculties. Furthermore, academic scheduling is highly dynamic; class cancellations, room changes, and lecturer lateness are common occurrences. Currently, the communication of these changes relies heavily on fragmented, informal channels such as WhatsApp groups or delayed email announcements. This disjointed approach leads to wasted time, increased anxiety, and a general lack of cohesive campus awareness. There is a critical need for a centralized, real-time platform that integrates navigational assistance, safety features, and academic coordination into a single accessible hub.

### 1.2 Investigation and Rationale
Initial investigations into the campus ecosystem revealed that students attempt to mitigate these issues through ad-hoc solutions. They form temporary walking groups via messaging apps when traversing poorly lit areas and rely on word-of-mouth for class updates. However, these methods are unreliable and exclude students who are not part of specific social circles. 

The rationale for developing the Campus Companion Hub (CACTUS) is to formalize and digitize these organic coping mechanisms. By leveraging modern web technologies, geolocation, and crowdsourcing, CACTUS aims to provide a structured, equitable, and real-time solution. The system is designed to act as a definitive source of truth for campus navigation and dynamic course status, ultimately fostering a safer and more connected university community.

---

## 2. Software Requirements Specification (SRS)

### 2.1 Product Context and Functionality
CACTUS is a mobile-responsive web application designed to serve as the central hub for student life at UWI Mona. The core functionalities include:
*   **Interactive Campus Navigation:** Real-time routing using Dijkstra's algorithm, featuring specific profiles like Shortest, Safe Night, Scenic, and Accessible.
*   **Walking Partner System (Walk Groups):** A peer-to-peer system allowing students to create or join groups for safe campus traversal.
*   **Crowdsourced Hazard Reporting:** A map-based reporting tool where users can flag hazards (e.g., broken lights, flooding) that dynamically alter route calculations.
*   **Course Coordination & Reporting:** A verification-based reporting system for class changes, allowing students to upvote/downvote reports to confirm academic schedule adjustments.
*   **Trust Score System:** A Bayesian scoring mechanism that evaluates user reliability based on the accuracy of their reports and their behavior in Walk Groups.

### 2.2 Stakeholders and User Characteristics
*   **Students (Primary Users):** Require immediate access to routing, safety tools, and class updates. They interact with the system primarily via mobile devices.
*   **Class Representatives:** Possess elevated verification weight in the course reporting system, allowing them to rapidly confirm or deny class changes.
*   **Lecturers/Faculty:** Can issue official announcements that bypass the crowdsourced verification threshold.
*   **Campus Administration:** Secondary beneficiaries who can utilize aggregated hazard data for maintenance and security planning.

### 2.3 Specific Functional Requirements
*   **Req 1 - Route Planning:** The system shall calculate optimal paths between campus nodes within 500ms, factoring in active hazard reports to adjust route costs dynamically.
*   **Req 2 - Hazard Reporting:** Users shall be able to submit geo-tagged hazard reports. These reports must propagate to all active clients in real-time via Server-Sent Events (SSE).
*   **Req 3 - Walk Groups:** The system shall facilitate the creation of Walk Groups, tracking member counts and group status (active, started, ended).
*   **Req 4 - Course Reporting:** Enrolled students shall be able to submit class status reports (e.g., "Lecturer Late"). The system must transition these reports to a "verified" state once a dynamically calculated confirmation threshold (based on class size) is met.
*   **Req 5 - Trust Evaluation:** The system shall maintain a Trust Score for each user. Scores must increase upon successful report verification and decrease upon report denial or negative Walk Group feedback.

### 2.4 Non-Functional Requirements
*   **Performance:** The initial map interface must render within 3 seconds on a standard 4G connection.
*   **Security:** All API endpoints must be secured using JWT-based authentication. User passwords must be hashed using `bcryptjs`.
*   **Reliability:** The system must implement a Time-To-Live (TTL) mechanism for hazard reports to ensure the map reflects only current conditions.

---

## 3. Software Design Specification (SDS)

### 3.1 Architectural Overview
CACTUS employs a modern **Client-Server Layered Architecture**, chosen for its scalability and clear separation of concerns. The architecture is divided into three primary layers:

1.  **Presentation Layer (Client):** Built with React 19, Tailwind CSS, and Mapbox GL JS. This layer is responsible for rendering the interactive map, dashboards, and handling user input. It communicates with the backend via tRPC.
2.  **Business Logic Layer (Server):** Hosted on a Node.js environment utilizing Express. This layer processes routing algorithms (Dijkstra's), manages the Bayesian trust score calculations, and handles the Server-Sent Events (SSE) for real-time updates.
3.  **Data Access Layer (Database):** Utilizes PostgreSQL hosted on Supabase, interfaced via Drizzle ORM. This layer manages data persistence for users, courses, reports, and spatial data.

### 3.2 Component Decomposition

#### 3.2.1 Presentation Layer Components
*   **`CactusMap`:** The core interactive map component utilizing Mapbox. It handles the rendering of campus nodes, hazard markers, and calculated route paths.
*   **`ActionPanels`:** A unified interface for users to submit hazard reports, create class claims, and initiate check-ins.
*   **`NavigationPanel`:** A Waze-style overlay that guides users through their selected routes, providing step-by-step navigational context.

#### 3.2.2 Business Logic Layer Components
*   **`algorithms.ts` (Routing & Trust):** Contains the implementation of Dijkstra's algorithm for pathfinding across the `campus_adjacency_list`. It also houses the Bayesian logic for calculating user Trust Scores based on report outcomes.
*   **`routers.ts` (API Controllers):** Defines the tRPC procedures (queries and mutations) for authentication, course management, hazard reporting, and walking groups.
*   **`realtime.ts` (SSE Manager):** Manages the Server-Sent Events connections, pushing real-time updates (e.g., new hazards, walk group status changes) to connected clients.

#### 3.2.3 Data Access Layer Components
*   **`db.ts` (Database Interface):** Centralizes all Drizzle ORM queries and mutations. It abstracts the raw SQL interactions for tables such as `cactus_class_reports`, `users`, and `course_sessions`.
*   **Supabase Integration (`supabaseHazards.ts`, `supabaseWalkGroups.ts`):** Specialized helpers that interact directly with specific Supabase tables designed for real-time spatial data.

### 3.3 Design Justification
The layered approach allows for independent scaling of the frontend and backend. Utilizing tRPC ensures end-to-end type safety between the React client and the Node.js server, drastically reducing runtime errors related to data fetching. The hybrid database approach—using Drizzle ORM for relational data (users, courses) and direct Supabase clients for spatial/real-time data (hazards, walk groups)—optimizes performance and leverages the strengths of both tools.

---

## 4. Testing Strategy

### 4.1 Testing Objectives
The testing strategy for CACTUS ensures that the core navigational, reporting, and coordination features function reliably under expected user loads. Given the real-time nature of the application, verifying the accuracy of the routing algorithm and the state transitions of the reporting system are paramount.

### 4.2 Testing Levels
*   **Unit Testing:** Focuses on isolated business logic. Specifically, the `algorithms.ts` file is tested to ensure Dijkstra's algorithm correctly calculates the shortest path and that the Bayesian trust score formula accurately adjusts scores based on input variables.
*   **Integration Testing:** Verifies the communication between the tRPC routers and the database (`db.ts`). This ensures that mutations (e.g., creating a report) correctly update the PostgreSQL database and that queries retrieve the expected data shapes.
*   **End-to-End (E2E) Testing:** Simulates complete user workflows. A comprehensive Python-based E2E test suite (`e2e.test.py`) was developed to validate the entire API surface. This suite tests authentication flows, the creation and verification of class reports, hazard submission, and walk group lifecycle management.

### 4.3 Automated E2E Test Coverage
The E2E suite consists of 26 rigorous tests covering the following domains:
1.  **Authentication:** Signup, login, and session management.
2.  **Course Management:** Retrieving enrolled courses and fetching the daily timetable.
3.  **Class Reporting:** Submitting a class claim, processing upvotes/downvotes, and verifying the status transition based on the threshold.
4.  **Hazard Reporting:** Submitting hazard reports and retrieving active hazards within a bounding box.
5.  **Walking Groups:** Updating availability, requesting walkers, and submitting post-walk trust ratings.

---

## 5. Description of Solution and Implementation

### 5.1 Implementation Overview
The CACTUS solution was implemented as a full-stack TypeScript application. The development process emphasized mobile responsiveness and real-time data synchronization. The application is deployed live, with the frontend hosted on Vercel and the backend Node.js server hosted on Render, communicating with a Supabase PostgreSQL instance.

### 5.2 Key Functionality Implementations

#### 5.2.1 Pathfinding and Navigation
The campus was modeled as a graph, defined in `campus_adjacency_list_only.json`. Each node represents a physical location (e.g., an intersection or building entrance), and edges represent walkable paths with associated weights (distance, elevation, lighting quality). The `planCampusRouteBetweenNodes` function in `findWayGeo.ts` implements Dijkstra's algorithm. When a user requests a "Safe Night" route, the algorithm dynamically increases the weight of edges that lack sufficient lighting or have active hazard reports nearby, forcing the pathfinder to select safer, albeit potentially longer, routes.

#### 5.2.2 Crowdsourced Verification and Trust
To prevent abuse of the reporting system, a dynamic verification threshold was implemented. When a student reports a class cancellation, the report enters a "pending" state. The `getRequiredThresholdForReport` function calculates the necessary number of upvotes based on the total class size. Votes from Class Representatives carry a higher weight (`getVoteWeightForUser`). Once the threshold is met, the report status transitions to "verified," and the system triggers the `applyTrustScoreChange` function. This function uses a Bayesian approach to increase the Trust Score of the original reporter and the upvoters, while penalizing those who downvoted the verified accurate report.

#### 5.2.3 Real-Time Synchronization
To ensure users are immediately aware of new hazards or walk groups, the backend implements Server-Sent Events (SSE) in `realtime.ts`. When a mutation occurs (e.g., `createReportMutation`), the server emits an event to all connected clients. The React frontend listens to these events and invalidates the relevant tRPC queries, prompting an immediate UI refresh without requiring the user to manually reload the page.

---

## 6. Results and Analysis

### 6.1 System Performance and Reliability
The deployed CACTUS application successfully meets its core objectives. The integration of Mapbox GL JS with the custom campus graph data provides a highly responsive navigational experience. During testing, the pathfinding algorithm consistently returned optimal routes in under 200ms, well within the 500ms non-functional requirement. 

The comprehensive E2E test suite (`e2e.test.py`) confirms the reliability of the backend API. All 26 E2E tests currently pass (100% success rate), validating the integrity of the authentication flow, the complex logic of the course reporting threshold system, and the walk group state management.

### 6.2 Analysis of the Trust and Verification System
The implementation of the Bayesian Trust Score and the weighted voting system proved highly effective in simulated environments. By assigning higher voting weights to Class Representatives, the system can rapidly verify legitimate class changes without requiring the entire class to participate. The Trust Score system acts as a strong deterrent against malicious reporting; simulated users who submitted false reports quickly dropped into the "Watchlist" or "Flagged" tiers, subsequently reducing their future voting power. This self-regulating mechanism is crucial for maintaining the integrity of crowdsourced data on a large campus.

### 6.3 Challenges and Resolutions
A significant challenge during implementation was reconciling the Drizzle ORM schema with the existing Supabase database structure, particularly regarding the `class_reports` and `course_session_overrides` tables. The original database utilized UUIDs and snake_case naming conventions, which conflicted with the application's integer-based, camelCase schema. 

**Resolution:** To ensure system stability without disrupting existing Supabase configurations, new tables (`cactus_class_reports`, `cactus_class_report_votes`, `cactus_session_overrides`) were created. The Drizzle schema was updated to map to these new tables, allowing the application to function flawlessly while maintaining a clean separation from legacy database structures.

### 6.4 Conclusion
CACTUS successfully demonstrates how integrated web technologies can solve localized logistical challenges. By combining algorithmic routing with crowdsourced intelligence and a robust trust framework, the system provides a comprehensive companion tool for the UWI Mona student body. The application is fully deployed, thoroughly tested, and ready to significantly enhance campus safety and academic coordination.
