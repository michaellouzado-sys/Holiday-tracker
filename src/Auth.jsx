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
      minHeight: "100vh", background: "#f0f9ff",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      overflowY: "auto", padding: "24px 20px 40px",
      fontFamily: "'DM Sans','Segoe UI',sans-serif"
    }}>
      {/* Background glows */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-200px", right: "-200px", width: "600px", height: "600px", borderRadius: "50%", background: "radial-gradient(circle, #0ea5e920 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: "-100px", left: "-100px", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, #10b98115 0%, transparent 70%)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "400px", paddingTop: "20px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>✈️</div>
          <h1 style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "26px", color: "#0f172a", letterSpacing: "-0.5px" }}>
            <span style={{ color: "#0ea5e9" }}>all</span>booked
          </h1>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: "13px" }}>Your holidays, perfectly organised</p>
        </div>

        {/* Card */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "28px", boxShadow: "0 24px 80px rgba(0,0,0,0.10)" }}>
          <h2 style={{ margin: "0 0 24px", fontSize: "18px", color: "#0f172a", fontWeight: "600" }}>{titles[mode]}</h2>

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
            <div style={{ background: "#ef444422", border: "1px solid #ff4d6644", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", color: "#ef4444", fontSize: "13px" }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{ background: "#10b98122", border: "1px solid #00d4aa44", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", color: "#10b981", fontSize: "13px" }}>
              {message}
              {mode === "login" && (
                <div style={{ marginTop: "8px", color: "#64748b", fontSize: "12px" }}>
                  📬 Can't find the email? Check your junk or spam folder.
                </div>
              )}
            </div>
          )}

          {mode === "signup" && !message && (
            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", color: "#64748b", fontSize: "12px" }}>
              📬 After signing up, you'll receive a confirmation email. If you don't see it, check your junk or spam folder.
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: "100%", padding: "12px",
              background: loading ? "#e2e8f0" : "linear-gradient(135deg, #0ea5e9, #38bdf8)",
              border: "none", borderRadius: "10px", color: "#ffffff",
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
              <button onClick={() => { setMode("reset"); setError(null); setMessage(null); }} style={{ ...linkBtn, color: "#94a3b8" }}>
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
  fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px"
};
const inputStyle = {
  display: "block", width: "100%", marginTop: "6px", padding: "11px 14px",
  background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "8px",
  color: "#0f172a", fontSize: "14px", outline: "none", boxSizing: "border-box"
};
const linkBtn = {
  background: "none", border: "none", color: "#0ea5e9",
  cursor: "pointer", fontSize: "13px", padding: 0
};
