# Walk Group And Crowdsource Reporting Guide

## What this feature is for

This part of CACTUS is designed to help students move across campus more safely and more socially.

It combines two connected ideas:

- Walk Group: students can create and join a shared campus walk.
- Crowdsource reporting: students can report safety or path issues that appear on the map.

Together, these features are meant to support:

- safer movement across campus
- easier group coordination
- shared awareness of path problems or suspicious activity

#

The idea is not private matching. The idea is a visible shared walk that other students can join.

## Walk Partner in plain language

A Walk Group behaves more like a small live campus event than a one-to-one chat or a background phone session.

A student creates a group.

The group has:

- a destination
- a meeting point
- a leaving time
- an optional note
- a status

Other students can see the group on the map, tap it, read the details, and choose whether to join.

## The key rule: the meeting point uses real coordinates

The meeting point is not just text.

When a Walk Group is created, the creator taps the map to place the meeting marker. The app then saves:

- `meeting_lat`
- `meeting_lng`

in Supabase.

This matters because the meeting point must:

- appear as a real marker on the map
- be visible to other users
- support route drawing
- support later safety and reroute features

## The creator flow

The current intended flow looks like this:

1. The user opens Find My Way.
2. The user taps the `Walk Group` action.
3. The app shows a reminder to start the group early enough for others to join.
4. The user chooses the destination.
5. The user taps the map to choose the meeting point.
6. The app captures the meeting point latitude and longitude.
7. The user sets the leaving time and optional note.
8. The app creates the walk group in Supabase.
9. The creator is automatically inserted as the first member.
10. The creator is navigated to the dedicated Active Walk Group page.

## The joiner flow

Other users do not need to use the creator flow.

They simply:

1. Open the normal main Map tab.
2. See the active Walk Group marker on the map.
3. Tap the marker.
4. Read the group details in the preview sheet.
5. Tap `Join`.
6. Get added to the group in Supabase.
7. Get taken to the dedicated Active Walk Group page.

## Creator vs member roles

The feature clearly separates what creators and members can do.

### Creator

The creator is the host of the group.

The creator can:

- see the destination
- see the meeting point
- see the leaving time
- see the joined members
- start the group
- end or cancel the group

The creator cannot simply "leave" the same way a member does. Ending the group is the proper action for the host.

### Member

A regular member can:

- see the destination
- see the meeting point
- see the list of joined people
- leave the group

A member cannot:

- start the group for everyone
- end the group for everyone
- act as the host

## Where Walk Group appears in the app

The Walk Group feature is split across multiple screens on purpose.

### 1. Find My Way page

This is mainly where a group is created.

The creator:

- chooses the destination
- picks the meeting point on the map
- submits the group

### 2. Main Map tab

This is the discovery and join surface.

The Map tab should:

- remain the normal map page
- fetch active groups from Supabase
- display their meeting markers
- let users tap markers and join

It is not supposed to become the active-group management screen.

### 3. Active Walk Group page

This is the dedicated group page after creation or join.

This screen is map-based and should feel like a real map feature, not a plain content page.

It now follows the map-first layout:

- full-screen map background
- bottom sheet on top of the map
- tabs for `Main` and `Comments`

## What the Active Walk Group page shows

The page is designed to keep the map visible while showing group controls in the bottom sheet.

### Main tab

For the creator, the sheet focuses on:

- walking destination
- meeting point
- estimated walk time
- joined member list
- `Start Group`
- `End Group`

For members, the sheet is simpler and focuses on:

- destination
- meeting point
- estimated walk time
- joined member list
- `Leave Group`

### Comments tab

This tab exists now as layout structure for future use.

Later it can support messages such as:

- "Wait for me"
- "I'm coming"
- "Where exactly are you meeting?"

For now it is intentionally a placeholder.

## Started vs active groups

Walk Groups use statuses so the app can tell what stage the group is in.

Current statuses include:

- `active`
- `started`
- `ended`
- `cancelled`
- `expired`

### Active

The group exists and can still be joined.

### Started

The creator has started the walk.

At this point:

- the shared group route can be drawn from the meeting point to the destination
- the group is considered in motion
- new joins can be restricted based on policy

### Ended or cancelled

The group is over and should no longer behave as a live public walk.

### Expired

The group stayed around too long and was cleaned up automatically.

## Auto-expire behavior

The app should not depend only on the creator to end a group.

Old groups need to disappear from the map automatically.

The current database flow supports expiring stale groups roughly 45 minutes after `leaving_at`.

This protects the map from being cluttered with old walk groups that are no longer relevant.

## The Supabase database design

The Walk Group feature uses two separate tables.

### `walk_groups`

This stores the group itself.

It includes fields such as:

- creator id
- destination name
- destination coordinates
- meeting point name
- meeting point coordinates
- leaving time
- note
- status

### `walk_group_members`

This stores who joined the group.

It includes fields such as:

- walk group id
- user id
- role
- joined time
- left time

This separation is important.

It is much better than storing all users in one big array column because it is:

- easier to query
- easier to enforce membership rules
- more scalable
- easier to keep clean

## Important membership rules

The current database logic is designed to enforce a few important rules.

### 1. The creator becomes the first member automatically

When a group is created, the creator is inserted into the members table immediately.

### 2. A user should not join the same group twice

Membership is tracked as a real relation, not duplicate button presses.

### 3. A user should not be in multiple live groups at once

The feature is designed around one active walk context per user.

### 4. Only appropriate statuses can be joined

Usually that means the group must still be in a joinable state such as `active`.

## How Walk Group markers are shown on the map

Walk Group markers are not generic dots.

They use a real image marker based on:

- `multiple-users-silhouette.png`

That icon represents:

- a group meetup point
- a shared walking event

The meeting marker is what other users see and tap on the map.

## Crowdsource reporting in plain language

Crowdsource reporting allows users to report issues on campus that others should know about.

Examples include:

- suspicious activity
- blocked paths
- potholes
- flooding
- broken paths
- lighting-related concerns

Each report is saved with coordinates so it can be shown on the map in the correct place.

## What gets saved for a crowd report

A typical report stores:

- report type
- latitude
- longitude
- severity
- optional description

Only active reports are meant to appear as live map markers.

## Crowd report icons

The app now uses actual image markers for reports instead of plain colored dots.

Current icon mapping is based on the report type.

Examples:

- suspicious activity -> `suspicious-man.png`
- obstruction or blocked path -> `obstruction.png`
- pothole -> `pothole.png`
- flooding -> `high-tide.png`
- broken path -> `road (1).png`
- light issue or fallback road issue -> `road.png`

This makes the map easier to understand visually because the marker itself communicates the type of report.

## How Walk Group and crowd reports connect

Right now, they are separate features that share the same map experience.

Walk Group handles:

- meetup creation
- joining
- group state
- shared route context

Crowdsource reporting handles:

- obstacle and safety reports
- visual map awareness
- future route-affecting warnings

## The future rerouting idea

One of the strongest future improvements is to combine the two.

Example:

- a suspicious activity report appears near a usual path
- a blocked path report appears on a walkway
- a flooding report affects an outdoor connector

Once the routing system becomes report-aware, the app can potentially:

- display the issue on the map
- warn the group
- choose a safer or cleaner route
- reroute around the affected area

That makes Walk Group more than a meetup tool. It becomes a safer live navigation experience.

## Current UI behavior that matters

Some practical design choices already matter a lot.

### 1. The Active Walk Group card on the dashboard

When a user is part of a live Walk Group, the dashboard can show an active-group card in the area that normally holds urgent updates.

That gives the user a quick way back into the group flow.

### 2. The main Map tab stays the normal map

This is important for separation of responsibility.

The main Map tab should:

- show the normal campus map
- show walk group markers
- show crowd reports
- allow join and discovery

The dedicated Active Walk Group page should handle group participation and management.

### 3. The Active Walk Group page stays map-first

This makes the feature feel like part of the campus navigation system rather than a disconnected form or plain information page.

## Where this logic lives in the code

### Supabase Walk Group client logic

- `client/src/lib/supabaseWalkGroups.ts`

This handles:

- loading active groups
- loading the user's active group
- creating groups
- joining groups
- leaving groups
- updating group status

### Walk Group database setup

- `scripts/create-walk-groups.sql`

This handles:

- table creation
- membership rules
- status updates
- creator insertion
- auto-expire logic

### Active group page

- `client/src/pages/WalkGroupPage.tsx`

This handles:

- the dedicated active group screen
- creator and member views
- map plus bottom sheet layout
- tabs for main and comments

### Group creation and map integration

- `client/src/pages/FindWayPage.tsx`
- `client/src/pages/MapPage.tsx`
- `client/src/components/CactusMap.tsx`

These handle:

- creation flow
- marker display
- join preview
- map rendering
- shared map visuals

### Crowdsource reporting

- `client/src/lib/supabaseHazards.ts`
- `client/src/lib/placeMarkerIcons.ts`
- `client/src/components/CactusMap.tsx`

These handle:

- loading reports
- creating reports
- icon mapping
- marker rendering

## Summary

The Walk Group and crowdsource reporting features are meant to work together as a campus safety and navigation layer.

Walk Group lets students:

- create shared walks
- publish meeting points
- join others
- move together

Crowdsource reporting lets students:

- flag suspicious activity
- report path problems
- add safety context to the map

The long-term value of this design is that the map becomes more than a static map. It becomes a live campus coordination system that can eventually guide people around problems, not just toward destinations.
