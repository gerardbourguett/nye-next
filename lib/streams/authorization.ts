export type IdentityResult = { userId: string | null; error: boolean };
export type MembershipResult = { userId: string | null; error: boolean };
export type Access = "admin" | "unauthenticated" | "forbidden" | "unavailable";

/** Dependencies are trusted server adapters, not user-supplied claims or metadata. */
export async function authorizeAdmin(
  getVerifiedIdentity: () => Promise<IdentityResult>,
  getMembership: (userId: string) => Promise<MembershipResult>,
): Promise<Access> {
  try {
    const identity = await getVerifiedIdentity();
    if (identity.error || !identity.userId) return "unauthenticated";
    const membership = await getMembership(identity.userId);
    if (membership.error) return "unavailable";
    return membership.userId === identity.userId ? "admin" : "forbidden";
  } catch { return "unavailable"; }
}
