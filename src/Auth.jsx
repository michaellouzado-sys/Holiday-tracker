import { useState } from "react";
import { supabase } from "./supabase.js";

export default function AuthScreen() {
  const [mode, setMode] = useState("login"); // login | signup | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  async function handleSubmit() {
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        if (!name.trim()) throw new Error("Please enter your name");
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: name.trim() } }
        });
        if (error) throw error;
        setMessage("Check your email for a confirmation link, then come back to log in.");
        setMode("login");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMessage("Password reset email sent — check your inbox.");
        setMode("login");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const titles = { login: "Welcome back", signup: "Create account", reset: "Reset password" };
  const btnLabels = { login: "Log in", signup: "Create account", reset: "Send reset email" };

  return (
    <div style={{
      minHeight: "100vh", background: "#080814",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px", fontFamily: "'DM Sans','Segoe UI',sans-serif"
    }}>
      {/* Background glows */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-200px", right: "-200px", width: "600px", height: "600px", borderRadius: "50%", background: "radial-gradient(circle, #6c63ff15 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: "-100px", left: "-100px", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, #00d4aa10 0%, transparent 70%)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "400px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "48px", marginBottom: "12px" }}>✈️</div>
          <h1 style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "28px", color: "#fff", letterSpacing: "-0.5px" }}>
            My <span style={{ color: "#6c63ff" }}>Holidays</span>
          </h1>
          <p style={{ margin: "8px 0 0", color: "#444", fontSize: "14px" }}>Plan, track and remember every trip</p>
        </div>

        {/* Card */}
        <div style={{ background: "#12121f", border: "1px solid #2a2a45", borderRadius: "16px", padding: "28px", boxShadow: "0 24px 80px rgba(0,0,0,0.5)" }}>
          <h2 style={{ margin: "0 0 24px", fontSize: "18px", color: "#fff", fontWeight: "600" }}>{titles[mode]}</h2>

          {mode === "signup" && (
            <label style={labelStyle}>
              <span>Your name</span>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Mike" autoFocus
                style={inputStyle}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
              />
            </label>
          )}

          <label style={labelStyle}>
            <span>Email</span>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus={mode !== "signup"}
              style={inputStyle}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
            />
          </label>

          {mode !== "reset" && (
            <label style={labelStyle}>
              <span>Password</span>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Min. 6 characters" : "••••••••"}
                style={inputStyle}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
              />
            </label>
          )}

          {error && (
            <div style={{ background: "#ff4d6622", border: "1px solid #ff4d6644", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", color: "#ff4d66", fontSize: "13px" }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{ background: "#00d4aa22", border: "1px solid #00d4aa44", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", color: "#00d4aa", fontSize: "13px" }}>
              {message}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: "100%", padding: "12px",
              background: loading ? "#2a2a45" : "linear-gradient(135deg, #6c63ff, #a78bfa)",
              border: "none", borderRadius: "10px", color: "#fff",
              fontSize: "15px", fontWeight: "600", cursor: loading ? "wait" : "pointer",
              marginBottom: "16px"
            }}
          >
            {loading ? "Please wait…" : btnLabels[mode]}
          </button>

          {/* Mode switchers */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center" }}>
            {mode === "login" && (<>
              <button onClick={() => { setMode("signup"); setError(null); setMessage(null); }} style={linkBtn}>
                Don't have an account? Sign up
              </button>
              <button onClick={() => { setMode("reset"); setError(null); setMessage(null); }} style={{ ...linkBtn, color: "#444" }}>
                Forgot password?
              </button>
            </>)}
            {mode === "signup" && (
              <button onClick={() => { setMode("login"); setError(null); setMessage(null); }} style={linkBtn}>
                Already have an account? Log in
              </button>
            )}
            {mode === "reset" && (
              <button onClick={() => { setMode("login"); setError(null); setMessage(null); }} style={linkBtn}>
                Back to log in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block", marginBottom: "16px",
  fontSize: "11px", color: "#555", textTransform: "uppercase", letterSpacing: "0.8px"
};
const inputStyle = {
  display: "block", width: "100%", marginTop: "6px", padding: "11px 14px",
  background: "#1a1a2e", border: "1px solid #2a2a45", borderRadius: "8px",
  color: "#fff", fontSize: "14px", outline: "none", boxSizing: "border-box"
};
const linkBtn = {
  background: "none", border: "none", color: "#6c63ff",
  cursor: "pointer", fontSize: "13px", padding: 0
};
