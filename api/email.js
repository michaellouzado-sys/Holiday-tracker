import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DOMAIN = "in.allbooked.app";
const resendClient = new Resend(process.env.RESEND_API_KEY);

function log(step, data) {
  console.log(`[email-webhook] ${step}:`, JSON.stringify(data, null, 2));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  log("RAW_PAYLOAD_KEYS", Object.keys(req.body || {}));
  log("RAW_TO", req.body?.to);
  log("RAW_FROM", req.body?.from);
  log("RAW_SUBJECT", req.body?.subject);
  log("BODY_TEXT_LENGTH", (req.body?.text || req.body?.plain || "").length);
  log("BODY_HTML_LENGTH", (req.body?.html || "").length);

  try {
    const payload = req.body;

    // ── 1. Extract recipient address ─────────────────────────────────────────
    // Resend inbound webhook wraps payload in payload.data for email.received events
    const data = payload.data || payload;
    log("DATA_KEYS", Object.keys(data));

    // Search all possible locations for the allbooked address
    const findAllbookedAddress = (obj) => {
      if (!obj) return null;
      const toField = obj.to;
      const candidates = Array.isArray(toField) ? toField : [toField];
      for (const c of candidates) {
        const addr = typeof c === "object" ? c?.email : c;
        if (addr && addr.includes(`@${DOMAIN}`)) return addr;
      }
      return null;
    };

    // Try top-level, data-wrapped, and headers
    const toAddress = findAllbookedAddress(payload) ||
                      findAllbookedAddress(data) ||
                      findAllbookedAddress(data.headers) ||
                      null;

    log("RESOLVED_TO", toAddress);
    log("ALL_TO_FIELDS", { top: payload.to, data: data.to, headers: data.headers?.to });

    if (!toAddress) {
      log("SKIP", `No allbooked address found in payload`);
      return res.status(200).json({ ok: true, skip: "not_allbooked_address" });
    }

    const addressPrefix = toAddress.split("@")[0].toLowerCase();
    log("ADDRESS_PREFIX", addressPrefix);

    // ── 2. Look up user ───────────────────────────────────────────────────────
    const { data: addrRow, error: addrErr } = await supabase
      .from("user_email_addresses")
      .select("user_id")
      .eq("address", addressPrefix)
      .maybeSingle();

    log("ADDRESS_LOOKUP", { found: !!addrRow, error: addrErr?.message });

    if (addrErr || !addrRow) {
      log("SKIP", `No user found for address prefix: ${addressPrefix}`);
      return res.status(200).json({ ok: true, skip: "no_user_for_address" });
    }

    const userId = addrRow.user_id;
    log("USER_ID", userId);

    // ── 3. Get email content ─────────────────────────────────────────────────
    const fromRaw = data.from || payload.from;
    const fromAddress = typeof fromRaw === "object" ? fromRaw.email : (fromRaw || "");
    const subject = data.subject || payload.subject || "";
    const emailId = data.email_id || data.id;
    // Resend webhook metadata only — use SDK to fetch body and attachments
    let bodyText = "";
    let pdfBase64 = null;

    if (emailId) {
      // Fetch email body using Resend SDK
      log("FETCHING_EMAIL_BODY", emailId);
      try {
        const { data: emailContent, error: emailErr } = await resendClient.emails.receiving.get(emailId);
        log("EMAIL_FETCH_RESULT", { hasData: !!emailContent, error: emailErr?.message });
        if (emailContent) {
          log("EMAIL_CONTENT_KEYS", Object.keys(emailContent));
          const rawHtml = emailContent.html || "";
          const rawText = emailContent.text || "";
          bodyText = rawText || rawHtml.replace(/<[^>]+>/g, " ") || "";
          log("EMAIL_BODY_LENGTH", bodyText.length);
        }
      } catch (e) {
        log("EMAIL_FETCH_ERROR", e.message);
      }

      // Fetch PDF attachments if body is empty
      if (!bodyText.trim() && data.attachments?.length > 0) {
        log("FETCHING_ATTACHMENTS", data.attachments.map(a => a.filename));
        try {
          const { data: attachments, error: attListErr } = await resendClient.emails.receiving.attachments.list({ emailId });
          log("ATTACHMENTS_LIST_RESULT", { count: attachments?.length, error: attListErr?.message });
          for (const att of (attachments || [])) {
            if (att.filename?.toLowerCase().endsWith(".pdf") && att.download_url) {
              log("DOWNLOADING_PDF", att.filename);
              const pdfResp = await fetch(att.download_url);
              const pdfBuf = await pdfResp.arrayBuffer();
              pdfBase64 = Buffer.from(pdfBuf).toString("base64");
              log("PDF_DOWNLOADED_BYTES", pdfBuf.byteLength);
              break;
            }
          }
        } catch (e) {
          log("ATTACHMENTS_ERROR", e.message);
        }
      }
    }

    log("EMAIL_CONTENT_DETAIL", {
      from: fromAddress, subject,
      bodyLength: bodyText.length,
      hasPdf: !!pdfBase64,
      emailId
    });
    // ── 4. Extract with Claude ───────────────────────────────────────────────
    let extracted;
    if (!bodyText.trim() && pdfBase64) {
      log("CLAUDE_EXTRACTION", "extracting from PDF attachment...");
      extracted = await extractBookingFromPDF(pdfBase64, subject);
    } else {
      log("CLAUDE_EXTRACTION", `extracting from body (${bodyText.length} chars)...`);
      extracted = await extractBookingFromEmail(subject, bodyText);
    }
    log("CLAUDE_EXTRACTED", extracted);

    // ── 5. Load holidays ──────────────────────────────────────────────────────
    const { data: appData, error: dataErr } = await supabase
      .from("app_data")
      .select("data")
      .eq("id", userId)
      .maybeSingle();

    log("HOLIDAYS_LOAD", { found: !!appData, error: dataErr?.message });

    const holidays = appData?.data?.holidays || [];
    log("HOLIDAYS_COUNT", holidays.length);
    log("HOLIDAYS_DATES", holidays.map(h => ({ name: h.name, start: h.startDate, end: h.endDate })));

    // ── 6. Match to holiday ───────────────────────────────────────────────────
    const bookingDate = extracted.date || extracted.checkIn || extracted.departureDate ||
      extracted.flightDate || extracted.ferryDate || extracted.pickUpDate;

    log("BOOKING_DATE", bookingDate);

    let matchedHoliday = null;
    if (bookingDate) {
      const d = new Date(bookingDate);
      holidays.forEach(h => {
        if (!h.startDate) return;
        const start = new Date(h.startDate);
        const end = h.endDate ? new Date(h.endDate) : start;
        const windowStart = new Date(start);
        windowStart.setDate(windowStart.getDate() - 7);
        const matches = d >= windowStart && d <= end;
        log("HOLIDAY_MATCH_CHECK", { holiday: h.name, bookingDate, windowStart: windowStart.toISOString().slice(0,10), end: end.toISOString().slice(0,10), matches });
        if (matches && !matchedHoliday) matchedHoliday = h;
      });
    }

    log("MATCHED_HOLIDAY", matchedHoliday?.name || "none");

    if (!matchedHoliday) {
      const { error: insertErr } = await supabase.from("pending_emails").insert({
        user_id: userId,
        from_address: fromAddress,
        subject,
        body_text: bodyText.slice(0, 5000),
        extracted,
      });
      log("PENDING_INSERT", { error: insertErr?.message || "ok" });
      return res.status(200).json({ ok: true, matched: false, bookingDate, holidays: holidays.length });
    }

    // ── 7. Add step to holiday ────────────────────────────────────────────────
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
    log("STEP_TYPE", { stepType, template });

    const bookingData = {
      confirmed: true,
      provider: extracted.provider || "",
      reference: extracted.reference || "",
      notes: extracted.notes || `Imported from email: ${subject}`,
      dateBooked: extracted.dateBooked || "",
      flightDate: extracted.flightDate || extracted.date || "",
      departureAirport: extracted.departureAirport || "",
      arrivalAirport: extracted.arrivalAirport || "",
      departureTime: extracted.departureTime || "",
      arrivalTime: extracted.arrivalTime || "",
      flightNumber: extracted.flightNumber || "",
      checkIn: extracted.checkIn || "",
      checkOut: extracted.checkOut || "",
      propertyAddress: extracted.propertyAddress || "",
      pickUpDate: extracted.pickUpDate || "",
      dropOffDate: extracted.dropOffDate || "",
      pickUpLocation: extracted.pickUpLocation || "",
      carType: extracted.carType || "",
      ferryDate: extracted.ferryDate || extracted.date || "",
      ferryDepartTime: extracted.departureTime || "",
      ferryArriveTime: extracted.arrivalTime || "",
      sailingReturnDate: extracted.returnDate || "",
      transferDate: extracted.date || "",
      pickupTime: extracted.pickupTime || "",
      pickupLocation: extracted.pickupLocation || "",
      carParkName: extracted.carParkName || "",
      terminalName: extracted.terminalName || "",
      parkingEntry: extracted.parkingEntry || "",
      parkingExit: extracted.parkingExit || "",
      totalPrice: extracted.totalPrice || "",
      stepCurrency: extracted.currency || "GBP",
    };

    const stepId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const newStep = { id: stepId, icon: template.icon, label: template.label };

    const updatedHolidays = holidays.map(h => {
      if (h.id !== matchedHoliday.id) return h;
      return {
        ...h,
        steps: [...(h.steps || []), newStep],
        bookings: { ...(h.bookings || {}), [stepId]: bookingData },
      };
    });

    const { error: upsertErr } = await supabase
      .from("app_data")
      .upsert({ id: userId, data: { holidays: updatedHolidays }, updated_at: new Date().toISOString() });

    log("UPSERT", { error: upsertErr?.message || "ok" });
    log("SUCCESS", { holiday: matchedHoliday.name, stepType, stepId });

    return res.status(200).json({ ok: true, matched: true, holiday: matchedHoliday.name, stepType });

  } catch (err) {
    log("ERROR", { message: err.message, stack: err.stack });
    return res.status(200).json({ ok: true, error: err.message });
  }
}

async function extractBookingFromPDF(base64Content, subject) {
  // Extract booking details directly from PDF in a single Claude call
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: base64Content }
            },
            { type: "text", text: `Extract travel booking details from this confirmation PDF and return ONLY a JSON object:
{
  "stepType": "flight|hotel|villa|carHire|ferry|sailing|parking|transfer|custom",
  "provider": "company or airline name",
  "reference": "booking reference or PNR",
  "date": "YYYY-MM-DD primary date",
  "totalPrice": "numeric amount e.g. 450.00",
  "currency": "3-letter code e.g. GBP",
  "notes": "fare class, cabin, extras",
  "flightDate": "YYYY-MM-DD",
  "departureAirport": "name and IATA e.g. Athens (ATH)",
  "arrivalAirport": "name and IATA e.g. Corfu (CFU)",
  "departureTime": "HH:MM",
  "arrivalTime": "HH:MM",
  "flightNumber": "e.g. A3284",
  "checkIn": "YYYY-MM-DD",
  "checkOut": "YYYY-MM-DD",
  "propertyAddress": "",
  "pickUpDate": "YYYY-MM-DD",
  "dropOffDate": "YYYY-MM-DD",
  "pickUpLocation": "",
  "carType": "",
  "ferryDate": "YYYY-MM-DD",
  "returnDate": "YYYY-MM-DD",
  "pickupTime": "HH:MM",
  "pickupLocation": "",
  "carParkName": "",
  "terminalName": "",
  "parkingEntry": "",
  "parkingExit": ""
}` }
          ]
        }]
      }),
    });
    const data = await response.json();
    const text = data.content?.[0]?.text || "{}";
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (e) {
    return {};
  }
}

async function extractBookingFromEmail(subject, body) {
  // Aggressive HTML cleaning — remove non-content sections then strip all tags
  const cleanBody = body
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
    // Replace block elements with newlines to preserve structure
    .replace(/<\/(div|tr|td|th|p|li|br|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&pound;/g, "£").replace(/&euro;/g, "€")
    // Collapse whitespace but keep newlines
    .replace(/[ \t]{3,}/g, "  ")
    .replace(/\n{4,}/g, "\n\n")
    .trim();

  // Extract the most information-dense section (first 6000 chars of cleaned text)
  // Focus on the middle of the email which usually has the booking details
  const bodyForExtraction = cleanBody.length > 6000
    ? cleanBody.slice(0, 3000) + "\n...\n" + cleanBody.slice(Math.floor(cleanBody.length / 2) - 1000, Math.floor(cleanBody.length / 2) + 2000)
    : cleanBody;

  const prompt = `You are an expert at extracting structured travel booking data from confirmation emails.

Email subject: ${subject}

Email content (HTML stripped):
---
${bodyForExtraction}
---

INSTRUCTIONS:
First identify the booking type from the subject and content, then extract all relevant fields.

GENERAL RULES:
- Search the ENTIRE text — key data often appears in multiple places
- Dates MUST be YYYY-MM-DD — convert "18 Jul 2026" → "2026-07-18", "18/07/26" → "2026-07-18"
- Times MUST be HH:MM 24hr — convert "2:45pm" → "14:45", "10:45am" → "10:45"
- References: look for "Booking ref", "PNR", "Confirmation no.", "Reservation" followed by alphanumeric codes
- Prices: look for £/€/$ amounts near "Total", "Amount charged", "Grand total", "You paid"
- Return ONLY valid JSON, no explanation, no markdown code blocks

FLIGHT emails (stepType: "flight"):
- Flight number: 2-letter airline code + digits e.g. "BA256", "EZY8765", "FR1234", "A3284"
- Airports: city names or 3-letter IATA codes e.g. (LHR), (ATH), (CFU) — often in route format "LHR → ATH"
- Times: near "Departs", "Arrives", "Departure", "Arrival" or in a flight summary table
- Multiple flights: extract the OUTBOUND flight details into flight fields

HOTEL/VILLA emails (stepType: "hotel" or "villa"):
- Check-in/out: look for "Check-in", "Arrival", "Check-out", "Departure" dates
- Address: look for full street address, often near hotel name
- Room type: look for "Room type", "Room category" — put in notes
- Board basis: look for "Breakfast included", "Half board", "All inclusive" — put in notes

FERRY emails (stepType: "ferry"):
- Route: look for port names e.g. "Dover → Calais", "Portsmouth to Santander"
- Departure port → departureAirport field, arrival port → arrivalAirport field
- Vehicle details: put registration, vehicle type in notes
- Cabin type: put in notes

SAILING/CHARTER emails (stepType: "sailing"):
- Vessel name: put in notes
- Departure and return dates
- Marina/port name → use departureAirport field for departure port

CAR HIRE emails (stepType: "carHire"):
- Pick-up and drop-off: look for "Collection", "Pick-up", "Return" with dates and locations
- Car type/category: look for "Vehicle", "Car class", "Model"
- Extras: insurance, child seat, GPS — put in notes

PARKING emails (stepType: "parking"):
- Car park name: look for the specific car park brand/name
- Terminal: look for "Terminal 1/2/3/4/5", "T1", "T2" etc.
- Entry/exit: look for exact date AND time for both entry and exit
- Format: "2026-07-10T09:30" (combine date and time)

TRANSFER/TAXI emails (stepType: "transfer"):
- Pickup time and location: look for "Pick-up", "Collection" time and address
- Drop-off: destination address
- Vehicle type: put in notes

RESTAURANT emails (stepType: "custom"):
- Date and time: reservation date and time → use "date" and put time in notes
- Party size: number of guests → put in notes
- Special requests: dietary requirements, occasion → put in notes
- Restaurant name → provider field

Return this exact JSON structure (empty string "" for any field not found):
{
  "stepType": "flight|hotel|villa|carHire|ferry|sailing|parking|transfer|custom",
  "provider": "airline or company name e.g. British Airways, easyJet, Hilton",
  "reference": "booking reference or PNR e.g. XPRIAN, ABC123",
  "date": "YYYY-MM-DD primary travel date",
  "dateBooked": "YYYY-MM-DD date the booking was made",
  "totalPrice": "numeric amount only e.g. 245.50",
  "currency": "GBP|EUR|USD|TRY etc",
  "notes": "seat numbers, cabin class, baggage allowance, meal preference, important conditions",
  "flightDate": "YYYY-MM-DD",
  "departureAirport": "Airport name (IATA) e.g. London Heathrow (LHR)",
  "arrivalAirport": "Airport name (IATA) e.g. Corfu Ioannis Kapodistrias (CFU)",
  "departureTime": "HH:MM",
  "arrivalTime": "HH:MM",
  "flightNumber": "e.g. BA256 — look for 2-letter airline code followed by digits",
  "checkIn": "YYYY-MM-DD hotel check-in",
  "checkOut": "YYYY-MM-DD hotel check-out",
  "propertyAddress": "full address",
  "pickUpDate": "YYYY-MM-DD",
  "dropOffDate": "YYYY-MM-DD",
  "pickUpLocation": "location",
  "carType": "e.g. VW Golf, Economy, SUV",
  "ferryDate": "YYYY-MM-DD",
  "returnDate": "YYYY-MM-DD return date for sailing or ferry",
  "pickupTime": "HH:MM transfer pickup time",
  "pickupLocation": "transfer pickup address or location",
  "carParkName": "name of car park",
  "terminalName": "airport terminal e.g. Terminal 2",
  "parkingEntry": "YYYY-MM-DDTHH:MM entry datetime",
  "parkingExit": "YYYY-MM-DDTHH:MM exit datetime"
}`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    log("CLAUDE_RESPONSE_STATUS", response.status);
    const text = data.content?.[0]?.text || "{}";
    log("CLAUDE_RAW_TEXT", text.slice(0, 500));
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch (e) {
    log("CLAUDE_ERROR", e.message);
    return {};
  }
}
