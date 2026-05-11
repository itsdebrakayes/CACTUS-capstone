import crowdReportIcon from "@/assets/image/multiple-users-silhouette.png";
import { getCategoryMeta } from "@/lib/campusPlaces";
import atmMarkerIcon from "@/assets/image/atm-marker.svg";
import bathroomIcon from "@/assets/image/bathroom.png";
import classroomIcon from "@/assets/image/classroom.png";
import facultyIcon from "@/assets/image/faculty.png";
import foodMarkerIcon from "@/assets/image/food-marker.svg";
import highTideIcon from "@/assets/image/high-tide.png";
import hallMarkerIcon from "@/assets/image/hall-marker.svg";
import labIcon from "@/assets/image/lab.png";
import lectureRoomIcon from "@/assets/image/lectureRoom.png";
import obstructionIcon from "@/assets/image/obstruction.png";
import potholeIcon from "@/assets/image/pothole.png";
import roadCrackIcon from "@/assets/image/road (1).png";
import roadHazardIcon from "@/assets/image/road.png";
import studyAreaMarkerIcon from "@/assets/image/study-area-marker.svg";
import suspiciousManIcon from "@/assets/image/suspicious-man.png";

export function getPlaceMarkerIcon(category: string) {
  switch (normalizePlaceIconCategory(category)) {
    case "atm":
      return atmMarkerIcon;
    case "classroom":
      return classroomIcon;
    case "food":
      return foodMarkerIcon;
    case "lab":
      return labIcon;
    case "faculty":
      return facultyIcon;
    case "study_area":
      return studyAreaMarkerIcon;
    case "restroom":
    case "bathroom":
      return bathroomIcon;
    case "building":
    case "hall":
      return hallMarkerIcon;
    case "library":
    case "office":
    case "landmark":
    case "lecture_room":
    default:
      return lectureRoomIcon;
  }
}

function normalizePlaceIconCategory(category: string) {
  return category.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function createCampusPlaceMarkerElement(params: {
  category: string;
  title: string;
  isSelected?: boolean;
}) {
  const { category, title, isSelected = false } = params;
  const meta = getCategoryMeta(category);
  const iconSrc = getPlaceMarkerIcon(category);
  const element = document.createElement("button");
  element.type = "button";
  element.title = `${title} (${meta.label})`;
  element.setAttribute("aria-label", `${title} (${meta.label})`);
  element.style.cssText = [
    "width:32px",
    "height:32px",
    "border-radius:999px",
    "padding:0",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:#ffffff",
    `border:${isSelected ? "2px solid #2563eb" : `1.5px solid ${meta.color}33`}`,
    `box-shadow:${isSelected ? "0 0 0 3px rgba(37,99,235,0.22), 0 8px 18px rgba(15,23,42,0.18)" : "0 4px 12px rgba(15,23,42,0.16)"}`,
    "cursor:pointer",
  ].join(";");

  const icon = document.createElement("img");
  icon.src = iconSrc;
  icon.alt = meta.label;
  icon.style.cssText = [
    "width:18px",
    "height:18px",
    "object-fit:contain",
    "display:block",
    "pointer-events:none",
  ].join(";");
  element.appendChild(icon);

  return element;
}

export function createCrowdReportMarkerElement(params: {
  title: string;
  reportType?: string;
  severity?: number;
}) {
  const { title, reportType, severity = 3 } = params;
  const ringColor =
    severity >= 4
      ? "#dc2626"
      : severity === 3
        ? "#ef4444"
        : severity === 2
          ? "#f97316"
          : "#fbbf24";
  const iconSrc = getCrowdReportMarkerIcon(reportType);

  const element = document.createElement("button");
  element.type = "button";
  element.title = title;
  element.setAttribute("aria-label", title);
  element.style.cssText = [
    "width:34px",
    "height:34px",
    "border-radius:999px",
    "padding:0",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:#ffffff",
    `border:2px solid ${ringColor}`,
    "box-shadow:0 8px 20px rgba(15,23,42,0.18)",
    "cursor:pointer",
  ].join(";");

  const icon = document.createElement("img");
  icon.src = iconSrc;
  icon.alt = "Crowd report";
  icon.style.cssText = [
    "width:18px",
    "height:18px",
    "object-fit:contain",
    "display:block",
    "pointer-events:none",
  ].join(";");
  element.appendChild(icon);

  return element;
}

export function createWalkGroupMeetingMarkerElement(params?: {
  title?: string;
  isSelected?: boolean;
}) {
  const { title = "Walk group meeting point", isSelected = false } = params ?? {};
  const element = document.createElement("button");
  element.type = "button";
  element.title = title;
  element.setAttribute("aria-label", title);
  element.style.cssText = [
    "width:40px",
    "height:40px",
    "border-radius:999px",
    "padding:0",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:#ffffff",
    `border:${isSelected ? "2px solid #00a844" : "2px solid #ffffff"}`,
    `box-shadow:${isSelected ? "0 0 0 3px rgba(0,168,68,0.2), 0 10px 24px rgba(0,200,83,0.24)" : "0 10px 24px rgba(0,200,83,0.22)"}`,
    "cursor:pointer",
    "position:relative",
  ].join(";");

  const icon = document.createElement("img");
  icon.src = crowdReportIcon;
  icon.alt = "Walk group";
  icon.style.cssText = [
    "width:20px",
    "height:20px",
    "object-fit:contain",
    "display:block",
    "pointer-events:none",
  ].join(";");
  element.appendChild(icon);

  return element;
}

function getCrowdReportMarkerIcon(reportType?: string) {
  switch ((reportType ?? "").toLowerCase()) {
    case "suspicious":
    case "suspicious_person":
    case "dangerous":
      return suspiciousManIcon;
    case "obstruction":
    case "footpath_blocked":
    case "blocked_path":
      return obstructionIcon;
    case "pothole":
      return potholeIcon;
    case "flooding":
    case "flood":
    case "rainy":
      return highTideIcon;
    case "broken_path":
      return roadCrackIcon;
    case "light_out":
    case "broken_light":
    default:
      return roadHazardIcon;
  }
}
