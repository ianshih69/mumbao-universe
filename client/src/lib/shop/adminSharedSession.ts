import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getCustomerSupabaseClient, isCustomerAuthConfigError } from "./customerAuthClient";

// The existing customer SDK owns persistence and refresh; Admin only observes it.
let session: Session | null = null;
let client: SupabaseClient | null = null;
let revision = 0;
let observedSession = false;
const listeners = new Set<() => void>();

function receiveSession(next: Session | null, signedOut = false) {
  const changed = !observedSession || session?.access_token !== next?.access_token || signedOut;
  observedSession = true;
  session = next;
  if (!changed) return;
  revision += 1;
  listeners.forEach((listener) => listener());
}

function sharedClient() {
  if (client) return client;
  const next = getCustomerSupabaseClient();
  next.auth.onAuthStateChange((event, nextSession) => {
    receiveSession(nextSession, event === "SIGNED_OUT");
  });
  client = next;
  return next;
}

export function getSharedAdminSession() {
  return session;
}

export function getSharedAdminSessionRevision() {
  return revision;
}

export function subscribeSharedAdminSession(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function readSharedAdminSession() {
  let sdk: SupabaseClient;
  try {
    sdk = sharedClient();
  } catch (error) {
    // Preserve existing standalone Admin login on sites without member Auth config.
    if (isCustomerAuthConfigError(error)) return null;
    throw error;
  }
  const startedAt = revision;
  const { data, error } = await sdk.auth.getSession();
  if (error) {
    if ([400, 401, 403].includes(error.status || 0)) {
      receiveSession(null, true);
      throw Object.assign(new Error("Shared Auth session expired."), { status: 401 });
    }
    throw error;
  }
  if (data.session?.expires_at && data.session.expires_at * 1000 <= Date.now()) {
    receiveSession(null, true);
    throw Object.assign(new Error("Shared Auth session expired."), { status: 401 });
  }
  // A sign-out/account switch during restoration must win over the old response.
  if (startedAt === revision) receiveSession(data.session);
  return session;
}

export async function adoptSharedAdminSession(accessToken: string, refreshToken: string) {
  const { data, error } = await sharedClient().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
  receiveSession(data.session);
}

export async function signOutSharedAdminSession() {
  if (!await readSharedAdminSession()) return;
  const { error } = await sharedClient().auth.signOut({ scope: "local" });
  if (error) throw error;
  receiveSession(null);
}
