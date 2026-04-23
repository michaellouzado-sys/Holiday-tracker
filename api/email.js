import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DOMAIN = "in.allbooked.app";

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
    const resendKey = process.env.RESEND_API_KEY;

    // Resend webhook metadata only — must fetch body and attachments separately
    let bodyText = "";
    let pdfBase64 = null;

    if (emailId && resendKey) {
      // Fetch email body
      log("FETCHING_EMAIL_BODY", emailId);
      try {
        const emailResp = await fetch(`https://api.resend.com/v1/received-emails/${emailId}`, {
          headers: { "Authorization": `Bearer ${resendKey}` }
        });
        const emailData = await emailResp.json();
        log("EMAIL_FETCH_STATUS", emailResp.status);
        log("EMAIL_FETCH_KEYS", Object.keys(emailData));
        const rawHtml = emailData.html || "";
        const rawText = emailData.text || "";
        bodyText = rawText || rawHtml.replace(/<[^>]+>/g, " ") || "";
        log("EMAIL_BODY_LENGTH", bodyText.length);

        // Fetch attachments if body still empty
        if (!bodyText.trim() && data.attachments?.length > 0) {
          log("FETCHING_ATTACHMENTS", data.attachments.map(a => a.filename));
          for (const att of data.attachments) {
            if (att.filename?.toLowerCase().endsWith(".pdf")) {
              try {
                const attResp = await fetch(
                  `https://api.resend.com/v1/received-emails/${emailId}/attachments/${att.id}`,
                  { headers: { "Authorization": `Bearer ${resendKey}` } }
                );
                log("ATTACHMENT_FETCH_STATUS", attResp.status);
                const attData = await attResp.json();
                log("ATTACHMENT_KEYS", Object.keys(attData));
                if (attData.download_url) {
                  const pdfResp = await fetch(attData.download_url);
                  const pdfBuf = await pdfResp.arrayBuffer();
                  pdfBase64 = Buffer.from(pdfBuf).toString("base64");
                  log("PDF_DOWNLOADED_BYTES", pdfBuf.byteLength);
                  break;
                }
              } catch (e) {
                log("ATTACHMENT_ERROR", e.message);
              }
            }
          }
        }
      } catch (e) {
        log("EMAIL_FETCH_ERROR", e.message);
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
