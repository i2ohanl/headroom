// Soft navigation from /courses: the add-course modal opens over the list.
import { CourseModal } from "../../course-modal";
import { AddCourse } from "../../add-course";

export default function InterceptedAddPage() {
  return (
    <CourseModal intercepted>
      <AddCourse />
    </CourseModal>
  );
}
