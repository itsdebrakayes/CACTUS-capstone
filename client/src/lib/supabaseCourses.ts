import { supabase } from "@/lib/supabase";

const SUPABASE_COURSE_TABLE = "courses";
const COURSE_SELECT =
  "id,courseCode,courseName,description,room,lecturer,department,classSize,room_source_id,room_lat,room_lng,day_of_week,start_time,end_time";

export interface SupabaseCourseRecord {
  id: number;
  courseCode: string;
  courseName: string;
  description?: string;
  room?: string;
  lecturer?: string;
  department?: string;
  classSize?: number;
  roomSourceId?: string;
  roomLat?: number;
  roomLng?: number;
  dayOfWeek?: string;
  startTime?: string;
  endTime?: string;
}

interface SupabaseCourseRow {
  id?: number | null;
  courseCode?: string | null;
  courseName?: string | null;
  description?: string | null;
  room?: string | null;
  lecturer?: string | null;
  department?: string | null;
  classSize?: number | null;
  room_source_id?: string | null;
  room_lat?: number | null;
  room_lng?: number | null;
  day_of_week?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}

export async function loadSupabaseCourses() {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(`Unable to read Supabase session: ${sessionError.message}`);
  }

  if (!session?.access_token) {
    throw new Error("Supabase session not ready.");
  }

  const { data, error } = await supabase
    .from(SUPABASE_COURSE_TABLE)
    .select(COURSE_SELECT)
    .order("courseCode", { ascending: true });

  if (error) {
    throw new Error(
      `Supabase course request failed (${error.code ?? "unknown"}): ${error.message}`
    );
  }

  return (data ?? []).map(mapCourseRow).filter(Boolean) as SupabaseCourseRecord[];
}

function mapCourseRow(row: SupabaseCourseRow): SupabaseCourseRecord | null {
  if (
    typeof row.id !== "number" ||
    !row.courseCode ||
    !row.courseName
  ) {
    return null;
  }

  return {
    id: row.id,
    courseCode: row.courseCode,
    courseName: row.courseName,
    description: row.description ?? undefined,
    room: row.room ?? undefined,
    lecturer: row.lecturer ?? undefined,
    department: row.department ?? undefined,
    classSize:
      typeof row.classSize === "number" ? row.classSize : undefined,
    roomSourceId: row.room_source_id ?? undefined,
    roomLat: typeof row.room_lat === "number" ? row.room_lat : undefined,
    roomLng: typeof row.room_lng === "number" ? row.room_lng : undefined,
    dayOfWeek: row.day_of_week ?? undefined,
    startTime: row.start_time ?? undefined,
    endTime: row.end_time ?? undefined,
  };
}
