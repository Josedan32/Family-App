/** Clears the server-side session cookie. Callers still need to navigate
 * away and refresh the router themselves — this only talks to the API. */
export async function logout(): Promise<void> {
  await fetch("/api/session", { method: "DELETE" });
}
