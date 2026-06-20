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
  getAccountRedirectUrl,
  getCustomerAuthErrorMessage,
  getCustomerSupabaseClient,
  normalizeCustomerEmail,
} from "@/lib/shop/customerAuthClient";

type CustomerSignUpInput = {
  email: string;
  password: string;
  name: string;
  phone: string;
};

type CustomerAuthContextValue = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authError: string;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: CustomerSignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
};

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let isMounted = true;

    try {
      const supabase = getCustomerSupabaseClient();

      supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (!isMounted) return;
          if (error) {
            setAuthError(getCustomerAuthErrorMessage(error, "會員登入狀態讀取失敗。"));
          }
          setSession(data.session);
          setUser(data.session?.user || null);
        })
        .catch((error) => {
          if (!isMounted) return;
          setAuthError(getCustomerAuthErrorMessage(error, "會員登入狀態讀取失敗。"));
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
      setAuthError(getCustomerAuthErrorMessage(error, "商城會員 Auth 尚未設定。"));
      setSession(null);
      setUser(null);
      setIsLoading(false);
      return () => {
        isMounted = false;
      };
    }
  }, []);

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
    const { error } = await supabase.auth.signUp({
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
  }, []);

  const signOut = useCallback(async () => {
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

  const value = useMemo<CustomerAuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      isAuthenticated: Boolean(session?.user),
      authError,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updatePassword,
    }),
    [authError, isLoading, sendPasswordReset, session, signIn, signOut, signUp, updatePassword, user]
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
