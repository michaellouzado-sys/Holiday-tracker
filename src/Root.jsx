import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import App from "./App.jsx";
import AuthScreen from "./Auth.jsx";

export default function Root() {
  const [session, setSession] = useState(undefined); // undefined = loading

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Loading
  if (session === undefined) {
    return (
      <div style={{
        minHeight: "100vh", background: "#080814",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'DM Sans','Segoe UI',sans-serif"
      }}>
        <div style={{ color: "#6c63ff", fontSize: "24px" }}>✈️ Loading…</div>
      </div>
    );
  }

  if (!session) return <AuthScreen />;
  return <App user={session.user} />;
}
