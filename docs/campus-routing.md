# Campus Routing Guide

## What this system is trying to solve

Campus routing in CACTUS is more complicated than normal road navigation.

Some classrooms, labs, and internal campus locations are not directly reachable by a standard road-based directions API. A service like Mapbox can usually route a person to the outside of a building, but it does not understand:

- indoor classroom positions
- internal campus footpaths
- shortcuts across campus
- custom walkable connectors that only exist inside the university map

Because of that, CACTUS uses a hybrid routing system:

1. Use Mapbox for the real-world or outdoor portion of the trip.
2. Use a custom campus graph for the internal campus portion.
3. Connect the final route to the destination classroom, lab, or place.

This lets the app guide users to places that normal directions alone cannot fully understand.

## The main idea in plain language

Think of the campus as a network of walkable points and links.

- A node is a point on the campus path network.
- An edge is a walkable connection between two nodes.
- A destination is a classroom, lab, office, library, or campus place.

When a user asks for directions, the system does not try to route straight to the room using only road navigation.

Instead, it does this:

1. Find the campus node closest to the user's route entry.
2. Find the campus node closest to the destination.
3. Use a graph algorithm to travel across the campus node network.
4. Add any short connector segment needed to reach the exact destination point.

## Data sources used by routing

The routing system depends on two different kinds of data.

### 1. Campus graph data

This is the custom walkable network for the campus.

It comes from:

- `scripts/campus_adjacency_list_only.json`

This file contains the node network and the adjacency relationships between nodes.

### 2. Destination and place data

This describes real places a student can search for.

Examples:

- classrooms
- lecture rooms
- labs
- faculty offices
- bathrooms
- buildings

This data is loaded from:

- the local place dataset
- optional Supabase place records such as `map_places`

The route system combines this place data with the graph data by snapping each place to its nearest useful campus node.

## What the "invisible nodes" are

The invisible nodes are the internal graph points used for routing.

They are called "invisible" because:

- they are needed by the algorithm
- they are usually not shown to the user
- they exist mostly to support path calculation

These nodes are not destination markers by themselves. They are structural routing points.

Examples of what they represent:

- bends in a footpath
- connectors between open spaces
- walkway turns
- building approach points
- entry-side access points near destinations

At one point they were rendered on the map for debugging, but in the normal user experience they stay hidden. The app still uses them in the background even though the user cannot see them.

## Why invisible nodes are important

If the app tried to route between only "big places" like buildings or rooms, the route would be rough and inaccurate.

The invisible nodes make the route:

- smoother
- more precise
- easier to connect across campus
- easier to adapt when some destinations are not directly reachable by Mapbox

They are the backbone of the internal campus path network.

## The algorithm being used

The current campus graph uses Dijkstra's algorithm.

This is the graph search used to find the shortest walkable path between two campus nodes.

Why Dijkstra works well here:

- the campus graph is structured and bounded
- all route segments have measurable distances
- it produces reliable shortest-path results
- it is simple and predictable for this size of network

The app is not currently using A* for the campus graph.

A* could be added later if the graph becomes much larger or if route performance becomes a problem, but right now Dijkstra is the active algorithm.

## How a normal route is built

When the user asks for directions, the route is built in layers.

### Step 1. Pick the destination

The user chooses a destination such as:

- Animal House
- Administration Building
- a lab
- a lecture room
- a classroom

That destination has map coordinates and is also associated with a nearest campus graph node.

### Step 2. Find the user's nearest useful path entry

The app looks for the nearest useful campus path snap near the user.

This is the handoff point between:

- the real-world location of the user
- the custom campus graph

### Step 3. Use Mapbox for the off-graph leg

If needed, Mapbox is used first to reach the campus graph entry area.

This is helpful because Mapbox is still good at:

- walking on public roads
- getting close to campus paths
- handling open outdoor travel

### Step 4. Use the campus graph for the internal route

Once the route reaches the campus network, Dijkstra takes over.

The graph route travels:

- from the chosen entry node
- through the internal campus nodes
- to the destination-side access node

### Step 5. Connect to the final destination

If the destination is not exactly on the graph, the app adds the final connector from the destination-side node to the actual place coordinate.

This is how a classroom or lab can still be targeted even if it is not itself a graph node.

## Route modes

The campus routing flow supports route intent, not just one hardcoded path.

The UI currently presents:

- `Quick`
- `Scenic`
- `Shortcut` as a future or coming-soon option

In practice:

- `Quick` aims for the fastest campus route
- `Scenic` prefers the ring-road or scenic campus flow where applicable
- `Shortcut` is reserved for future footpath-preferred behavior

The route mode influences how the route is assembled and which path style is preferred.

## What happens when the graph is disconnected

This is one of the most important parts of the current routing design.

The campus graph is not always one perfect connected network. Some areas may be split into separate connected components.

That means:

- the user's nearest graph node might be on one graph island
- the destination's nearest graph node might be on another graph island

If the app tries to run Dijkstra directly between those two disconnected components, it fails because there is no internal graph path between them.

## The cross-component fallback

To solve that, the app uses a fallback strategy.

Instead of always entering the campus graph from the user's nearest node, the app can do this:

1. Detect that the destination belongs to a different connected component.
2. Look for candidate entry nodes inside the destination's component.
3. Ask Mapbox to reach one of those destination-side entry nodes.
4. Start Dijkstra from that destination-side entry node.
5. Finish the internal graph route to the classroom or place.

In other words:

- Mapbox gets the user close to the correct graph island
- Dijkstra handles the campus network once the user is on that island

This is much more reliable than forcing the route through the user's first nearest graph snap.

## Why classes can still be connected even when Directions API cannot reach them

The Directions API is only part of the solution.

The class connection works because the app does not expect Mapbox to understand the classroom itself.

Instead:

- Mapbox handles the outer approach
- the campus graph handles the internal campus path
- the final destination connector handles the exact classroom position

That is why rooms can still be routed even if they are inside or beyond the public road network.

## Snapping: how places become routeable

Each searchable campus place is paired with the graph by snapping it to a nearby node.

This allows the app to say:

- "this classroom belongs to that graph access point"
- "this lab should route through that nearby path node"
- "this building entrance is best reached from this campus node"

This is the key bridge between:

- searchable place data
- pathfinding data

Without snapping, the app would know where a room is visually, but it would not know how to travel to it using the graph.

## Why some nodes were shown before

During debugging, all graph nodes were rendered on the map so the routing network could be inspected visually.

That was helpful for:

- spotting disconnected graph regions
- seeing whether a building had enough nearby graph coverage
- understanding why certain routes failed

Those debug nodes were later hidden again because they are not meant for the normal student-facing map experience.

## Current limitations

The routing system is much better than a plain directions API alone, but there are still practical limitations.

### 1. Graph quality matters

If the graph is missing edges or missing access points near a building, the route can still fail or look incomplete.

### 2. Disconnected components still matter

The fallback helps, but the best result still comes from a well-connected campus graph.

### 3. Final classroom precision depends on destination data

If the classroom coordinates are rough or snapped to the wrong side of a building, the route can still feel slightly off near the end.

### 4. Hazard-aware rerouting is still future work

The system can already display crowd reports and obstacles, but full path-condition-aware rerouting is still a future enhancement.

## Where this logic lives in the code

These are the main files that drive the routing system.

### Core graph utilities

- `client/src/lib/findWayGeo.ts`

This file handles:

- graph structures
- connected component detection
- nearest path snapping
- Dijkstra pathfinding
- campus route planning helpers

### Place loading and snapping

- `client/src/lib/campusPlaces.ts`

This file handles:

- loading campus places
- pairing places with graph access points
- caching place data for faster remounts

### Main map routing

- `client/src/pages/MapPage.tsx`

This file handles:

- map-based destination routing
- same-component routing
- cross-component fallback routing
- route display inside the main map experience

### Find My Way routing

- `client/src/pages/FindWayPage.tsx`

This file handles:

- the route-planning UI
- destination selection
- route mode selection
- meeting-point-aware map flows used by Walk Group creation

## Summary

The campus routing system works because it combines three ideas:

1. Mapbox for real-world approach routing.
2. Invisible campus graph nodes for internal campus navigation.
3. Dijkstra pathfinding to connect destinations such as classrooms and labs.

The invisible nodes are not a UI feature. They are the hidden structure that makes class-to-class and place-to-place campus routing possible.

As the graph becomes more complete, the system becomes more reliable, more accurate, and more capable of supporting future rerouting features such as obstacle avoidance and safety-aware path changes.
