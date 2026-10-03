// Soft navigation from /courses: the add-course modal opens over the list.
import { CourseModal } from "../../course-modal";
import { AddCourse } from "../../add-course";

export default async function InterceptedAddPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <CourseModal intercepted>
      <AddCourse initialCode={code} />
    </CourseModal>
  );
}
