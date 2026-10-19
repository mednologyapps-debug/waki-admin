import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { AdminSessionContext } from "../lib/adminSession";

function ProtectedRoute({ children }) {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let mounted = true;

    const validateAdmin = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user) {
          if (mounted) {
            setAuthorized(false);
            setLoading(false);
          }

          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, account_status, full_name")
          .eq("id", session.user.id)
          .single();

        if (profileError || !profile) {
          await supabase.auth.signOut();

          if (mounted) {
            setAuthorized(false);
            setLoading(false);
          }

          return;
        }

        const hasAdminAccess =
          profile.account_status === "active" &&
          (profile.role === "admin" || profile.role === "super_admin");

        if (!hasAdminAccess) {
          await supabase.auth.signOut();
        }

        if (mounted) {
          setAdmin({ user: session.user, profile });
          setAuthorized(hasAdminAccess);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error validando acceso administrativo:", error);

        if (mounted) {
          setAuthorized(false);
          setLoading(false);
        }
      }
    };

    validateAdmin();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) {
          setAuthorized(false);
        }
      },
    );

    return () => {
      mounted = false;

      authListener.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="admin-auth-loading">
        <div className="admin-auth-loader" />

        <span>Validando acceso...</span>
      </div>
    );
  }

  if (!authorized) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AdminSessionContext.Provider value={admin}>
      {children}
    </AdminSessionContext.Provider>
  );
}

export default ProtectedRoute;
