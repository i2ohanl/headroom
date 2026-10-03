"use client";

import { createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const CloseContext = createContext<() => void>(() => {});

// Lets content inside the modal close it (after adding a course, or from a button).
export const useCloseModal = () => useContext(CloseContext);

// Closes by going back when the modal was opened from /courses, and by replacing the URL
// when the page was loaded directly, so "back" never leaves the app.
export function CourseModal({
  children,
  intercepted = false,
}: {
  children: React.ReactNode;
  intercepted?: boolean;
}) {
  const router = useRouter();
  const close = () => (intercepted ? router.back() : router.replace("/courses"));

  return (
    <CloseContext.Provider value={close}>
      <Dialog open onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-6 sm:max-w-[720px] sm:p-10">
          {children}
        </DialogContent>
      </Dialog>
    </CloseContext.Provider>
  );
}
