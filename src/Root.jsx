import { useState, useEffect } from "react";
import { supabase } from "./supabase.js";
import App from "./App.jsx";
import AuthScreen from "./Auth.jsx";

function SetNewPasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      window.history.replaceState(null, "", window.location.pathname);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#f0f9ff",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px 20px", fontFamily: "'DM Sans','Segoe UI',sans-serif"
    }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>✈️</div>
          <h1 style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "26px", color: "#0f172a" }}>
            <span style={{ color: "#0ea5e9" }}>all</span>booked
          </h1>
        </div>
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "28px", boxShadow: "0 24px 80px rgba(0,0,0,0.10)" }}>
          <h2 style={{ margin: "0 0 24px", fontSize: "18px", color: "#0f172a", fontWeight: "600" }}>
            {done ? "Password updated ✓" : "Set new password"}
          </h2>
          {done ? (
            <p style={{ color: "#64748b", fontSize: "14px" }}>Your password has been updated. You can close this and return to the app.</p>
          ) : (<>
            <label style={{ display: "block", marginBottom: "16px", fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px" }}>
              <span>New password</span>
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                style={{ display: "block", width: "100%", marginTop: "6px", padding: "11px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#0f172a", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
              />
            </label>
            <label style={{ display: "block", marginBottom: "16px", fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px" }}>
              <span>Confirm password</span>
              <input
                type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat password"
                style={{ display: "block", width: "100%", marginTop: "6px", padding: "11px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#0f172a", fontSize: "14px", outline: "none", boxSizing: "border-box" }}
              />
            </label>
            {error && (
              <div style={{ background: "#ef444422", border: "1px solid #ff4d6644", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", color: "#ef4444", fontSize: "13px" }}>
                {error}
              </div>
            )}
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{
                width: "100%", padding: "12px",
                background: loading ? "#e2e8f0" : "linear-gradient(135deg, #0ea5e9, #38bdf8)",
                border: "none", borderRadius: "10px", color: "#ffffff",
                fontSize: "15px", fontWeight: "600", cursor: loading ? "wait" : "pointer"
              }}
            >
              {loading ? "Updating…" : "Update password"}
            </button>
          </>)}
        </div>
      </div>
    </div>
  );
}

function isRecoveryUrl() {
  const hash = window.location.hash;
  return hash.includes("type=recovery") || hash.includes("type=passwordrecovery");
}

export default function Root() {
  const [session, setSession] = useState(undefined);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(isRecoveryUrl());

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordRecovery(true);
      } else if (event === "USER_UPDATED") {
        setIsPasswordRecovery(false);
      }
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined && !isPasswordRecovery) {
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

  if (isPasswordRecovery) return <SetNewPasswordScreen />;
  if (!session) return <AuthScreen />;
  return <App user={session.user} />;
}
