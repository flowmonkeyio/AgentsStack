import { redirect } from "next/navigation";

/**
 * Redirect /jobs/new to dashboard
 * Job creation is now handled via modal on the dashboard
 */
export default function NewJobPage() {
  redirect("/dashboard?create=job");
}
