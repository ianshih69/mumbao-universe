import { toast } from "sonner";
import { ADMIN_SESSION_KEY } from "../adminStore";
import { adminAuthNoticeKey, clearAdminToken } from "./adminAuth";
import { signOutSharedAdminSession } from "./adminSharedSession";

let loggingOut = false;
let pendingLogout: Promise<boolean> | null = null;

export function isLogoutInProgress() {
  return loggingOut;
}

// Explicit logout owns navigation until the new document loads. Auth-expiry
// listeners must not race it back to a protected page or the Admin login.
export function logoutToHome(signOut = signOutSharedAdminSession): Promise<boolean> {
  if (pendingLogout) return pendingLogout;
  loggingOut = true;
  pendingLogout = Promise.resolve().then(async () => {
    try {
      await signOut();
      clearAdminToken();
      window.sessionStorage.removeItem(adminAuthNoticeKey);
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
      // A new document also discards private React state and in-memory caches.
      window.location.replace("/");
      return true;
    } catch {
      loggingOut = false;
      pendingLogout = null;
      toast.error("登出暫時無法完成，請重試。");
      return false;
    }
  });
  return pendingLogout;
}
