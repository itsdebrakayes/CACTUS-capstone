import bathroomIcon from "@/assets/image/bathroom.png";
import classroomIcon from "@/assets/image/classroom.png";
import facultyIcon from "@/assets/image/faculty.png";
import labIcon from "@/assets/image/lab.png";
import lectureRoomIcon from "@/assets/image/lectureRoom.png";

export function getPlaceMarkerIcon(category: string) {
  switch (category) {
    case "classroom":
      return classroomIcon;
    case "lab":
      return labIcon;
    case "faculty":
      return facultyIcon;
    case "restroom":
    case "bathroom":
      return bathroomIcon;
    case "building":
    case "hall":
    case "library":
    case "office":
    case "landmark":
    case "lecture_room":
    default:
      return lectureRoomIcon;
  }
}
