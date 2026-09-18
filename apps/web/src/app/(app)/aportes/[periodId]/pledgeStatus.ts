export type PledgeStatus = "unassigned" | "complete" | "pending";

/** A member with no quota has nothing to complete — 0 of 0 is not "done". */
export function pledgeStatus(pledgedMinor: number, contributedMinor: number): PledgeStatus {
  if (pledgedMinor <= 0) return "unassigned";
  return contributedMinor >= pledgedMinor ? "complete" : "pending";
}
