import { createClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS so we can look up users and write pending emails
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DOMAIN = "in.allbooked.app";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = req.body;

    // ── 1. Extract the recipient address ─────────────────────────────────────
    // Resend sends 'to' as array or string
    const toRaw = Array.isArray(payload.to) ? payload.to[0] : payload.to;
    const toAddress = typeof toRaw === "object" ? toRaw.email : toRaw;

    if (!toAddress || !toAddress.includes(`@${DOMAIN}`)) {
      console.log("Not an allbooked address:", toAddress);
      return res.status(200).json({ ok: true });
    }

    const addressPrefix = toAddress.split("@")[0].toLowerCase();

    // ── 2. Look up which user owns this address ───────────────────────────────
    const { data: addrRow, error: addrErr } = await supabase
      .from("user_email_addresses")
      .select("user_id")
      .eq("address", addressPrefix)
      .maybeSingle();

    if (addrErr || !addrRow) {
      console.log("No user found for address:", addressPrefix);
      return res.status(200).json({ ok: true });
    }

    const userId = addrRow.user_id;

    // ── 3. Get email content ──────────────────────────────────────────────────
    const fromAddress = typeof payload.from === "object" ? payload.from.email : payload.from;
    const subject = payload.subject || "";
    const bodyText = payload.text || payload.plain || payload.html?.replace(/<[^>]+>/g, " ") || "";

    // ── 4. Send to Claude to extract booking details ──────────────────────────
    const extracted = await extractBookingFromEmail(subject, bodyText);

    // ── 5. Load user's holidays ───────────────────────────────────────────────
    const { data: appData } = await supabase
      .from("app_data")
      .select("data")
      .eq("id", userId)
      .maybeSingle();

    const holidays = appData?.data?.holidays || [];

    // ── 6. Try to match to a holiday by date ─────────────────────────────────
    const bookingDate = extracted.date || extracted.checkIn || extracted.departureDate ||
      extracted.flightDate || extracted.ferryDate || extracted.pickUpDate;

    let matchedHoliday = null;
    if (bookingDate) {
      const d = new Date(bookingDate);
      matchedHoliday = holidays.find(h => {
        if (!h.startDate) return false;
        const start = new Date(h.startDate);
        const end = h.endDate ? new Date(h.endDate) : start;
        // Match if booking date is within 7 days before or during the holiday
        const windowStart = new Date(start);
        windowStart.setDate(windowStart.getDate() - 7);
        return d >= windowStart && d <= end;
      });
    }

    if (!matchedHoliday) {
      // ── 7a. No match — save to pending inbox ─────────────────────────────
      await supabase.from("pending_emails").insert({
        user_id: userId,
        from_address: fromAddress,
        subject,
        body_text: bodyText.slice(0, 5000),
        extracted,
      });
      console.log("No holiday match — saved to pending inbox");
      return res.status(200).json({ ok: true, matched: false });
    }

    // ── 7b. Match found — add or update step ─────────────────────────────────
    const stepType = extracted.stepType || "custom";
    const stepTemplates = {
      flight: { icon: "✈️", label: "Flight" },
      hotel: { icon: "🏨", label: "Hotel" },
      villa: { icon: "🏠", label: "Villa / Apartment" },
      carHire: { icon: "🚗", label: "Car Hire" },
      ferry: { icon: "🚢", label: "Ferry" },
      sailing: { icon: "⛵", label: "Sailing Trip" },
      parking: { icon: "🅿️", label: "Airport Parking" },
      transfer: { icon: "🚕", label: "Transfer" },
      custom: { icon: "📋", label: extracted.provider || subject.slice(0, 30) || "Booking" },
    };

    const template = stepTemplates[stepType] || stepTemplates.custom;

    // Build booking data from extracted fields
    const bookingData = {
      confirmed: true,
      provider: extracted.provider || "",
      reference: extracted.reference || "",
      notes: extracted.notes || `Imported from email: ${subject}`,
      dateBooked: extracted.dateBooked || "",
      // Flight fields
      flightDate: extracted.flightDate || extracted.date || "",
      departureAirport: extracted.departureAirport || "",
      arrivalAirport: extracted.arrivalAirport || "",
      departureTime: extracted.departureTime || "",
      arrivalTime: extracted.arrivalTime || "",
      flightNumber: extracted.flightNumber || "",
      // Hotel/Villa fields
      checkIn: extracted.checkIn || "",
      checkOut: extracted.checkOut || "",
      propertyAddress: extracted.propertyAddress || "",
      // Car hire fields
      pickUpDate: extracted.pickUpDate || "",
      dropOffDate: extracted.dropOffDate || "",
      pickUpLocation: extracted.pickUpLocation || "",
      carType: extracted.carType || "",
      // Ferry/Sailing fields
      ferryDate: extracted.ferryDate || extracted.date || "",
      ferryDepartTime: extracted.departureTime || "",
      ferryArriveTime: extracted.arrivalTime || "",
      sailingReturnDate: extracted.returnDate || "",
      // Transfer fields
      transferDate: extracted.date || "",
      pickupTime: extracted.pickupTime || "",
      pickupLocation: extracted.pickupLocation || "",
      // Parking fields
      carParkName: extracted.carParkName || "",
      terminalName: extracted.terminalName || "",
      parkingEntry: extracted.parkingEntry || "",
      parkingExit: extracted.parkingExit || "",
      // Pricing
      totalPrice: extracted.totalPrice || "",
      stepCurrency: extracted.currency || "GBP",
    };

    // Generate a new step ID
    const stepId = Date.now().toString(36) + Math.random().toString(36).slice(2);

    const newStep = {
      id: stepId,
      icon: template.icon,
      label: template.label,
    };

    // Update the holiday with the new step and booking
    const updatedHolidays = holidays.map(h => {
      if (h.id !== matchedHoliday.id) return h;
      return {
        ...h,
        steps: [...(h.steps || []), newStep],
        bookings: { ...(h.bookings || {}), [stepId]: bookingData },
      };
    });

    await supabase
      .from("app_data")
      .upsert({ id: userId, data: { holidays: updatedHolidays }, updated_at: new Date().toISOString() });

    console.log(`Added ${stepType} step to holiday "${matchedHoliday.name}" for user ${userId}`);
    return res.status(200).json({ ok: true, matched: true, holiday: matchedHoliday.name, stepType });

  } catch (err) {
    console.error("Email webhook error:", err);
    return res.status(200).json({ ok: true, error: err.message }); // always 200 to Resend
  }
}

// ── Claude extraction ─────────────────────────────────────────────────────────
async function extractBookingFromEmail(subject, body) {
  const prompt = `You are extracting travel booking details from a confirmation email.

Subject: ${subject}

Body:
${body.slice(0, 3000)}

Extract all booking details and return ONLY a JSON object with these fields (use empty string if not found):
{
  "stepType": "flight|hotel|villa|carHire|ferry|sailing|parking|transfer|custom",
  "provider": "company or airline name",
  "reference": "booking reference or PNR",
  "date": "YYYY-MM-DD primary date",
  "dateBooked": "YYYY-MM-DD if visible",
  "totalPrice": "numeric amount as string e.g. 450.00",
  "currency": "3-letter code e.g. GBP",
  "notes": "any other useful info",
  "flightDate": "YYYY-MM-DD",
  "departureAirport": "name and IATA e.g. Manchester (MAN)",
  "arrivalAirport": "name and IATA e.g. Athens (ATH)",
  "departureTime": "HH:MM",
  "arrivalTime": "HH:MM",
  "flightNumber": "e.g. BA123",
  "checkIn": "YYYY-MM-DD",
  "checkOut": "YYYY-MM-DD",
  "propertyAddress": "full address",
  "pickUpDate": "YYYY-MM-DD",
  "dropOffDate": "YYYY-MM-DD",
  "pickUpLocation": "location",
  "carType": "e.g. VW Golf",
  "ferryDate": "YYYY-MM-DD",
  "returnDate": "YYYY-MM-DD for sailing return",
  "pickupTime": "HH:MM",
  "pickupLocation": "location",
  "carParkName": "car park name",
  "terminalName": "terminal",
  "parkingEntry": "YYYY-MM-DDTHH:MM",
  "parkingExit": "YYYY-MM-DDTHH:MM"
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.VITE_ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "{}";
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.error("Claude extraction failed:", e);
    return {};
  }
}
