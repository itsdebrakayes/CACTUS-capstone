# Software Requirements Specification for CACTUS (Campus Companion Hub)

## 1 Overall Description

### 1.1 Product Context and Need
The Campus Companion Hub (CACTUS) is designed to address the daily navigational, safety, and academic coordination challenges faced by students at the University of the West Indies (UWI) Mona campus. The campus features a complex layout, varying safety conditions (especially at night), and frequent last-minute academic schedule changes. Currently, students rely on fragmented communication channels (like WhatsApp groups) and institutional knowledge to navigate the campus safely and stay updated on class changes. 

CACTUS provides an integrated digital solution by combining real-time campus navigation, crowdsourced hazard reporting, peer-to-peer walking groups, and dynamic course coordination. By centralizing these features into a single, mobile-responsive web application, CACTUS enhances student safety, reduces time lost to navigational inefficiencies, and ensures timely communication regarding academic schedule adjustments.

### 1.2 Product Functionality
CACTUS is a comprehensive campus companion system that performs the following core functions:
* **Interactive Campus Navigation:** Provides routing across the campus using Dijkstra's algorithm, offering route profiles such as Shortest, Safe Night, Scenic, and Accessible.
* **Walking Partner System:** Facilitates the creation and joining of "Walk Groups" to ensure students do not have to traverse the campus alone, particularly during night hours.
* **Crowdsourced Hazard Reporting:** Allows users to report physical hazards (e.g., broken lights, flooding, suspicious activity) on the campus map, which dynamically influences route planning.
* **Course Coordination & Reporting:** Enables students and Class Representatives to report and verify class changes (cancellations, room changes, lateness) with a dynamic threshold verification system.
* **Trust Score System:** Implements a Bayesian trust scoring mechanism to evaluate the reliability of user reports and walking partners, complete with a strike system for malicious behavior.
* **Emergency Safety Tools:** Provides quick access to campus security, emergency services, and an audio recording feature for immediate safety concerns.

### 1.3 Stakeholders and Users Characteristics
The system is designed for the UWI Mona campus community. The primary users must have basic digital literacy to navigate a web application on their mobile devices or computers.

* **Students (Primary Users):** 
  Require access to campus navigation, walking groups, course schedules, and the ability to submit hazard or class reports. They rely heavily on the system for daily campus life.
* **Class Representatives:** 
  Have elevated privileges in the course reporting system. Their votes carry more weight in verifying class changes, and they have access to a specialized dashboard to monitor course health.
* **Lecturers/Faculty:** 
  Can post official announcements and verify class changes instantly. Their input supersedes crowdsourced student reports.
* **Campus Security/Administration (Secondary Stakeholders):** 
  Benefit from the aggregated hazard reports to identify areas of the campus requiring maintenance or increased security patrols.

### 1.4 Operating Environment
CACTUS operates as a mobile-first, responsive web application.
* **Client-Side:** Runs on modern web browsers (Chrome, Safari, Firefox, Edge) on mobile devices (iOS/Android), tablets, and desktop computers.
* **Server-Side:** Hosted on a Node.js environment (Render) utilizing Express and tRPC for API communication.
* **Database:** Utilizes PostgreSQL hosted on Supabase, with Drizzle ORM for database interactions.
* **External Services:** Integrates with Mapbox GL JS for map rendering and spatial data visualization.

### 1.5 Design and Implementation Constraints
1. **Mobile-First Design:** The interface must prioritize mobile usability, as students will primarily access the application while walking across campus.
2. **Real-Time Data Dependency:** The effectiveness of hazard reports and walking groups relies on real-time data synchronization (implemented via Server-Sent Events).
3. **Database Schema Constraints:** The system must interface with existing Supabase tables (e.g., `crowd_reports`, `walk_groups`) while managing complex relational data for trust scores and course reporting.
4. **Algorithmic Performance:** The pathfinding algorithm must execute efficiently on the server to provide immediate routing feedback without significant latency.

### 1.6 Assumptions and Dependencies
* **Assumptions:**
  * Users have access to smartphones with stable internet connections and GPS capabilities while on campus.
  * The provided campus graph data accurately represents the physical layout of the UWI Mona campus.
  * Users will actively participate in the crowdsourcing aspects (reporting hazards, verifying class changes) to maintain system accuracy.
* **Dependencies:**
  * **Mapbox API:** Required for rendering the interactive campus map.
  * **Supabase:** Required for PostgreSQL database hosting and authentication services.
  * **Render/Vercel:** Required for backend and frontend hosting environments.

---

## 2 Specific Requirements

### 2.1 External Interface Requirements

#### 2.1.1 Hardware Interfaces
The application does not require specific custom hardware. It relies on the standard hardware of the user's device:
* Touchscreen interface for mobile users or mouse/keyboard for desktop users.
* Device GPS/Location Services to determine the user's current location on the campus map.

#### 2.1.2 Software Interfaces
* **Frontend:** React 19, Tailwind CSS, Radix UI components, Mapbox GL JS.
* **Backend:** Node.js, Express, tRPC, Drizzle ORM.
* **Database:** PostgreSQL (Supabase).

#### 2.1.3 Communications Interfaces
* **HTTP/HTTPS:** Standard web protocols for client-server communication.
* **Server-Sent Events (SSE):** Used for real-time updates regarding hazard reports and walk group statuses.
* **SMTP:** Utilized via Nodemailer for sending email verification codes during the signup process.

### 2.2 Functional Requirements

**Requirement ID: 1 – Campus Navigation and Routing**
* **Use Case:** Plan Route
* **Rationale:** Students need safe and efficient routes across a complex campus.
* **System Requirements:**
  1.1 The system shall allow users to select a starting point and destination on the campus map.
  1.2 The system shall calculate routes using Dijkstra's algorithm based on the campus graph network.
  1.3 The system shall provide multiple route profiles: Shortest, Safe Night, Scenic, and Accessible.
  1.4 The system shall dynamically adjust route costs based on active hazard reports (e.g., avoiding paths with reported violent incidents during the Safe Night profile).
* **Acceptance Criteria:** Routes are generated within 2 seconds and accurately reflect the selected profile constraints.

**Requirement ID: 2 – Crowdsourced Hazard Reporting**
* **Use Case:** Report Campus Hazard
* **Rationale:** Real-time awareness of campus hazards improves overall student safety.
* **System Requirements:**
  2.1 The system shall allow users to drop a pin on the map to report hazards (e.g., broken lights, flooding).
  2.2 The system shall categorize hazards by type and severity.
  2.3 The system shall display active hazards on the map for all users.
  2.4 The system shall implement a Time-To-Live (TTL) mechanism for hazards, expiring them if not re-confirmed.
* **Acceptance Criteria:** Submitted hazards appear immediately on the map for all connected users via SSE.

**Requirement ID: 3 – Walking Partner System (Walk Groups)**
* **Use Case:** Create/Join Walk Group
* **Rationale:** Walking in groups deters crime and increases perceived safety, especially at night.
* **System Requirements:**
  3.1 The system shall allow users to create a Walk Group specifying a meeting point, destination, and departure time.
  3.2 The system shall allow other users to view active Walk Groups on the map and join them.
  3.3 The system shall track the status of the Walk Group (active, started, ended).
* **Acceptance Criteria:** Users can successfully create, join, and leave walk groups, with UI updates reflecting member counts.

**Requirement ID: 4 – Course Coordination and Reporting**
* **Use Case:** Report Class Change
* **Rationale:** Students often arrive at classes only to find them cancelled or moved; early notification prevents wasted time.
* **System Requirements:**
  4.1 The system shall allow enrolled students to submit reports regarding class status (e.g., cancelled, room change).
  4.2 The system shall allow other enrolled students to upvote (confirm) or downvote (deny) pending reports.
  4.3 The system shall use a dynamic threshold (based on class size) to verify reports.
  4.4 The system shall notify enrolled students once a report is verified.
* **Acceptance Criteria:** Reports transition from 'pending' to 'verified' automatically once the required confirmation threshold is met.

**Requirement ID: 5 – Trust Score Management**
* **Use Case:** Update User Trust Score
* **Rationale:** To prevent malicious reporting, the system must evaluate user reliability.
* **System Requirements:**
  5.1 The system shall assign a Trust Score to every user, starting at a default value (50).
  5.2 The system shall increase the score for verified accurate reports and decrease it for denied reports.
  5.3 The system shall issue "strikes" for severely inaccurate reports, potentially leading to temporary suspension from the reporting system.
* **Acceptance Criteria:** User trust scores update accurately following the resolution of class reports or walking partner ratings.

### 2.3 Behavior Requirements / Use Case View

#### Core Use Cases
1. **User Authentication:** Users sign up, verify their email via an OTP code, and log in to access protected features.
2. **Map Interaction:** Users view the campus map, toggle visibility filters for different locations (ATMs, food, study areas), and view active hazards.
3. **Route Planning:** User selects "Find Way", inputs destination, selects a route profile, and the system renders the optimal path on the map.
4. **Class Reporting:** A student notices a lecturer is absent, submits a "Lecturer Late" report. Other students open the class chat and upvote the report. The system verifies it and updates the course status.
5. **Emergency Action:** A user feels unsafe, navigates to the Safety page, and activates the emergency audio recording or quick-dials campus security.

---

## 3 Other Non-functional Requirements

### 3.1 Performance Requirements
* The web application must load the initial map interface within 3 seconds on a standard 4G connection.
* Pathfinding calculations must complete in under 500 milliseconds on the server.
* Real-time events (hazards, walk groups) must propagate to connected clients within 1 second.

### 3.2 Safety and Security Requirements
* User passwords must be securely hashed using `bcryptjs` before storage.
* API endpoints must be protected using JWT-based session cookies; sensitive procedures must use `protectedProcedure` in tRPC.
* The system must implement rate limiting or strike systems to prevent spamming of the hazard and class reporting features.
* Location data used for Walk Groups must be handled securely and only shared with active group members.

### 3.3 Software Quality Attributes
* **Usability:** The interface must be intuitive, utilizing recognized iconography (Lucide React) and clear color coding (e.g., Red for severe hazards).
* **Maintainability:** The codebase must be modular, separating database logic (`db.ts`), algorithmic logic (`algorithms.ts`), and API routing (`routers.ts`).
* **Reliability:** The system must gracefully handle external API failures (e.g., Mapbox downtime) by providing fallback UI states.

---

## 4 Other Requirements
* The system must utilize the specific UWI Mona campus geographical dataset provided in `uwipath.json` and `campus_adjacency_list_only.json`.
* The application must be deployable to standard cloud hosting platforms (Render for backend, Vercel for frontend).
