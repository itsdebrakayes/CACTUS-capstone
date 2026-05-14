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
CACTUS is a mobile-responsive web application designed to serve as the central hub for student life at UWI Mona. The system provides a platform delivering core functional areas for university campus users including: Class Schedule Management & Notifications, Campus Navigation, Safety Incident Reporting, Walking Partner System (Walking Groups), and a Trust Score System.

### 2.2 Stakeholders and User Characteristics
*   **Students (Primary Users):** Require immediate access to routing, safety tools, and class updates. They interact with the system primarily via mobile devices.
*   **Class Representatives:** Possess elevated verification weight in the course reporting system, allowing them to rapidly confirm or deny class changes.
*   **Lecturers/Faculty:** Can issue official announcements that bypass the crowdsourced verification threshold.
*   **Campus Administration:** Secondary beneficiaries who can utilize aggregated hazard data for maintenance and security planning.

### 2.3 Operating Environment
The CACTUS system operates in a modern, mobile-first web environment.
*   **Client Devices:** Users access the system via smartphones running iOS 14+ or Android 10+, as well as modern desktop web browsers (Chrome, Safari, Firefox, Edge).
*   **Server Environment:** The backend is hosted on Render, running Node.js with Express and tRPC.
*   **Database:** Data is persisted using PostgreSQL hosted on Supabase.
*   **Network:** The system assumes standard 4G/LTE mobile internet connectivity across the majority of the campus.

### 2.4 Assumptions and Constraints
**Assumptions:**
*   All users are enrolled students, registered lecturers, or verified administrators.
*   Users have access to smartphones with active GPS and location services.
*   Reliable mobile internet connectivity exists across the majority of the campus.
*   Campus map data is available in a structured digital format (e.g., GeoJSON).

**Constraints:**
*   The system must comply with applicable data protection legislation.
*   No biometric data may be collected or stored.
*   Location tracking must be opt-in and may not persist beyond an active session unless explicitly consented to.
*   The system must remain functional in low-bandwidth conditions for core safety features.

### 2.5 Data Protection and Ethical Constraints
CACTUS handles sensitive personal data including location, identity, and movement patterns. The following ethical and legal constraints govern system design:
*   **Location Privacy:** Location data is only shared with active walk group members and is never stored permanently.
*   **Anonymity:** Walking companion matching does not reveal either party's identity prior to mutual acceptance.
*   **Data Minimization:** The system does not collect or store any personal data beyond what is required for the requested feature.

### 2.6 External Interface Requirements

#### 2.6.1 Hardware Interfaces
The system does not require specialized hardware. It relies on:
*   **Mobile Devices:** Touchscreen interfaces for input and GPS sensors for location tracking.
*   **Desktop Computers:** Standard keyboard and mouse inputs.

#### 2.6.2 Software Interfaces
*   **Frontend Framework:** React 19, Tailwind CSS, Mapbox GL JS.
*   **Backend Framework:** Node.js, Express, tRPC.
*   **Database:** PostgreSQL (Supabase) accessed via Drizzle ORM.

#### 2.6.3 Communications Interfaces
*   **Protocols:** HTTP/HTTPS for standard API requests.
*   **Real-time:** Server-Sent Events (SSE) for pushing real-time hazard and walk group updates.
*   **Email:** SMTP (via Nodemailer) for delivering verification codes.

### 2.7 Functional Requirements

#### 2.7.1 Class Schedules & Updates
| ID | Requirement | Description | Priority |
|---|---|---|---|
| FR-CS-01 | Schedule Viewing | Students shall be able to view their registered class schedules. | High |
| FR-CS-02 | Change Reporting | Students shall be able to submit reports regarding class status (e.g., cancelled, room change). | High |
| FR-CS-03 | Verification Threshold | The system shall transition reports to a "verified" state once a dynamically calculated confirmation threshold is met. | High |
| FR-CS-04 | Official Announcements | Lecturers shall be able to post official announcements that bypass the crowdsourced verification threshold. | Medium |

#### 2.7.2 Navigation & Routing
| ID | Requirement | Description | Priority |
|---|---|---|---|
| FR-NAV-01 | Route Generation | The system shall generate walking routes between two campus locations using Dijkstra's algorithm. | High |
| FR-NAV-02 | Route Profiles | The system shall provide multiple route profiles: Shortest, Safe Night, Scenic, and Accessible. | Medium |
| FR-NAV-03 | Dynamic Weighting | The system shall dynamically adjust route costs based on active hazard reports. | High |

#### 2.7.3 Safety Companion Features (Walk Groups)
| ID | Requirement | Description | Priority |
|---|---|---|---|
| FR-SC-01 | Group Creation | A user shall be able to create a Walk Group specifying a meeting point, destination, and departure time. | High |
| FR-SC-02 | Group Joining | A user shall be able to view active Walk Groups on the map and join them. | High |
| FR-SC-03 | Status Tracking | The system shall track the status of the Walk Group (active, started, ended). | Medium |

#### 2.7.4 Incident Reporting
| ID | Requirement | Description | Priority |
|---|---|---|---|
| FR-IR-01 | Hazard Submission | Any user shall be able to report a campus safety hazard or infrastructure issue on the map. | High |
| FR-IR-02 | Hazard Categorization | The system shall categorize hazards by type and severity. | Medium |
| FR-IR-03 | Time-To-Live | The system shall implement a TTL mechanism for hazards, expiring them if not re-confirmed. | High |

#### 2.7.5 Trust System
| ID | Requirement | Description | Priority |
|---|---|---|---|
| FR-TS-01 | Trust Score Assignment | The system shall assign a Trust Score to every user, starting at a default value. | High |
| FR-TS-02 | Score Adjustment | The system shall increase the score for verified accurate reports and decrease it for denied reports. | High |

### 2.8 Non-Functional Requirements

#### 2.8.1 Privacy
| ID | Requirement | Description | Priority |
|---|---|---|---|
| NFR-PV-01 | Location Opt-In | Location access shall only be activated upon explicit user consent. | High |
| NFR-PV-02 | Anonymous Matching | Walking companion matching shall not reveal identity prior to acceptance. | High |

#### 2.8.2 Security
| ID | Requirement | Description | Priority |
|---|---|---|---|
| NFR-SE-01 | Authentication | All users must authenticate via JWT-based sessions. | High |
| NFR-SE-02 | Password Hashing | User passwords must be securely hashed using bcryptjs. | High |

#### 2.8.3 Performance
| ID | Requirement | Description | Priority |
|---|---|---|---|
| NFR-PE-01 | Route Load Time | Route generation shall complete within 500ms. | High |
| NFR-PE-02 | Initial Render | The initial map interface must render within 3 seconds on a standard 4G connection. | Medium |
| NFR-PE-03 | Real-time Latency | Real-time events (hazards, walk groups) must propagate to connected clients within 1 second. | High |

---

### 2.9 Behaviour Requirements

#### 2.9.1 Use Case View
The system's behavior is driven by specific user interactions (use cases) across different stakeholder roles. The primary use cases include:
*   **Plan Route:** A student selects a destination and profile (e.g., Safe Night), and the system generates a hazard-aware route.
*   **Report Hazard:** A student or staff member drops a pin on the map to report an infrastructure issue or safety concern, which is immediately broadcasted to all active users.
*   **Create/Join Walk Group:** A student initiates a walk group request, and nearby anonymous peers can join. Identities remain hidden until mutual acceptance.
*   **Submit Class Change:** A lecturer or student reports a class cancellation. The system processes the report through the verification pipeline based on the reporter's role.
*   **Verify Report:** Class representatives and students upvote or downvote pending reports to meet the required confirmation threshold.

---

## 3. Other Non-Functional Requirements

### 3.1 Performance Requirements
*   **API Latency:** All tRPC API endpoints shall respond within 500ms for 95% of requests under normal load.
*   **SSE Propagation:** Server-Sent Events must deliver hazard and walk group updates to connected clients within 1 second of database confirmation.

### 3.2 Safety and Security Requirements
*   **Data Encryption:** All data in transit must be encrypted using TLS 1.3.
*   **Session Management:** User sessions must expire after 24 hours, requiring re-authentication via JWT.
*   **Role Enforcement:** The system must strictly enforce role-based access controls (RBAC) to ensure students cannot bypass verification thresholds reserved for lecturers or administrators.

### 3.3 Software Quality Attributes
*   **Usability:** The mobile interface must be navigable with one hand, utilizing large touch targets and high-contrast color coding for safety alerts.
*   **Maintainability:** The codebase must adhere to strict modularity, separating Drizzle database schemas, tRPC routers, and React UI components.

---

## 4. Other Requirements

### 4.1 Business Rules
*   **BR-01 (Trust Threshold):** A user whose Trust Score falls below 20 (Flagged status) is automatically suspended from submitting new hazard or class reports for 7 days.
*   **BR-02 (Verification Override):** A class change report submitted by a verified Lecturer immediately transitions to "verified" status, bypassing the student crowdsourced threshold.
*   **BR-03 (Walk Group Anonymity):** The system must never reveal the exact GPS coordinates of a Walk Group to users who are not actively joined and confirmed in that specific group.

---

## 5. Software Design Specification (SDS)

### 5.1 Architectural Overview
CACTUS employs a modern **Client-Server Layered Architecture**, chosen for its scalability and clear separation of concerns. The architecture is divided into three primary layers:
1.  **Presentation Layer (Client):** Built with React 19, Tailwind CSS, and Mapbox GL JS.
2.  **Business Logic Layer (Server):** Hosted on Node.js utilizing Express and tRPC.
3.  **Data Access Layer (Database):** Utilizes PostgreSQL hosted on Supabase, interfaced via Drizzle ORM.

### 5.2 Component Decomposition
#### 5.2.1 Presentation Layer Components
*   **`CactusMap`:** The core interactive map component utilizing Mapbox.
*   **`ActionPanels`:** A unified interface for users to submit hazard reports, create class claims, and initiate check-ins.

#### 5.2.2 Business Logic Layer Components
*   **`algorithms.ts`:** Contains the implementation of Dijkstra's algorithm and Bayesian trust logic.
*   **`routers.ts`:** Defines the tRPC procedures (queries and mutations).
*   **`realtime.ts`:** Manages the Server-Sent Events connections.

#### 5.2.3 Data Access Layer Components
*   **`db.ts`:** Centralizes all Drizzle ORM queries and mutations.

### 5.3 System Diagrams

#### 5.3.1 Use Case Diagram
The Use Case diagram illustrates the interactions between the primary actors (Student, Class Rep, Lecturer, Admin) and the system's core functionalities.

```mermaid
graph LR
    %% Actors
    S([👤 Student])
    CR([👤 Class Rep])
    L([👤 Lecturer])
    A([👤 Admin])

    %% Use Cases
    UC1(Plan Route)
    UC2(Report Hazard)
    UC3(Create / Join Walk Group)
    UC4(Submit Class Change)
    UC5(Verify Report)
    UC6(Manage Users)

    %% Relationships
    S --> UC1
    S --> UC2
    S --> UC3
    S --> UC4
    S --> UC5

    CR --> UC4
    CR --> UC5

    L --> UC4

    A --> UC6
    A --> UC2

    %% Styling
    style UC1 fill:#d4edda,stroke:#28a745
    style UC2 fill:#fff3cd,stroke:#ffc107
    style UC3 fill:#d1ecf1,stroke:#17a2b8
    style UC4 fill:#f8d7da,stroke:#dc3545
    style UC5 fill:#e2d9f3,stroke:#6f42c1
    style UC6 fill:#fde2e4,stroke:#e63946
```

#### 5.3.2 Component Diagram
This diagram models the interaction between the user interface and the backend components.

```mermaid
graph TD
    subgraph Client [Presentation Layer]
        UI[React UI Components]
        Map[Mapbox GL JS]
        Client_tRPC[tRPC Client]
    end

    subgraph Server [Business Logic Layer]
        Server_tRPC[tRPC Router]
        Pathfinder[algorithms.ts / Dijkstra]
        TrustEngine[Bayesian Trust System]
        SSE[realtime.ts / SSE]
    end

    subgraph Database [Data Access Layer]
        ORM[db.ts / Drizzle]
        Supa[Supabase PostgreSQL]
    end

    UI --> Client_tRPC
    Map --> UI
    Client_tRPC <-->|HTTP/HTTPS| Server_tRPC
    UI <-->|Server-Sent Events| SSE
    
    Server_tRPC --> Pathfinder
    Server_tRPC --> TrustEngine
    Server_tRPC --> ORM
    SSE --> ORM
    
    ORM <-->|SQL| Supa
```

#### 5.3.3 Deployment Diagram
The deployment diagram illustrates how the system is physically distributed across cloud environments.

```mermaid
graph TD
    subgraph User Device
        Browser[Mobile/Desktop Browser]
    end

    subgraph Vercel Edge Network
        Frontend[React Static Assets]
    end

    subgraph Render Cloud
        NodeServer[Node.js Express Server]
    end

    subgraph Supabase Cloud
        DB[(PostgreSQL Database)]
    end

    Browser <-->|HTTPS| Frontend
    Browser <-->|HTTPS / tRPC| NodeServer
    NodeServer <-->|TCP / Connection Pool| DB
```

#### 5.3.4 Class Diagram (Core Entities)
This diagram highlights the structural design of the core database entities and their relationships.

```mermaid
classDiagram
    class User {
        +UUID id
        +String email
        +String role
        +Int trustScore
        +login()
        +updateTrustScore()
    }

    class Course {
        +Int id
        +String courseCode
        +String title
        +Int classSize
    }

    class ClassReport {
        +Int id
        +Int courseId
        +UUID reporterId
        +String reportType
        +String status
        +Int confirmsCount
        +Int disputesCount
        +verify()
    }

    class Hazard {
        +Int id
        +Float lat
        +Float lng
        +String severity
        +DateTime expiresAt
    }

    User "1" -- "*" ClassReport : submits
    Course "1" -- "*" ClassReport : has
    User "1" -- "*" Hazard : reports
```

---

## 6. Testing Strategy

### 6.1 Testing Objectives
The testing strategy for CACTUS ensures that the core navigational, reporting, and coordination features function reliably under expected user loads. Given the real-time nature of the application, verifying the accuracy of the routing algorithm and the state transitions of the reporting system are paramount.

### 6.2 Testing Levels
*   **Unit Testing:** Focuses on isolated business logic. Specifically, the `algorithms.ts` file is tested to ensure Dijkstra's algorithm correctly calculates the shortest path and that the Bayesian trust score formula accurately adjusts scores based on input variables.
*   **Integration Testing:** Verifies the communication between the tRPC routers and the database (`db.ts`). This ensures that mutations (e.g., creating a report) correctly update the PostgreSQL database and that queries retrieve the expected data shapes.
*   **End-to-End (E2E) Testing:** Simulates complete user workflows. A comprehensive Python-based E2E test suite (`e2e.test.py`) was developed to validate the entire API surface. This suite tests authentication flows, the creation and verification of class reports, hazard submission, and walk group lifecycle management.

### 6.3 Automated E2E Test Coverage
The E2E suite consists of 26 rigorous tests covering the following domains:
1.  **Authentication:** Signup, login, and session management.
2.  **Course Management:** Retrieving enrolled courses and fetching the daily timetable.
3.  **Class Reporting:** Submitting a class claim, processing upvotes/downvotes, and verifying the status transition based on the threshold.
4.  **Hazard Reporting:** Submitting hazard reports and retrieving active hazards within a bounding box.
5.  **Walking Groups:** Updating availability, requesting walkers, and submitting post-walk trust ratings.

---

## 7. Description of Solution and Implementation

### 7.1 Implementation Overview
The CACTUS solution was implemented as a full-stack TypeScript application. The development process emphasized mobile responsiveness and real-time data synchronization. The application is deployed live, with the frontend hosted on Vercel and the backend Node.js server hosted on Render, communicating with a Supabase PostgreSQL instance.

### 7.2 Key Functionality Implementations

#### 7.2.1 Pathfinding and Navigation
The campus was modeled as a graph, defined in `campus_adjacency_list_only.json`. Each node represents a physical location (e.g., an intersection or building entrance), and edges represent walkable paths with associated weights (distance, elevation, lighting quality). The `planCampusRouteBetweenNodes` function in `findWayGeo.ts` implements Dijkstra's algorithm. When a user requests a "Safe Night" route, the algorithm dynamically increases the weight of edges that lack sufficient lighting or have active hazard reports nearby, forcing the pathfinder to select safer, albeit potentially longer, routes.

#### 7.2.2 Crowdsourced Verification and Trust
To prevent abuse of the reporting system, a dynamic verification threshold was implemented. When a student reports a class cancellation, the report enters a "pending" state. The `getRequiredThresholdForReport` function calculates the necessary number of upvotes based on the total class size. Votes from Class Representatives carry a higher weight (`getVoteWeightForUser`). Once the threshold is met, the report status transitions to "verified," and the system triggers the `applyTrustScoreChange` function. This function uses a Bayesian approach to increase the Trust Score of the original reporter and the upvoters, while penalizing those who downvoted the verified accurate report.

#### 7.2.3 Real-Time Synchronization
To ensure users are immediately aware of new hazards or walk groups, the backend implements Server-Sent Events (SSE) in `realtime.ts`. When a mutation occurs (e.g., `createReportMutation`), the server emits an event to all connected clients. The React frontend listens to these events and invalidates the relevant tRPC queries, prompting an immediate UI refresh without requiring the user to manually reload the page.

---

## 8. Results and Analysis

### 8.1 System Performance and Reliability
The deployed CACTUS application successfully meets its core objectives. The integration of Mapbox GL JS with the custom campus graph data provides a highly responsive navigational experience. During testing, the pathfinding algorithm consistently returned optimal routes in under 200ms, well within the 500ms non-functional requirement. 

The comprehensive E2E test suite (`e2e.test.py`) confirms the reliability of the backend API. All 26 E2E tests currently pass (100% success rate), validating the integrity of the authentication flow, the complex logic of the course reporting threshold system, and the walk group state management.

### 8.2 Analysis of the Trust and Verification System
The implementation of the Bayesian Trust Score and the weighted voting system proved highly effective in simulated environments. By assigning higher voting weights to Class Representatives, the system can rapidly verify legitimate class changes without requiring the entire class to participate. The Trust Score system acts as a strong deterrent against malicious reporting; simulated users who submitted false reports quickly dropped into the "Watchlist" or "Flagged" tiers, subsequently reducing their future voting power. This self-regulating mechanism is crucial for maintaining the integrity of crowdsourced data on a large campus.

### 8.3 Challenges and Resolutions
A significant challenge during implementation was reconciling the Drizzle ORM schema with the existing Supabase database structure, particularly regarding the `class_reports` and `course_session_overrides` tables. The original database utilized UUIDs and snake_case naming conventions, which conflicted with the application's integer-based, camelCase schema. 

**Resolution:** To ensure system stability without disrupting existing Supabase configurations, new tables (`cactus_class_reports`, `cactus_class_report_votes`, `cactus_session_overrides`) were created. The Drizzle schema was updated to map to these new tables, allowing the application to function flawlessly while maintaining a clean separation from legacy database structures.

### 8.4 Conclusion
CACTUS successfully demonstrates how integrated web technologies can solve localized logistical challenges. By combining algorithmic routing with crowdsourced intelligence and a robust trust framework, the system provides a comprehensive companion tool for the UWI Mona student body. The application is fully deployed, thoroughly tested, and ready to significantly enhance campus safety and academic coordination.

---

## 9. Project Links and Appendix

### 9.1 GitHub Code Link
The complete source code for the CACTUS Capstone project is hosted on GitHub:
**Repository:** [itsdebrakayes/CACTUS-capstone](https://github.com/itsdebrakayes/CACTUS-capstone)

### 9.2 Live Application Link
The fully built and deployed application is accessible at:
**Live URL:** [https://cactus-capstone.onrender.com/](https://cactus-capstone.onrender.com/)

### 9.3 Appendix
*   **A.1 Testing Specifications:** Detailed E2E test scenarios and coverage metrics can be found in the repository under `docs/TESTING_SPEC.md`.
*   **A.2 Environment Setup:** Instructions for local deployment and environment variable configurations are detailed in the repository's `README.md`.
