import type { Access } from "./authorization";

type Credentials = { email: string; password: string };
type FailureCode = "credentials" | "setup" | "authentication_unavailable" |
  "membership_missing" | "permissions_unavailable" | "session_unverified";
export type LoginResult =
  | { ok: true; code: "admin"; message: string }
  | { ok: false; code: FailureCode; message: string; cleanupFailed?: true };

export type LoginGateway = {
  signIn: (credentials: Credentials) => Promise<{ error: boolean }>;
  checkAccess: () => Promise<Access | "setup">;
  signOut: () => Promise<{ error: boolean }>;
};

const messages: Record<FailureCode, string> = {
  credentials: "Unable to sign in. Check your email and password or contact the site owner.",
  setup: "Admin sign-in is not configured. Ask the site owner to check the Supabase environment configuration.",
  authentication_unavailable: "The sign-in request could not be completed. Try again shortly or contact the site owner.",
  membership_missing: "Your sign-in was verified, but this account has no admin membership. Ask the site owner to grant your existing user access in public.stream_admins through the Supabase dashboard. No new account is needed.",
  permissions_unavailable: "Your sign-in succeeded, but admin permissions could not be verified. Ask the site owner to check the database setup and access to public.stream_admins, then try again.",
  session_unverified: "Your sign-in succeeded, but the session could not be revalidated. Try signing in again or contact the site owner.",
};

const failure = (code: FailureCode): Extract<LoginResult, { ok: false }> => ({ ok: false, code, message: messages[code] });

/** Only trusted server adapters supply authentication and membership outcomes. */
export async function runAdminLogin(
  credentials: Credentials,
  createGateway: () => Promise<LoginGateway | null>,
): Promise<LoginResult> {
  if (!credentials.email || credentials.email.length > 254 || !credentials.password || credentials.password.length > 1024) {
    return failure("credentials");
  }
  let gateway: LoginGateway;
  try {
    const configured = await createGateway();
    if (!configured) return failure("setup");
    gateway = configured;
    // All returned Auth rejections remain generic, including unconfirmed email.
    if ((await gateway.signIn(credentials)).error) return failure("credentials");
  } catch { return failure("authentication_unavailable"); }

  let access: Access | "setup";
  try { access = await gateway.checkAccess(); }
  catch { access = "unavailable"; }
  if (access === "admin") return { ok: true, code: "admin", message: "Admin access verified." };

  const denied = failure(access === "forbidden" ? "membership_missing"
    : access === "setup" ? "setup"
      : access === "unauthenticated" ? "session_unverified" : "permissions_unavailable");
  try {
    if (!(await gateway.signOut()).error) return denied;
  } catch { /* A cleanup failure must never turn denied access into success. */ }
  return { ...denied, cleanupFailed: true,
    message: `${denied.message} Session sign-out could not be confirmed. Admin access remains denied; reload and try signing out again.` };
}
