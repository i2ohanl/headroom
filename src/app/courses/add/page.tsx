// Direct visit or refresh on /courses/add: the list renders behind the same modal.
import { CoursesView } from "../courses-view";
import { CourseModal } from "../course-modal";
import { AddCourse } from "../add-course";

export default function AddPage() {
  return (
    <>
      <CoursesView />
      <CourseModal>
        <AddCourse />
      </CourseModal>
    </>
  );
}
