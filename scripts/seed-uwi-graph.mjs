/**
 * Seed script: UWI Mona Campus Footpath Graph
 * ─────────────────────────────────────────────
 * Run once with:  node scripts/seed-uwi-graph.mjs
 *
 * Creates realistic PathNodes and PathEdges for the University of the West
 * Indies, Mona Campus (Kingston, Jamaica).
 *
 * Coordinates are based on the actual campus layout:
 *   Centre: 18.0035°N, 76.7497°W
 *
 * Node categories:
 *   gate, library, admin, cafeteria, faculty, medical, sports, landmark, junction
 *
 * Edge metadata is set to realistic values:
 *   lighting      — 0 (dark) to 1 (well-lit)
 *   weatherCoverage — 0 (exposed) to 1 (covered walkway)
 *   isolation     — 0 (isolated) to 1 (busy)
 *   scenicScore   — 0 (plain) to 1 (beautiful)
 *   surfaceQuality — 0 (rough) to 1 (smooth paved)
 *   hasSteps      — true if there are steps on this segment
 *   slopeGrade    — % grade (positive = uphill from→to)
 */

import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// ─── Haversine distance ───────────────────────────────────────────────────────
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function walkTime(distM) {
  return Math.round(distM / 1.4);
}

// ─── Node definitions ─────────────────────────────────────────────────────────
// Each node: { key, name, lat, lng, isLandmark, scenicScore, isAccessible, category }
const NODES = [
  // Gates
  { key: "main_gate",       name: "Main Gate",               lat: 18.00215, lng: -76.74580, isLandmark: true,  scenicScore: 0.5, isAccessible: true,  category: "gate" },
  { key: "north_gate",      name: "North Gate",              lat: 18.00620, lng: -76.74820, isLandmark: false, scenicScore: 0.3, isAccessible: true,  category: "gate" },
  { key: "east_gate",       name: "East Gate (Hope Rd)",     lat: 18.00190, lng: -76.74250, isLandmark: false, scenicScore: 0.3, isAccessible: true,  category: "gate" },

  // Admin & Academic
  { key: "admin_block",     name: "Administration Block",    lat: 18.00380, lng: -76.74900, isLandmark: true,  scenicScore: 0.6, isAccessible: true,  category: "admin" },
  { key: "senate_house",    name: "Senate House",            lat: 18.00440, lng: -76.74820, isLandmark: true,  scenicScore: 0.7, isAccessible: true,  category: "admin" },
  { key: "vice_chancellor", name: "Vice Chancellor's Office",lat: 18.00490, lng: -76.74750, isLandmark: true,  scenicScore: 0.6, isAccessible: true,  category: "admin" },

  // Library
  { key: "main_library",    name: "Main Library",            lat: 18.00350, lng: -76.74780, isLandmark: true,  scenicScore: 0.7, isAccessible: true,  category: "library" },
  { key: "law_library",     name: "Law Library",             lat: 18.00310, lng: -76.74700, isLandmark: false, scenicScore: 0.5, isAccessible: true,  category: "library" },

  // Faculties
  { key: "fss",             name: "Faculty of Social Sciences", lat: 18.00280, lng: -76.74850, isLandmark: false, scenicScore: 0.4, isAccessible: true,  category: "faculty" },
  { key: "fhe",             name: "Faculty of Humanities & Education", lat: 18.00330, lng: -76.74950, isLandmark: false, scenicScore: 0.5, isAccessible: true, category: "faculty" },
  { key: "fms",             name: "Faculty of Medical Sciences", lat: 18.00550, lng: -76.74600, isLandmark: false, scenicScore: 0.4, isAccessible: true, category: "faculty" },
  { key: "fst",             name: "Faculty of Science & Technology", lat: 18.00480, lng: -76.74550, isLandmark: false, scenicScore: 0.4, isAccessible: true, category: "faculty" },
  { key: "econ_dept",       name: "Economics Department",    lat: 18.00260, lng: -76.74800, isLandmark: false, scenicScore: 0.4, isAccessible: true,  category: "faculty" },

  // Cafeterias & Food
  { key: "undercroft",      name: "Undercroft Cafeteria",    lat: 18.00370, lng: -76.74860, isLandmark: true,  scenicScore: 0.5, isAccessible: true,  category: "cafeteria" },
  { key: "ibs_canteen",     name: "IBS Canteen",             lat: 18.00420, lng: -76.74680, isLandmark: false, scenicScore: 0.4, isAccessible: true,  category: "cafeteria" },

  // Medical
  { key: "uhwi",            name: "University Hospital (UHWI)", lat: 18.00580, lng: -76.74700, isLandmark: true, scenicScore: 0.3, isAccessible: true, category: "medical" },
  { key: "health_centre",   name: "Student Health Centre",   lat: 18.00400, lng: -76.74920, isLandmark: false, scenicScore: 0.3, isAccessible: true,  category: "medical" },

  // Sports & Recreation
  { key: "stadium",         name: "National Stadium (nearby)", lat: 18.00100, lng: -76.74400, isLandmark: true,  scenicScore: 0.6, isAccessible: true,  category: "sports" },
  { key: "sports_complex",  name: "UWI Sports Complex",      lat: 18.00650, lng: -76.74900, isLandmark: true,  scenicScore: 0.7, isAccessible: true,  category: "sports" },
  { key: "swimming_pool",   name: "Swimming Pool",           lat: 18.00600, lng: -76.74850, isLandmark: false, scenicScore: 0.6, isAccessible: true,  category: "sports" },

  // Scenic / Landmarks
  { key: "chapel",          name: "University Chapel",       lat: 18.00410, lng: -76.74760, isLandmark: true,  scenicScore: 0.9, isAccessible: true,  category: "landmark" },
  { key: "ring_road_n",     name: "Ring Road North",         lat: 18.00560, lng: -76.74800, isLandmark: false, scenicScore: 0.5, isAccessible: true,  category: "junction" },
  { key: "ring_road_s",     name: "Ring Road South",         lat: 18.00200, lng: -76.74800, isLandmark: false, scenicScore: 0.4, isAccessible: true,  category: "junction" },
  { key: "mona_bowl",       name: "Mona Bowl (Amphitheatre)", lat: 18.00460, lng: -76.74870, isLandmark: true, scenicScore: 0.9, isAccessible: false, category: "landmark" },
  { key: "mona_reservoir",  name: "Mona Reservoir",          lat: 18.00700, lng: -76.74650, isLandmark: true,  scenicScore: 1.0, isAccessible: false, category: "landmark" },
  { key: "papine_junction", name: "Papine Junction",         lat: 18.00080, lng: -76.74900, isLandmark: false, scenicScore: 0.2, isAccessible: true,  category: "junction" },

  // Residences
  { key: "chancellors_hall",name: "Chancellor's Hall",       lat: 18.00520, lng: -76.74980, isLandmark: false, scenicScore: 0.5, isAccessible: true,  category: "residence" },
  { key: "irvine_hall",     name: "Irvine Hall",             lat: 18.00480, lng: -76.75050, isLandmark: false, scenicScore: 0.5, isAccessible: true,  category: "residence" },
  { key: "taylor_hall",     name: "Taylor Hall",             lat: 18.00560, lng: -76.75000, isLandmark: false, scenicScore: 0.5, isAccessible: true,  category: "residence" },

  // Junctions
  { key: "jct_central",     name: "Central Junction",        lat: 18.00390, lng: -76.74730, isLandmark: false, scenicScore: 0.3, isAccessible: true,  category: "junction" },
  { key: "jct_north",       name: "North Path Junction",     lat: 18.00500, lng: -76.74700, isLandmark: false, scenicScore: 0.3, isAccessible: true,  category: "junction" },
  { key: "jct_south",       name: "South Path Junction",     lat: 18.00250, lng: -76.74700, isLandmark: false, scenicScore: 0.3, isAccessible: true,  category: "junction" },
];

// ─── Edge definitions ─────────────────────────────────────────────────────────
// Each edge: { from, to, lighting, weatherCoverage, isolation, scenicScore, surfaceQuality, hasSteps, slopeGrade, isAccessible }
// Edges are bidirectional — the seed creates both directions.
const EDGES_RAW = [
  // Main Gate → Ring Road South
  { from: "main_gate",      to: "ring_road_s",     lighting: 0.9, weatherCoverage: 0.2, isolation: 0.8, scenicScore: 0.4, surfaceQuality: 0.9, hasSteps: false, slopeGrade: 1.0, isAccessible: true },
  // Ring Road South → FSS
  { from: "ring_road_s",    to: "fss",             lighting: 0.7, weatherCoverage: 0.3, isolation: 0.7, scenicScore: 0.4, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // Ring Road South → Papine Junction
  { from: "ring_road_s",    to: "papine_junction", lighting: 0.6, weatherCoverage: 0.1, isolation: 0.5, scenicScore: 0.2, surfaceQuality: 0.7, hasSteps: false, slopeGrade: 0.0, isAccessible: true },
  // FSS → Undercroft
  { from: "fss",            to: "undercroft",      lighting: 0.8, weatherCoverage: 0.6, isolation: 0.9, scenicScore: 0.5, surfaceQuality: 0.9, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // FSS → Main Library
  { from: "fss",            to: "main_library",    lighting: 0.8, weatherCoverage: 0.4, isolation: 0.8, scenicScore: 0.6, surfaceQuality: 0.9, hasSteps: false, slopeGrade: 1.0, isAccessible: true },
  // FSS → Econ Dept
  { from: "fss",            to: "econ_dept",       lighting: 0.7, weatherCoverage: 0.3, isolation: 0.7, scenicScore: 0.4, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // Undercroft → Admin Block
  { from: "undercroft",     to: "admin_block",     lighting: 0.9, weatherCoverage: 0.7, isolation: 0.9, scenicScore: 0.6, surfaceQuality: 0.9, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // Undercroft → Chapel
  { from: "undercroft",     to: "chapel",          lighting: 0.8, weatherCoverage: 0.5, isolation: 0.8, scenicScore: 0.9, surfaceQuality: 0.9, hasSteps: false, slopeGrade: 1.0, isAccessible: true },
  // Admin Block → Senate House
  { from: "admin_block",    to: "senate_house",    lighting: 0.9, weatherCoverage: 0.6, isolation: 0.8, scenicScore: 0.7, surfaceQuality: 0.9, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // Admin Block → Health Centre
  { from: "admin_block",    to: "health_centre",   lighting: 0.7, weatherCoverage: 0.3, isolation: 0.6, scenicScore: 0.3, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 1.0, isAccessible: true },
  // Admin Block → FHE
  { from: "admin_block",    to: "fhe",             lighting: 0.8, weatherCoverage: 0.4, isolation: 0.7, scenicScore: 0.5, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // Senate House → Vice Chancellor
  { from: "senate_house",   to: "vice_chancellor", lighting: 0.9, weatherCoverage: 0.5, isolation: 0.7, scenicScore: 0.6, surfaceQuality: 0.9, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // Senate House → Mona Bowl (steps — not accessible)
  { from: "senate_house",   to: "mona_bowl",       lighting: 0.5, weatherCoverage: 0.1, isolation: 0.4, scenicScore: 0.9, surfaceQuality: 0.6, hasSteps: true,  slopeGrade: 8.0, isAccessible: false },
  // Vice Chancellor → Ring Road North
  { from: "vice_chancellor",to: "ring_road_n",     lighting: 0.8, weatherCoverage: 0.3, isolation: 0.6, scenicScore: 0.5, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 1.5, isAccessible: true },
  // Main Library → Law Library
  { from: "main_library",   to: "law_library",     lighting: 0.9, weatherCoverage: 0.7, isolation: 0.8, scenicScore: 0.6, surfaceQuality: 0.9, hasSteps: false, slopeGrade: 0.0, isAccessible: true },
  // Main Library → Chapel
  { from: "main_library",   to: "chapel",          lighting: 0.8, weatherCoverage: 0.4, isolation: 0.7, scenicScore: 0.8, surfaceQuality: 0.9, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // Main Library → JCT Central
  { from: "main_library",   to: "jct_central",     lighting: 0.8, weatherCoverage: 0.4, isolation: 0.8, scenicScore: 0.5, surfaceQuality: 0.9, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // JCT Central → IBS Canteen
  { from: "jct_central",    to: "ibs_canteen",     lighting: 0.8, weatherCoverage: 0.5, isolation: 0.8, scenicScore: 0.4, surfaceQuality: 0.9, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // JCT Central → FST
  { from: "jct_central",    to: "fst",             lighting: 0.7, weatherCoverage: 0.3, isolation: 0.7, scenicScore: 0.4, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 1.0, isAccessible: true },
  // JCT Central → JCT North
  { from: "jct_central",    to: "jct_north",       lighting: 0.8, weatherCoverage: 0.3, isolation: 0.7, scenicScore: 0.4, surfaceQuality: 0.9, hasSteps: false, slopeGrade: 1.0, isAccessible: true },
  // JCT North → FMS
  { from: "jct_north",      to: "fms",             lighting: 0.8, weatherCoverage: 0.4, isolation: 0.7, scenicScore: 0.4, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // JCT North → UHWI
  { from: "jct_north",      to: "uhwi",            lighting: 0.9, weatherCoverage: 0.5, isolation: 0.7, scenicScore: 0.3, surfaceQuality: 0.9, hasSteps: false, slopeGrade: 1.0, isAccessible: true },
  // JCT North → Ring Road North
  { from: "jct_north",      to: "ring_road_n",     lighting: 0.7, weatherCoverage: 0.2, isolation: 0.6, scenicScore: 0.4, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 1.5, isAccessible: true },
  // Ring Road North → Sports Complex
  { from: "ring_road_n",    to: "sports_complex",  lighting: 0.6, weatherCoverage: 0.2, isolation: 0.5, scenicScore: 0.7, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // Ring Road North → Chancellor's Hall
  { from: "ring_road_n",    to: "chancellors_hall",lighting: 0.6, weatherCoverage: 0.2, isolation: 0.5, scenicScore: 0.5, surfaceQuality: 0.7, hasSteps: false, slopeGrade: 1.0, isAccessible: true },
  // Ring Road North → North Gate
  { from: "ring_road_n",    to: "north_gate",      lighting: 0.7, weatherCoverage: 0.2, isolation: 0.5, scenicScore: 0.4, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // Sports Complex → Swimming Pool
  { from: "sports_complex", to: "swimming_pool",   lighting: 0.6, weatherCoverage: 0.3, isolation: 0.5, scenicScore: 0.7, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // Sports Complex → Mona Reservoir (scenic but isolated at night)
  { from: "sports_complex", to: "mona_reservoir",  lighting: 0.2, weatherCoverage: 0.0, isolation: 0.2, scenicScore: 1.0, surfaceQuality: 0.5, hasSteps: false, slopeGrade: 3.0, isAccessible: false },
  // Chancellor's Hall → Irvine Hall
  { from: "chancellors_hall",to: "irvine_hall",    lighting: 0.6, weatherCoverage: 0.3, isolation: 0.6, scenicScore: 0.5, surfaceQuality: 0.7, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // Irvine Hall → Taylor Hall
  { from: "irvine_hall",    to: "taylor_hall",     lighting: 0.6, weatherCoverage: 0.3, isolation: 0.6, scenicScore: 0.5, surfaceQuality: 0.7, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // Law Library → JCT South
  { from: "law_library",    to: "jct_south",       lighting: 0.7, weatherCoverage: 0.3, isolation: 0.6, scenicScore: 0.4, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // JCT South → East Gate
  { from: "jct_south",      to: "east_gate",       lighting: 0.7, weatherCoverage: 0.2, isolation: 0.6, scenicScore: 0.3, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 0.0, isAccessible: true },
  // JCT South → Stadium
  { from: "jct_south",      to: "stadium",         lighting: 0.5, weatherCoverage: 0.1, isolation: 0.4, scenicScore: 0.6, surfaceQuality: 0.7, hasSteps: false, slopeGrade: 0.0, isAccessible: true },
  // Chapel → Mona Bowl (scenic path with steps)
  { from: "chapel",         to: "mona_bowl",       lighting: 0.4, weatherCoverage: 0.0, isolation: 0.3, scenicScore: 0.9, surfaceQuality: 0.5, hasSteps: true,  slopeGrade: 9.0, isAccessible: false },
  // FHE → Health Centre
  { from: "fhe",            to: "health_centre",   lighting: 0.7, weatherCoverage: 0.4, isolation: 0.7, scenicScore: 0.4, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // Econ Dept → Law Library
  { from: "econ_dept",      to: "law_library",     lighting: 0.7, weatherCoverage: 0.4, isolation: 0.7, scenicScore: 0.4, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // IBS Canteen → FST
  { from: "ibs_canteen",    to: "fst",             lighting: 0.7, weatherCoverage: 0.4, isolation: 0.7, scenicScore: 0.4, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
  // FST → FMS
  { from: "fst",            to: "fms",             lighting: 0.7, weatherCoverage: 0.3, isolation: 0.6, scenicScore: 0.4, surfaceQuality: 0.8, hasSteps: false, slopeGrade: 1.0, isAccessible: true },
  // UHWI → FMS
  { from: "uhwi",           to: "fms",             lighting: 0.9, weatherCoverage: 0.5, isolation: 0.7, scenicScore: 0.3, surfaceQuality: 0.9, hasSteps: false, slopeGrade: 0.5, isAccessible: true },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);

  // Check if already seeded
  const [rows] = await conn.execute("SELECT COUNT(*) AS cnt FROM pathNodes");
  const count = rows[0].cnt;
  if (count > 0) {
    console.log(`Graph already seeded (${count} nodes). Skipping.`);
    await conn.end();
    return;
  }

  console.log("Seeding UWI Mona campus graph...");

  // Insert nodes
  const nodeIdMap = new Map(); // key → db id
  for (const node of NODES) {
    const [result] = await conn.execute(
      `INSERT INTO pathNodes (name, lat, lng, isLandmark, scenicScore, isAccessible, category, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [node.name, node.lat.toString(), node.lng.toString(), node.isLandmark ? 1 : 0, node.scenicScore, node.isAccessible ? 1 : 0, node.category]
    );
    nodeIdMap.set(node.key, result.insertId);
    console.log(`  Node: ${node.name} (id=${result.insertId})`);
  }

  // Insert edges (bidirectional)
  let edgeCount = 0;
  for (const edge of EDGES_RAW) {
    const fromId = nodeIdMap.get(edge.from);
    const toId = nodeIdMap.get(edge.to);
    if (!fromId || !toId) {
      console.warn(`  SKIP edge ${edge.from}→${edge.to}: node not found`);
      continue;
    }

    const fromNode = NODES.find((n) => n.key === edge.from);
    const toNode = NODES.find((n) => n.key === edge.to);
    const distM = haversineM(fromNode.lat, fromNode.lng, toNode.lat, toNode.lng);
    const walkSec = walkTime(distM);

    const insertEdge = async (fId, tId, slope) => {
      await conn.execute(
        `INSERT INTO pathEdges
           (fromNodeId, toNodeId, distanceM, walkTimeSec, lighting, weatherCoverage, isolation,
            isAccessible, surfaceQuality, scenicScore, hasSteps, slopeGrade,
            confirmedViolenceCount, confirmedHazardCount, isActive, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 1, NOW(), NOW())`,
        [fId, tId, distM, walkSec, edge.lighting, edge.weatherCoverage, edge.isolation,
         edge.isAccessible ? 1 : 0, edge.surfaceQuality, edge.scenicScore,
         edge.hasSteps ? 1 : 0, slope]
      );
    };

    // Forward direction
    await insertEdge(fromId, toId, edge.slopeGrade);
    // Reverse direction (negate slope)
    await insertEdge(toId, fromId, -edge.slopeGrade);
    edgeCount += 2;
  }

  console.log(`\nSeeded ${NODES.length} nodes and ${edgeCount} edges (${edgeCount / 2} bidirectional paths).`);
  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
