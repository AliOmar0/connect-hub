import { useState, useEffect, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppRole } from "@/types/database";
import { AuthContext, AuthContextType } from "@/contexts/AuthContext";

export function AuthProvider({
  children,
  mockState,
}: {
  children: ReactNode;
  mockState?: AuthContextType;
}) {
  const [user, setUser] = useState<User | null>(mockState?.user ?? null);
  const [session, setSession] = useState<Session | null>(
    mockState?.session ?? null,
  );
  const [userRole, setUserRole] = useState<AppRole | null>(
    mockState?.userRole ?? null,
  );
  const [loading, setLoading] = useState(mockState?.loading ?? true);

  useEffect(() => {
    if (mockState) return;
    let isMounted = true;

    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);

      // Defer role fetch with setTimeout
      if (session?.user) {
        setTimeout(() => {
          if (isMounted) fetchUserRole(session.user.id);
        }, 0);
      } else {
        setUserRole(null);
      }
    });

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserRole(session.user.id);
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [mockState]);

  const fetchUserRole = async (userId: string) => {
    try {
      // First, ensure profile exists (fallback if trigger didn't fire)
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (profileError || !profile) {
        // Profile doesn't exist, create it
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user) {
          const { error: insertError } = await supabase
            .from("profiles")
            .insert({
              user_id: userId,
              email: userData.user.email || "",
              first_name: userData.user.user_metadata?.first_name || "",
              last_name: userData.user.user_metadata?.last_name || "",
            })
            .select()
            .single();

          if (insertError) {
            console.error("Error creating profile:", insertError);
          } else {
            // Also ensure role exists
            const { error: roleError } = await supabase
              .from("user_roles")
              .insert({ user_id: userId, role: "agent" })
              .select()
              .single();

            if (roleError && !roleError.message.includes("duplicate")) {
              console.error("Error creating user role:", roleError);
            }
          }
        }
      }

      // Fetch user role
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data) {
        setUserRole(data.role as AppRole);
      }
    } catch (err) {
      console.error("Error fetching user role:", err);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (
    email: string,
    password: string,
    firstName?: string,
    lastName?: string,
  ) => {
    const redirectUrl = `${window.location.origin}/`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          first_name: firstName,
          last_name: lastName,
        },
      },
    });
    return {
      data: data ? { user: data.user, session: data.session } : null,
      error: error as Error | null,
    };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setUserRole(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, session, userRole, loading, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
