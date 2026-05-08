const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;
const SUPABASE_HAZARD_TABLE = "crowd_reports";

export interface HazardRecord {
  id: string;
  reportType: string;
  lat: number;
  lng: number;
  severity: number;
  description?: string;
  createdAt?: string;
  status?: string;
}

interface SupabaseHazardRow {
  id?: string;
  report_type?: string | null;
  lat?: number | null;
  lng?: number | null;
  severity?: number | null;
  description?: string | null;
  created_at?: string | null;
  status?: string | null;
}

export async function loadSupabaseHazards() {
  const rows = await requestSupabaseHazards(
    buildHazardUrl({
      select:
        "id,report_type,lat,lng,severity,description,created_at,status",
      order: "created_at.desc",
      status: "eq.active",
    }),
    { method: "GET" }
  );
  return rows.map(mapHazardRow).filter(Boolean) as HazardRecord[];
}

export async function createSupabaseHazard(input: {
  reportType: string;
  lat: number;
  lng: number;
  severity: number;
  description?: string;
}) {
  const rows = await requestSupabaseHazards(buildHazardUrl(), {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify([
      {
        report_type: input.reportType,
        lat: input.lat,
        lng: input.lng,
        severity: input.severity,
        description: input.description?.trim() || null,
        status: "active",
      },
    ]),
  });

  const created = rows.map(mapHazardRow).find(Boolean);
  if (!created) {
    throw new Error("Supabase did not return the created hazard.");
  }

  return created;
}

function buildHazardUrl(params?: Record<string, string>) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase hazard env vars are not configured.");
  }

  const url = new URL(`/rest/v1/${SUPABASE_HAZARD_TABLE}`, SUPABASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function requestSupabaseHazards(url: URL, init: RequestInit) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Supabase hazard env vars are not configured.");
  }

  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase hazard request failed (${response.status}): ${text}`);
  }

  return (await response.json()) as SupabaseHazardRow[];
}

function mapHazardRow(row: SupabaseHazardRow): HazardRecord | null {
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  const severity = Number(row.severity);

  if (
    !row.id ||
    !row.report_type ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(severity)
  ) {
    return null;
  }

  return {
    id: row.id,
    reportType: row.report_type,
    lat,
    lng,
    severity,
    description: row.description ?? undefined,
    createdAt: row.created_at ?? undefined,
    status: row.status ?? undefined,
  };
}
