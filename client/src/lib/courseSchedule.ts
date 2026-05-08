import type { SupabaseCourseRecord } from "@/lib/supabaseCourses";

export type CourseWithRole = {
  id: number;
  courseCode: string;
  courseName: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  room?: string | null;
  lecturer?: string | null;
  department?: string | null;
  classSize: number;
  isActive: boolean;
  membershipRole?: string;
};

export type ScheduledCourse = CourseWithRole & {
  dayOfWeek?: string;
  startTimeText?: string;
  endTimeText?: string;
  roomSourceId?: string;
  roomLat?: number;
  roomLng?: number;
  startDate?: Date;
  endDate?: Date;
  isLive: boolean;
  isUpcoming: boolean;
};

const DAY_NAME_TO_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function mergeCoursesWithSchedule(
  myCourses: CourseWithRole[],
  supabaseCourses: SupabaseCourseRecord[],
  now = new Date()
) {
  const supabaseByCode = new Map(
    supabaseCourses.map((course) => [course.courseCode.toLowerCase(), course])
  );

  return myCourses
    .map((course) => {
      const scheduleCourse = supabaseByCode.get(course.courseCode.toLowerCase());
      const activeWindow = getActiveWindowForCourse(scheduleCourse, now);

      return {
        ...course,
        dayOfWeek: scheduleCourse?.dayOfWeek,
        startTimeText: scheduleCourse?.startTime,
        endTimeText: scheduleCourse?.endTime,
        roomSourceId: scheduleCourse?.roomSourceId,
        roomLat: scheduleCourse?.roomLat,
        roomLng: scheduleCourse?.roomLng,
        startDate: activeWindow?.startDate,
        endDate: activeWindow?.endDate,
        isLive: activeWindow?.isLive ?? false,
        isUpcoming: activeWindow?.isUpcoming ?? false,
      } satisfies ScheduledCourse;
    })
    .sort((a, b) => {
      const aTime = a.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.startDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
}

export function getCoursesForDay(
  courses: ScheduledCourse[],
  selectedDow: number,
  now = new Date()
) {
  return courses
    .map((course) => {
      const windowForDay = getCourseWindowForDay(
        course.dayOfWeek,
        course.startTimeText,
        course.endTimeText,
        selectedDow,
        now
      );

      return {
        ...course,
        startDate: windowForDay?.startDate,
        endDate: windowForDay?.endDate,
        isLive: windowForDay?.isLive ?? false,
        isUpcoming: windowForDay?.isUpcoming ?? false,
      };
    })
    .filter((course) => course.startDate && course.endDate)
    .sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime());
}

export function formatCourseScheduleLine(course: ScheduledCourse) {
  const dayText = course.dayOfWeek
    ?.split(",")
    .map((day) => day.trim())
    .filter(Boolean)
    .join(" / ");
  const timeText =
    course.startTimeText && course.endTimeText
      ? `${course.startTimeText} - ${course.endTimeText}`
      : undefined;

  return [dayText, timeText].filter(Boolean).join(" - ") || "Schedule not set";
}

function getActiveWindowForCourse(
  course: SupabaseCourseRecord | undefined,
  now: Date
) {
  if (!course?.dayOfWeek || !course.startTime || !course.endTime) {
    return null;
  }

  const dayIndexes = course.dayOfWeek
    .split(",")
    .map((day) => DAY_NAME_TO_INDEX[day.trim().toLowerCase()])
    .filter((value): value is number => Number.isInteger(value));

  const windows = dayIndexes
    .map((dayIndex) =>
      getCourseWindowForDay(course.dayOfWeek, course.startTime, course.endTime, dayIndex, now)
    )
    .filter(Boolean) as Array<{
    startDate: Date;
    endDate: Date;
    isLive: boolean;
    isUpcoming: boolean;
  }>;

  const liveWindow = windows.find((window) => window.isLive);
  if (liveWindow) {
    return liveWindow;
  }

  const upcomingWindows = windows
    .filter((window) => window.startDate.getTime() >= now.getTime())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  return (
    upcomingWindows[0] ??
    windows.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0] ??
    null
  );
}

function getCourseWindowForDay(
  dayOfWeek: string | undefined,
  startTime: string | undefined,
  endTime: string | undefined,
  selectedDow: number,
  now: Date
) {
  if (!dayOfWeek || !startTime || !endTime) {
    return null;
  }

  const supportsDay = dayOfWeek
    .split(",")
    .map((day) => DAY_NAME_TO_INDEX[day.trim().toLowerCase()])
    .includes(selectedDow);

  if (!supportsDay) {
    return null;
  }

  const baseDate = getDateForDayOfWeek(selectedDow, now);
  const startDate = withTime(baseDate, startTime);
  const endDate = withTime(baseDate, endTime);

  return {
    startDate,
    endDate,
    isLive: now >= startDate && now <= endDate,
    isUpcoming: now < startDate,
  };
}

function getDateForDayOfWeek(targetDow: number, now: Date) {
  const currentDow = now.getDay();
  const diff = targetDow - currentDow;
  const date = new Date(now);
  date.setDate(now.getDate() + diff);
  return date;
}

function withTime(baseDate: Date, timeText: string) {
  const [hourText, minuteText] = timeText.split(":");
  const date = new Date(baseDate);
  date.setHours(Number(hourText ?? 0), Number(minuteText ?? 0), 0, 0);
  return date;
}
