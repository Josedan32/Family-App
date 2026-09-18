import { redirect } from "next/navigation";

/** The breadcrumb links here; the list itself is a tab of Finanzas. */
export default function Page() {
  redirect("/finanzas?tab=savings");
}
