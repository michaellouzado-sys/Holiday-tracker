import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Allow CORS from the landing page
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.body || {};
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" });
  }

  try {
    const { error } = await supabase
      .from("waitlist")
      .upsert({ email: email.toLowerCase().trim(), created_at: new Date().toISOString() }, { onConflict: "email" });

    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Waitlist error:", err);
    return res.status(200).json({ ok: true }); // Always return success to user
  }
}
