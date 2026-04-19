// api/rates.js
// Fetches live exchange rates from exchangerate-api.com (free tier, no key needed for base endpoint)
// Called by the app to avoid CORS issues

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const base = req.query.base || "GBP";

  try {
    // Uses the free open.er-api.com endpoint — no API key required, updates daily
    const response = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    const data = await response.json();

    if (data.result !== "success") {
      return res.status(502).json({ error: "Rates fetch failed", detail: data });
    }

    // Cache for 6 hours on Vercel edge
    res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate");
    return res.status(200).json({
      base: data.base_code,
      rates: data.rates,
      updatedAt: data.time_last_update_utc,
    });
  } catch (err) {
    console.error("Rates proxy error:", err);
    return res.status(500).json({ error: "Failed to fetch rates" });
  }
}
