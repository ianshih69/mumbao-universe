import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  createCustomerEmailMayExistError,
  getAccountRedirectUrl,
  getCustomerAuthErrorMessage,
  getCustomerSupabaseClient,
  normalizeCustomerEmail,
} from "@/lib/shop/customerAuthClient";
import {
  fetchCustomerProfile,
  updateCustomerProfile,
  type CustomerProfile,
  type CustomerProfileUpdatePayload,
} from "@/lib/shop/customerProfileApi";

type CustomerSignUpInput = {
  email: string;
  password: string;
  name: string;
  phone: string;
};

type CustomerAuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: CustomerProfile | null;
  isLoading: boolean;
  isProfileLoading: boolean;
  isAuthenticated: boolean;
  authError: string;
  profileError: string;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: CustomerSignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  refreshProfile: () => Promise<CustomerProfile | null>;
  updateProfile: (payload: CustomerProfileUpdatePayload) => Promise<CustomerProfile>;
};

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

function getProfileErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "會員資料暫時無法讀取，請稍後再試。";
}

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    let isMounted = true;

    try {
      const supabase = getCustomerSupabaseClient();

      supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (!isMounted) return;
          if (error) {
            setAuthError(getCustomerAuthErrorMessage(error, "會員登入狀態暫時無法讀取。"));
          }
          setSession(data.session);
          setUser(data.session?.user || null);
        })
        .catch((error) => {
          if (!isMounted) return;
          setAuthError(getCustomerAuthErrorMessage(error, "會員登入狀態暫時無法讀取。"));
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!isMounted) return;
        setSession(nextSession);
        setUser(nextSession?.user || null);
        setIsLoading(false);
        setAuthError("");
      });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    } catch (error) {
      setAuthError(getCustomerAuthErrorMessage(error, "會員 Auth 設定暫時無法使用。"));
      setSession(null);
      setUser(null);
      setProfile(null);
      setIsLoading(false);
      setIsProfileLoading(false);
      return () => {
        isMounted = false;
      };
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;
    const accessToken = session?.access_token;

    if (!accessToken) {
      setProfile(null);
      setProfileError("");
      setIsProfileLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    setIsProfileLoading(true);
    setProfileError("");

    fetchCustomerProfile(accessToken)
      .then((nextProfile) => {
        if (!isCurrent) return;
        setProfile(nextProfile);
      })
      .catch((error) => {
        if (!isCurrent) return;
        setProfile(null);
        setProfileError(getProfileErrorMessage(error));
      })
      .finally(() => {
        if (isCurrent) setIsProfileLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [session?.access_token]);

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getCustomerSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeCustomerEmail(email),
      password,
    });

    if (error) throw error;
  }, []);

  const signUp = useCallback(async ({ email, password, name, phone }: CustomerSignUpInput) => {
    const supabase = getCustomerSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: normalizeCustomerEmail(email),
      password,
      options: {
        data: {
          name: name.trim(),
          phone: phone.trim(),
        },
        emailRedirectTo: getAccountRedirectUrl("/account/login?verified=1"),
      },
    });

    if (error) throw error;
    if (!data.user && !data.session) throw createCustomerEmailMayExistError();
  }, []);

  const signOut = useCallback(async () => {
    setProfile(null);
    setProfileError("");
    const supabase = getCustomerSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const supabase = getCustomerSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeCustomerEmail(email), {
      redirectTo: getAccountRedirectUrl("/account/reset-password"),
    });

    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const supabase = getCustomerSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.access_token) {
      setProfile(null);
      return null;
    }

    setIsProfileLoading(true);
    setProfileError("");

    try {
      const nextProfile = await fetchCustomerProfile(session.access_token);
      setProfile(nextProfile);
      return nextProfile;
    } catch (error) {
      setProfile(null);
      setProfileError(getProfileErrorMessage(error));
      return null;
    } finally {
      setIsProfileLoading(false);
    }
  }, [session?.access_token]);

  const updateProfile = useCallback(
    async (payload: CustomerProfileUpdatePayload) => {
      if (!session?.access_token) {
        throw new Error("請先登入會員。");
      }

      const nextProfile = await updateCustomerProfile(session.access_token, payload);
      setProfile(nextProfile);
      setProfileError("");
      return nextProfile;
    },
    [session?.access_token],
  );

  const value = useMemo<CustomerAuthContextValue>(
    () => ({
      user,
      session,
      profile,
      isLoading,
      isProfileLoading,
      isAuthenticated: Boolean(session?.user),
      authError,
      profileError,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updatePassword,
      refreshProfile,
      updateProfile,
    }),
    [
      authError,
      isLoading,
      isProfileLoading,
      profile,
      profileError,
      refreshProfile,
      sendPasswordReset,
      session,
      signIn,
      signOut,
      signUp,
      updatePassword,
      updateProfile,
      user,
    ],
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth() {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error("useCustomerAuth must be used within CustomerAuthProvider.");
  }
  return context;
}
