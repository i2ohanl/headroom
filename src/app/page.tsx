import { redirect } from "next/navigation";

// The proxy sends signed-out visitors to /sign-in before this runs.
export default function Home() {
  redirect("/courses");
}
