import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";

const SHARED_ROW_ID = "shared";

const STEP_TEMPLATES = [
  { icon: "✈️", label: "Outbound Flights" },
  { icon: "✈️", label: "Return Flights" },
  { icon: "🛫", label: "Internal Flight" },
  { icon: "🅿️", label: "Airport Parking" },
  { icon: "🚕", label: "Transfers to/from Airport" },
  { icon: "🏨", label: "Hotel" },
  { icon: "🏠", label: "Villa / Apartment" },
  { icon: "🚗", label: "Car Hire" },
  { icon: "🚌", label: "Airport Transfer" },
  { icon: "🛡️", label: "Travel Insurance" },
  { icon: "📋", label: "Visa / ETA" },
  { icon: "💱", label: "Currency" },
  { icon: "🎭", label: "Activities / Tours" },
  { icon: "🚢", label: "Ferry / Boat Transfer" },
  { icon: "⛵", label: "Sailing Trip" },
  { icon: "🎫", label: "Theme Park Tickets" },
  { icon: "🍽️", label: "Restaurant Reservation" },
  { icon: "🏥", label: "Travel Vaccinations" },
  { icon: "📱", label: "SIM Card / Roaming" },
  { icon: "🎒", label: "Tour Package" },
];

const STEP_ICONS = ["✈️","🛫","🅿️","🚕","🚂","🏨","🏠","🚗","🚌","🛡️","📋","💱","🎭","🚢","🎫","🍽️","🏥","📱","🎒","⛵","🏔️","🌊","🎿","🏖️","🚁","🎪"];

const RATING_OPTIONS = [
  { value: null, label: "Unrated",   emoji: "—"  },
  { value: 1,    label: "Poor",      emoji: "👎" },
  { value: 2,    label: "OK",        emoji: "😐" },
  { value: 3,    label: "Good",      emoji: "👍" },
  { value: 4,    label: "Excellent", emoji: "⭐" },
];

const STATUS_COLORS = { upcoming: "#10b981", active: "#f59e0b", past: "#94a3b8" };

const CURRENCIES = [
  { code: "GBP", symbol: "£", label: "GBP £" },
  { code: "EUR", symbol: "€", label: "EUR €" },
  { code: "USD", symbol: "$",  label: "USD $" },
  { code: "AED", symbol: "AED", label: "AED" },
  { code: "AUD", symbol: "A$", label: "AUD A$" },
  { code: "CAD", symbol: "C$", label: "CAD C$" },
  { code: "CHF", symbol: "CHF", label: "CHF" },
  { code: "DKK", symbol: "kr", label: "DKK kr" },
  { code: "HKD", symbol: "HK$", label: "HKD HK$" },
  { code: "JPY", symbol: "¥",  label: "JPY ¥" },
  { code: "MXN", symbol: "MX$", label: "MXN MX$" },
  { code: "NOK", symbol: "kr", label: "NOK kr" },
  { code: "NZD", symbol: "NZ$", label: "NZD NZ$" },
  { code: "SEK", symbol: "kr", label: "SEK kr" },
  { code: "SGD", symbol: "S$", label: "SGD S$" },
  { code: "THB", symbol: "฿",  label: "THB ฿" },
  { code: "TRY", symbol: "₺",  label: "TRY ₺" },
  { code: "ZAR", symbol: "R",  label: "ZAR R" },
];

function getCurrencySymbol(code) {
  return CURRENCIES.find(c => c.code === code)?.symbol || code || "£";
}

// Fetch live exchange rates and cache in memory for the session
const ratesCache = {};
async function fetchRates(base) {
  if (ratesCache[base]) return ratesCache[base];
  try {
    const res = await fetch(`/api/rates?base=${base}`);
    const data = await res.json();
    if (data.rates) {
      ratesCache[base] = data;
      return data;
    }
  } catch (e) { console.error("Rates fetch failed", e); }
  return null;
}

function convertAmount(amount, fromCurrency, toCurrency, rates) {
  if (!amount || isNaN(amount)) return 0;
  if (fromCurrency === toCurrency) return amount;
  if (!rates?.rates) return amount; // fallback: no conversion
  // rates are relative to rates.base
  const fromRate = rates.rates[fromCurrency];
  const toRate   = rates.rates[toCurrency];
  if (!fromRate || !toRate) return amount;
  return (amount / fromRate) * toRate;
}

function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function getStatus(h) {
  const now = new Date();
  const s = h.startDate ? new Date(h.startDate) : null;
  const e = h.endDate   ? new Date(h.endDate)   : null;
  if (!s) return "upcoming";
  if (e && now > e) return "past";
  if (now >= s && (!e || now <= e)) return "active";
  return "upcoming";
}

// ─── Step type helpers ─────────────────────────────────────────────────────────
function isFlight(step)   { return ["✈️","🛫"].includes(step.icon) || /flight|fly/i.test(step.label); }
function isHotel(step)    { return step.icon === "🏨" || /hotel/i.test(step.label); }
function isVilla(step)    { return step.icon === "🏠" || /villa|apartment/i.test(step.label); }
function isCarHire(step)  { return step.icon === "🚗" || /car hire|car rental/i.test(step.label); }
function isFerry(step)    { return step.icon === "🚢" || /ferry|cruise|boat transfer/i.test(step.label); }
function isSailing(step)  { return step.icon === "⛵" || /sailing/i.test(step.label); }
function isParking(step)  { return step.icon === "🅿️" || /parking/i.test(step.label); }
function isTransfer(step) { return step.icon === "🚌" || step.icon === "🚕" || /transfer/i.test(step.label); }


// ─── Phase 2 helpers ───────────────────────────────────────────────────────────

// Returns the primary date string (YYYY-MM-DD) for a step, used for timeline/itinerary
function getStepDate(step, booking) {
  if (!booking) return null;
  if (isFlight(step))   return booking.flightDate   || null;
  if (isFerry(step) || isSailing(step)) return booking.ferryDate || null;
  if (isHotel(step) || isVilla(step)) return booking.checkIn || null;
  if (isCarHire(step))  return booking.pickUpDate    || null;
  if (isParking(step))  return booking.parkingEntry ? booking.parkingEntry.slice(0,10) : null;
  if (isTransfer(step)) return booking.transferDate || null;
  return null;
}

// Returns a short time string for timeline display
function getStepTime(step, booking) {
  if (!booking) return null;
  if (isFlight(step))   return booking.departureTime || null;
  if (isFerry(step))    return booking.ferryDepartTime || null;
  if (isTransfer(step)) return booking.pickupTime || null;
  return null;
}

// Returns a human-readable summary line for a booking step
function getStepSummary(step, booking) {
  if (!booking) return "";
  if (isFlight(step)) {
    const route = [booking.departureAirport, booking.arrivalAirport].filter(Boolean).join(" → ");
    const time  = [booking.departureTime, booking.arrivalTime].filter(Boolean).join(" → ");
    return [route, time, booking.flightNumber].filter(Boolean).join("  ·  ");
  }
  if (isFerry(step) || isSailing(step)) {
    const time = [booking.ferryDepartTime, booking.ferryArriveTime].filter(Boolean).join(" → ");
    return [booking.provider, time].filter(Boolean).join("  ·  ");
  }
  if (isHotel(step) || isVilla(step)) {
    const nights = booking.checkIn && booking.checkOut
      ? Math.round((new Date(booking.checkOut) - new Date(booking.checkIn)) / 86400000) : null;
    return [booking.provider, booking.propertyAddress, nights ? `${nights} nights` : ""].filter(Boolean).join("  ·  ");
  }
  if (isCarHire(step)) return [booking.provider, booking.carType, booking.pickUpLocation].filter(Boolean).join("  ·  ");
  if (isParking(step)) return [booking.carParkName, booking.terminalName].filter(Boolean).join("  ·  ");
  if (isTransfer(step)) return [booking.provider, booking.pickupLocation, booking.pickupTime].filter(Boolean).join("  ·  ");
  const dateParts = [];
  if (booking.customStartDate) dateParts.push(formatDate(booking.customStartDate));
  if (booking.customEndDate && booking.customEndDate !== booking.customStartDate) dateParts.push(formatDate(booking.customEndDate));
  return [booking.provider, dateParts.join(' → '), booking.reference].filter(Boolean).join("  ·  ");
}

// Build a sorted list of timeline events from a holiday
function buildTimeline(holiday) {
  const steps = holiday.steps || [];
  const events = [];
  steps.forEach(step => {
    const b = holiday.bookings?.[step.id];
    const date = getStepDate(step, b);
    events.push({ step, booking: b, date, time: getStepTime(step, b) });
  });
  // Sort: items with dates first (by date+time), then undated
  events.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    const da = a.date + (a.time || "00:00");
    const db = b.date + (b.time || "00:00");
    return da < db ? -1 : da > db ? 1 : 0;
  });
  return events;
}

// Group timeline events by date
function groupByDate(events) {
  const groups = {};
  events.forEach(ev => {
    const key = ev.date || "__undated__";
    if (!groups[key]) groups[key] = [];
    groups[key].push(ev);
  });
  return groups;
}

// Default packing list categories
const DEFAULT_PACKING = [
  { category: "Documents", items: ["Passport", "Travel insurance docs", "Booking confirmations", "Driving licence"] },
  { category: "Clothing", items: ["T-shirts", "Shorts / trousers", "Underwear", "Socks", "Swimwear", "Evening wear", "Jacket / hoodie"] },
  { category: "Toiletries", items: ["Toothbrush & toothpaste", "Shampoo & conditioner", "Sun cream", "Deodorant", "Razor", "Medications"] },
  { category: "Electronics", items: ["Phone charger", "Plug adaptor", "Headphones", "Camera"] },
  { category: "Misc", items: ["Cash / cards", "Sunglasses", "Book / e-reader", "Reusable water bottle"] },
];
// ─── Supabase ──────────────────────────────────────────────────────────────────
async function loadFromSupabase(userId) {
  const { data, error } = await supabase.from("app_data").select("data").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data?.data ?? { holidays: [] };
}
async function saveToSupabase(userId, payload) {
  const { error } = await supabase.from("app_data").upsert({ id: userId, data: payload, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ─── Image scanning ────────────────────────────────────────────────────────────
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractFromImage(base64Data, mediaType, stepType) {
  const prompts = {
    flight: `Extract all flight booking details from this image. Return ONLY a JSON object (use empty string if not found):
{"provider":"airline name","reference":"booking reference/PNR","flightNumber":"e.g. FR1234","departureAirport":"name and IATA code e.g. Manchester (MAN)","arrivalAirport":"name and IATA code e.g. Palermo (PMO)","flightDate":"YYYY-MM-DD","departureTime":"HH:MM 24h","arrivalTime":"HH:MM 24h","dateBooked":"YYYY-MM-DD if visible","notes":"seat, baggage, terminal"}`,
    ferry: `Extract all ferry/cruise booking details from this image. Return ONLY a JSON object (use empty string if not found):
{"provider":"company name","reference":"booking ref","ferryDate":"YYYY-MM-DD departure date","ferryDepartTime":"HH:MM 24h","ferryArriveTime":"HH:MM 24h","dateBooked":"YYYY-MM-DD if visible","notes":"route, cabin, car deck"}`,
    hotel: `Extract all hotel booking details from this image. Return ONLY a JSON object (use empty string if not found):
{"provider":"hotel name","reference":"booking ref","checkIn":"YYYY-MM-DD","checkOut":"YYYY-MM-DD","propertyAddress":"full address","dateBooked":"YYYY-MM-DD if visible","notes":"room type, board basis, requests"}`,
    villa: `Extract all villa/apartment booking details from this image. Return ONLY a JSON object (use empty string if not found):
{"provider":"company/owner name","reference":"booking ref","checkIn":"YYYY-MM-DD","checkOut":"YYYY-MM-DD","propertyAddress":"full address","dateBooked":"YYYY-MM-DD if visible","notes":"access codes, instructions"}`,
    carHire: `Extract all car hire booking details from this image. Return ONLY a JSON object (use empty string if not found):
{"provider":"company name","reference":"booking ref","pickUpDate":"YYYY-MM-DD","dropOffDate":"YYYY-MM-DD","pickUpLocation":"e.g. airport desk","carType":"e.g. VW Golf","carExtras":"insurance, child seat etc","dateBooked":"YYYY-MM-DD if visible","notes":"other info"}`,
    parking: `Extract all airport parking booking details from this image. Return ONLY a JSON object (use empty string if not found):
{"provider":"company name","reference":"booking ref","carParkName":"car park name","terminalName":"e.g. Terminal 2","terminalTransfer":"e.g. shuttle bus","parkingEntry":"YYYY-MM-DDTHH:MM","parkingExit":"YYYY-MM-DDTHH:MM","dateBooked":"YYYY-MM-DD if visible","notes":"other info"}`,
    transfer: `Extract all transfer booking details from this image. Return ONLY a JSON object (use empty string if not found):
{"provider":"company name","reference":"booking ref","transferDate":"YYYY-MM-DD transfer date","pickupTime":"HH:MM 24h","pickupLocation":"e.g. hotel lobby","driverContact":"phone number","dateBooked":"YYYY-MM-DD if visible","notes":"passengers, vehicle type"}`,
    default: `Extract booking details from this image. Return ONLY a JSON object (use empty string if not found):
{"provider":"company name","reference":"booking ref","dateBooked":"YYYY-MM-DD if visible","notes":"any useful details"}`,
  };

  const response = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
        { type: "text", text: prompts[stepType] || prompts.default }
      ]}]
    })
  });
  const data = await response.json();
  const text = data.content?.[0]?.text || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ─── Add Step Modal ────────────────────────────────────────────────────────────
function AddStepModal({ onAdd, onClose }) {
  const [mode, setMode] = useState("template");
  const [customIcon, setCustomIcon] = useState("✈️");
  const [customLabel, setCustomLabel] = useState("");
  const [search, setSearch] = useState("");
  const filtered = STEP_TEMPLATES.filter(t => t.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={overlay}>
      <div style={{ ...modal, maxWidth: "500px" }}>
        <div style={modalHeader}>
          <h3 style={modalTitle}>Add Booking Step</h3>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {[["template","Choose from list"],["custom","Custom step"]].map(([v,l]) => (
            <button key={v} onClick={() => setMode(v)} style={{
              ...toggleBtn, flex: 1,
              background: mode === v ? "#e0f2fe" : "#f1f5f9",
              border: `1px solid ${mode === v ? "#0ea5e9" : "#e2e8f0"}`,
              color: mode === v ? "#0f172a" : "#64748b"
            }}>{l}</button>
          ))}
        </div>
        {mode === "template" ? (
          <>
            <input placeholder="Search steps..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, marginBottom: "12px" }} autoFocus />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", maxHeight: "320px", overflowY: "auto" }}>
              {filtered.map((t, i) => (
                <button key={i} onClick={() => onAdd({ id: generateId(), icon: t.icon, label: t.label })}
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "10px", cursor: "pointer", color: "#334155", fontSize: "13px", textAlign: "left" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#0ea5e9"; e.currentTarget.style.color = "#0f172a"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#334155"; }}
                ><span style={{ fontSize: "20px" }}>{t.icon}</span><span>{t.label}</span></button>
              ))}
              {filtered.length === 0 && <div style={{ color: "#94a3b8", fontSize: "13px", gridColumn: "1/-1", padding: "16px 0" }}>No matches — try Custom step</div>}
            </div>
          </>
        ) : (
          <>
            <label style={labelStyle}>
              <span>Icon</span>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                {STEP_ICONS.map(e => (
                  <button key={e} onClick={() => setCustomIcon(e)} style={{ width: "38px", height: "38px", fontSize: "18px", background: customIcon === e ? "#e0f2fe" : "#f1f5f9", border: `1px solid ${customIcon === e ? "#0ea5e9" : "#e2e8f0"}`, borderRadius: "8px", cursor: "pointer" }}>{e}</button>
                ))}
              </div>
            </label>
            <label style={labelStyle}>
              <span>Step Name</span>
              <input autoFocus value={customLabel} onChange={e => setCustomLabel(e.target.value)} placeholder="e.g. Florence to Rome Train..." style={inputStyle}
                onKeyDown={e => e.key === "Enter" && customLabel.trim() && onAdd({ id: generateId(), icon: customIcon, label: customLabel.trim() })} />
            </label>
            <button onClick={() => customLabel.trim() && onAdd({ id: generateId(), icon: customIcon, label: customLabel.trim() })}
              style={{ ...primaryBtn, width: "100%", opacity: customLabel.trim() ? 1 : 0.4 }}>Add Step</button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Booking Modal ─────────────────────────────────────────────────────────────
function BookingModal({ step, booking, currency = "GBP", onSave, onDelete, onClose, onRename }) {
  const isFlightStep   = isFlight(step);
  const isHotelStep    = isHotel(step);
  const isVillaStep    = isVilla(step);
  const isCarHireStep  = isCarHire(step);
  const isFerryStep    = isFerry(step);
  const isSailingStep  = isSailing(step);
  const isParkingStep  = isParking(step);
  const isTransferStep = isTransfer(step);
  const isAccomm       = isHotelStep || isVillaStep;

  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    confirmed:           booking?.confirmed           || false,
    provider:            booking?.provider            || "",
    reference:           booking?.reference           || "",
    notes:               booking?.notes               || "",
    rating:              booking?.rating              ?? null,
    dateBooked:          booking?.dateBooked          || "",
    // flight
    departureAirport:    booking?.departureAirport    || "",
    arrivalAirport:      booking?.arrivalAirport      || "",
    flightDate:          booking?.flightDate          || "",
    departureTime:       booking?.departureTime       || "",
    arrivalTime:         booking?.arrivalTime         || "",
    flightNumber:        booking?.flightNumber        || "",
    // hotel / villa
    checkIn:             booking?.checkIn             || "",
    checkOut:            booking?.checkOut            || "",
    propertyAddress:     booking?.propertyAddress     || "",
    wifiPassword:        booking?.wifiPassword        || "",
    checkInInstructions: booking?.checkInInstructions || "",
    // car hire
    pickUpDate:          booking?.pickUpDate          || "",
    dropOffDate:         booking?.dropOffDate         || "",
    pickUpLocation:      booking?.pickUpLocation      || "",
    carType:             booking?.carType             || "",
    carExtras:           booking?.carExtras           || "",
    // ferry
    ferryDate:           booking?.ferryDate           || "",
    sailingReturnDate:   booking?.sailingReturnDate   || "",
    ferryDepartTime:     booking?.ferryDepartTime     || "",
    ferryArriveTime:     booking?.ferryArriveTime     || "",
    // parking
    carParkName:         booking?.carParkName         || "",
    terminalName:        booking?.terminalName        || "",
    terminalTransfer:    booking?.terminalTransfer    || "",
    parkingEntry:        booking?.parkingEntry        || "",
    parkingExit:         booking?.parkingExit         || "",
    // transfer
    transferDate:        booking?.transferDate        || "",
    pickupTime:          booking?.pickupTime          || "",
    pickupLocation:      booking?.pickupLocation      || "",
    driverContact:       booking?.driverContact       || "",
    // custom step dates
    customStartDate:     booking?.customStartDate     || step.startDate || "",
    customEndDate:       booking?.customEndDate       || step.endDate   || "",
    // price fields
    totalPrice:          booking?.totalPrice          || "",
    amountPaid:          booking?.amountPaid          || "",
    paymentDueDate:      booking?.paymentDueDate      || "",
    stepCurrency:        booking?.stepCurrency        || currency,
  });

  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(step.label);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [scanPreview, setScanPreview] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveAndClose = () => { onSave(form); onClose(); };
  const commitRename = () => { setEditingName(false); if (newName.trim()) onRename(newName.trim()); };

  const handlePhotoScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null); setScanning(true);
    setScanPreview(URL.createObjectURL(file));
    try {
      const base64 = await fileToBase64(file);
      const stepType = isFlightStep ? "flight" : (isFerryStep || isSailingStep) ? "ferry" : isHotelStep ? "hotel"
        : isVillaStep ? "villa" : isCarHireStep ? "carHire" : isParkingStep ? "parking"
        : isTransferStep ? "transfer" : "default";
      const extracted = await extractFromImage(base64, file.type, stepType);
      setForm(prev => {
        const next = { ...prev };
        Object.entries(extracted).forEach(([k, v]) => { if (v && next[k] !== undefined) next[k] = v; });
        return next;
      });
    } catch (err) {
      console.error(err);
      setScanError("Couldn't read the image — try a clearer photo or fill in manually.");
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const Field = ({ k, label, placeholder, type = "text" }) => (
    <label style={labelStyle}>
      <span>{label}</span>
      <input type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} style={inputStyle} />
    </label>
  );
  const TextArea = ({ k, label, placeholder, rows = 2 }) => (
    <label style={labelStyle}>
      <span>{label}</span>
      <textarea value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} rows={rows} style={{ ...inputStyle, resize: "vertical" }} />
    </label>
  );
  const Row = ({ children }) => <div style={{ display: "flex", gap: "12px" }}>{children}</div>;
  const HalfField = ({ k, label, placeholder, type = "text" }) => (
    <label style={{ ...labelStyle, flex: 1 }}>
      <span>{label}</span>
      <input type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} style={inputStyle} />
    </label>
  );

  // Calculate nights for hotel/villa
  const nights = isAccomm && form.checkIn && form.checkOut
    ? Math.round((new Date(form.checkOut) - new Date(form.checkIn)) / 86400000)
    : null;

  return (
    <div style={overlay}>
      <div style={{ ...modal, maxWidth: "500px" }}>
        {/* Header */}
        <div style={modalHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "22px" }}>{step.icon}</span>
            {editingName ? (
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditingName(false); setNewName(step.label); } }}
                style={{ ...inputStyle, margin: 0, padding: "4px 8px", fontSize: "16px", width: "220px" }} />
            ) : (
              <h3 style={{ margin: 0, fontSize: "17px", color: "#0f172a", cursor: "pointer" }} title="Click to rename" onClick={() => setEditingName(true)}>
                {step.label} <span style={{ fontSize: "12px", color: "#94a3b8" }}>✏️</span>
              </h3>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button onClick={saveAndClose} style={{ ...primaryBtn, padding: "8px 16px", fontSize: "13px" }}>Save & Close</button>
            <button onClick={onClose} style={{ ...closeBtn, fontSize: "18px" }} title="Discard changes">✕</button>
          </div>
        </div>

        {/* Photo scan */}
        <div style={{ marginBottom: "20px" }}>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoScan} style={{ display: "none" }} id="photo-scan-input" />
          <label htmlFor="photo-scan-input" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            padding: "11px", borderRadius: "10px", cursor: scanning ? "wait" : "pointer",
            background: scanning ? "#f1f5f9" : "#e0f2fe", border: "1px dashed #0ea5e9",
            color: scanning ? "#64748b" : "#38bdf8", fontSize: "13px", fontWeight: "600",
          }}>
            {scanning ? (
              <><div style={{ width:"16px", height:"16px", borderRadius:"50%", flexShrink:0, border:"2px solid #bae6fd", borderTopColor:"#0ea5e9", animation:"spin 0.7s linear infinite", display:"inline-block" }} /> Scanning…</>
            ) : (
              <><span style={{ fontSize:"16px" }}>📷</span> Scan from photo or screenshot</>
            )}
          </label>
          {scanPreview && !scanning && <div style={{ marginTop: "8px", borderRadius: "8px", overflow: "hidden", maxHeight: "80px", display: "flex", justifyContent: "center", background: "#f1f5f9" }}><img src={scanPreview} alt="Scanned" style={{ maxHeight: "80px", objectFit: "contain" }} /></div>}
          {scanError && <div style={{ marginTop: "6px", color: "#ef4444", fontSize: "12px" }}>⚠️ {scanError}</div>}
          {!scanning && scanPreview && !scanError && <div style={{ marginTop: "6px", color: "#10b981", fontSize: "12px" }}>✓ Details extracted — check and edit below</div>}
        </div>

        {/* Status */}
        <label style={labelStyle}>
          <span>Status</span>
          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
            {[true, false].map(v => (
              <button key={String(v)} onClick={() => set("confirmed", v)} style={{
                ...toggleBtn, flex: 1,
                background: form.confirmed === v ? (v ? "#10b98122" : "#ef444422") : "#f1f5f9",
                border: `1px solid ${form.confirmed === v ? (v ? "#10b981" : "#ef4444") : "#e2e8f0"}`,
                color: form.confirmed === v ? (v ? "#10b981" : "#ef4444") : "#64748b"
              }}>{v ? "✓ Booked" : "○ Not Booked"}</button>
            ))}
          </div>
        </label>

        {/* ── Flight fields ── */}
        {isFlightStep && (<>
          <Row><HalfField k="departureAirport" label="Departure Airport" placeholder="e.g. Manchester (MAN)" /><HalfField k="arrivalAirport" label="Arrival Airport" placeholder="e.g. Palermo (PMO)" /></Row>
          <Row><HalfField k="flightDate" label="Flight Date" type="date" /><HalfField k="flightNumber" label="Flight Number" placeholder="e.g. FR1234" /></Row>
          <Row><HalfField k="departureTime" label="Departure Time" type="time" /><HalfField k="arrivalTime" label="Arrival Time" type="time" /></Row>
          <Row><HalfField k="reference" label="Booking Reference" placeholder="e.g. ABC123XY" /></Row>
        </>)}

        {/* ── Ferry / Sailing fields ── */}
        {(isFerryStep || isSailingStep) && (<>
          <Row>
            <HalfField k="ferryDate" label="Departure Date" type="date" />
            {isSailingStep && <HalfField k="sailingReturnDate" label="Return Date" type="date" />}
          </Row>
          <Row><HalfField k="ferryDepartTime" label="Departure Time" type="time" /><HalfField k="ferryArriveTime" label="Arrival Time" type="time" /></Row>
          <Field k="reference" label="Booking Reference" placeholder="e.g. ABC123XY" />
        </>)}

        {/* ── Hotel / Villa fields ── */}
        {isAccomm && (<>
          <Row>
            <HalfField k="checkIn" label="Check-in Date" type="date" />
            <HalfField k="checkOut" label="Check-out Date" type="date" />
          </Row>
          {nights !== null && nights > 0 && (
            <div style={{ marginTop: "-8px", marginBottom: "14px", color: "#0ea5e9", fontSize: "12px" }}>
              {nights} night{nights !== 1 ? "s" : ""}
            </div>
          )}
          <Field k="propertyAddress" label="Address" placeholder="e.g. Via Roma 12, Palermo..." />
          <Field k="wifiPassword" label="WiFi Password" placeholder="e.g. SunnyDays2024..." />
          <TextArea k="checkInInstructions" label="Check-in Instructions" placeholder="e.g. Key in lockbox, code 1234. Check-in from 3pm..." />
          <Field k="reference" label="Booking Reference" placeholder="e.g. ABC123XY" />
        </>)}

        {/* ── Car Hire fields ── */}
        {isCarHireStep && (<>
          <Row><HalfField k="pickUpDate" label="Pick-up Date" type="date" /><HalfField k="dropOffDate" label="Drop-off Date" type="date" /></Row>
          <Field k="pickUpLocation" label="Pick-up Location" placeholder="e.g. Airport desk T2, off-site depot..." />
          <Field k="carType" label="Car Type" placeholder="e.g. VW Golf, Fiat 500, Economy..." />
          <Field k="carExtras" label="Extras / Insurance" placeholder="e.g. Full insurance, child seat, satnav..." />
          <Field k="reference" label="Booking Reference" placeholder="e.g. ABC123XY" />
        </>)}

        {/* ── Parking fields ── */}
        {isParkingStep && (<>
          <Field k="carParkName" label="Car Park Name" placeholder="e.g. Purple Parking T2, JetParks 1..." />
          <Field k="terminalName" label="Terminal" placeholder="e.g. Terminal 2" />
          <Field k="terminalTransfer" label="Transfer to Terminal" placeholder="e.g. Shuttle bus every 15 mins, 5 min walk..." />
          <Row><HalfField k="parkingEntry" label="Entry Date / Time" type="datetime-local" /><HalfField k="parkingExit" label="Exit Date / Time" type="datetime-local" /></Row>
          <Field k="reference" label="Booking Reference" placeholder="e.g. ABC123XY" />
        </>)}

        {/* ── Transfer fields ── */}
        {isTransferStep && (<>
          <Row>
            <HalfField k="transferDate" label="Transfer Date" type="date" />
            <HalfField k="pickupTime" label="Pickup Time" type="time" />
          </Row>
          <Field k="pickupLocation" label="Pickup Location" placeholder="e.g. Hotel lobby, Arrivals Hall Gate B..." />
          <Field k="driverContact" label="Driver / Contact Number" placeholder="e.g. +44 7700 900123..." />
          <Field k="reference" label="Booking Reference" placeholder="e.g. ABC123XY" />
        </>)}

        {/* ── Common fields (non-typed steps get reference here) ── */}
        {!isFlightStep && !isFerryStep && !isSailingStep && !isAccomm && !isCarHireStep && !isParkingStep && !isTransferStep && (
          <Field k="reference" label="Booking Reference" placeholder="e.g. ABC123XY" />
        )}

        <Field k="provider" label={isFlightStep ? "Airline" : isCarHireStep ? "Car Hire Company" : isParkingStep ? "Car Park Company" : "Provider / Company"} placeholder="..." />
        <Field k="dateBooked" label="Date Booked" type="date" />

        {/* Pricing */}
        {(() => {
          const sym = getCurrencySymbol(form.stepCurrency || currency);
          const total = parseFloat((form.totalPrice || "").replace(/[^0-9.]/g, ""));
          const paid  = parseFloat((form.amountPaid  || "").replace(/[^0-9.]/g, ""));
          const outstanding = !isNaN(total) && !isNaN(paid) ? total - paid : null;
          return (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px 16px", marginBottom: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <div style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.8px" }}>Pricing</div>
                <select value={form.stepCurrency} onChange={e => set("stepCurrency", e.target.value)}
                  style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "6px", color: "#64748b", fontSize: "12px", padding: "4px 8px", cursor: "pointer" }}>
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <label style={{ ...labelStyle, flex: 1, marginBottom: 0 }}>
                  <span>Total Price</span>
                  <input value={form.totalPrice} onChange={e => set("totalPrice", e.target.value)} placeholder={`${sym}0.00`} style={inputStyle} />
                </label>
                <label style={{ ...labelStyle, flex: 1, marginBottom: 0 }}>
                  <span>Amount Paid</span>
                  <input value={form.amountPaid} onChange={e => set("amountPaid", e.target.value)} placeholder={`${sym}0.00`} style={inputStyle} />
                </label>
              </div>
              {outstanding !== null && (
                <div style={{ marginTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#94a3b8", fontSize: "12px" }}>Outstanding</span>
                  <span style={{ color: outstanding <= 0 ? "#10b981" : "#f59e0b", fontWeight: "700", fontSize: "14px" }}>
                    {outstanding <= 0 ? "✓ Fully paid" : `${sym}${Math.ceil(outstanding)}`}
                  </span>
                </div>
              )}
              {outstanding !== null && outstanding > 0 && (
                <label style={{ ...labelStyle, marginTop: "12px", marginBottom: 0 }}>
                  <span>Payment Due Date</span>
                  <input type="date" value={form.paymentDueDate} onChange={e => set("paymentDueDate", e.target.value)} style={inputStyle} />
                </label>
              )}
            </div>
          );
        })()}

        <TextArea k="notes" label="Notes" placeholder="Any additional details..." rows={3} />

        {/* Rating */}
        <label style={labelStyle}>
          <span>Rating</span>
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            {RATING_OPTIONS.map(r => (
              <button key={String(r.value)} onClick={() => set("rating", r.value)} style={{
                ...toggleBtn, flex: 1,
                background: form.rating === r.value ? "#e0f2fe" : "#f1f5f9",
                border: `1px solid ${form.rating === r.value ? "#0ea5e9" : "#e2e8f0"}`,
                color: form.rating === r.value ? "#0f172a" : "#64748b", fontSize: "18px"
              }} title={r.label}>{r.emoji}</button>
            ))}
          </div>
        </label>

        <div style={{ display: "flex", gap: "8px", marginTop: "24px" }}>
          <button onClick={onDelete} style={{ ...secondaryBtn, color: "#ef4444", borderColor: "#ef444444", flex: 1 }}>🗑 Remove this step</button>
          <button onClick={saveAndClose} style={{ ...primaryBtn, flex: 2 }}>Save & Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Holiday Modal ─────────────────────────────────────────────────────────────
function HolidayModal({ holiday, onSave, onClose }) {
  const [form, setForm] = useState({
    name: holiday?.name || "", destination: holiday?.destination || "",
    startDate: holiday?.startDate || "", endDate: holiday?.endDate || "",
    notes: holiday?.notes || "", emoji: holiday?.emoji || "✈️",
    currency: holiday?.currency || "GBP",
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const emojis = ["✈️","🏖️","🏔️","🌍","🗺️","🏝️","🎿","🌴","🏛️","🌅"];

  return (
    <div style={overlay}>
      <div style={{ ...modal, maxWidth: "440px" }}>
        <div style={modalHeader}>
          <h3 style={modalTitle}>{holiday ? "Edit Holiday" : "New Holiday"}</h3>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        <label style={labelStyle}>
          <span>Icon</span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
            {emojis.map(e => (
              <button key={e} onClick={() => set("emoji", e)} style={{ width: "40px", height: "40px", fontSize: "20px", background: form.emoji === e ? "#e0f2fe" : "#f1f5f9", border: `1px solid ${form.emoji === e ? "#0ea5e9" : "#e2e8f0"}`, borderRadius: "8px", cursor: "pointer" }}>{e}</button>
            ))}
          </div>
        </label>
        {[{ k: "name", label: "Holiday Name", placeholder: "e.g. Summer in Tuscany 2025" }, { k: "destination", label: "Destination", placeholder: "e.g. Florence, Italy" }].map(({ k, label, placeholder }) => (
          <label key={k} style={labelStyle}>
            <span>{label}</span>
            <input value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} style={inputStyle} />
          </label>
        ))}
        <div style={{ display: "flex", gap: "12px" }}>
          {[{ k: "startDate", label: "Departure" }, { k: "endDate", label: "Return" }].map(({ k, label }) => (
            <label key={k} style={{ ...labelStyle, flex: 1 }}>
              <span>{label}</span>
              <input type="date" value={form[k]} onChange={e => set(k, e.target.value)} style={inputStyle} />
            </label>
          ))}
        </div>
        <label style={labelStyle}>
          <span>Currency</span>
          <select value={form.currency} onChange={e => set("currency", e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}>
            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          <span>Notes</span>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any general notes..." rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        </label>
        <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
          <button onClick={onClose} style={{ ...secondaryBtn, flex: 1 }}>Cancel</button>
          <button onClick={() => form.name && onSave(form)} style={{ ...primaryBtn, flex: 2, opacity: form.name ? 1 : 0.4 }}>Save Holiday</button>
        </div>
      </div>
    </div>
  );
}


// ─── Timeline View ─────────────────────────────────────────────────────────────
function TimelineView({ holiday, onOpenBooking }) {
  const events = buildTimeline(holiday);
  const groups = groupByDate(events);
  const dateKeys = Object.keys(groups).sort((a, b) => {
    if (a === "__undated__") return 1;
    if (b === "__undated__") return -1;
    return a < b ? -1 : 1;
  });

  return (
    <div style={{ paddingBottom: "20px" }}>
      {dateKeys.map(dateKey => (
        <div key={dateKey} style={{ marginBottom: "28px" }}>
          {/* Date header */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
            <div style={{ background: "#0ea5e9", borderRadius: "8px", padding: "6px 14px", fontSize: "13px", fontWeight: "700", color: "#0f172a", whiteSpace: "nowrap" }}>
              {dateKey === "__undated__" ? "No date set" : formatDate(dateKey)}
            </div>
            <div style={{ flex: 1, height: "1px", background: "#e0f2fe" }} />
          </div>
          {/* Events for this date */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingLeft: "16px", borderLeft: "2px solid #bae6fd" }}>
            {groups[dateKey].map(({ step, booking }, i) => {
              const isBooked = booking?.confirmed;
              const summary = getStepSummary(step, booking);
              const time = getStepTime(step, booking);
              return (
                <div key={step.id} onClick={() => onOpenBooking(step.id)}
                  style={{
                    background: "#ffffff", border: `1px solid ${isBooked ? "#10b98133" : "#e2e8f0"}`,
                    borderRadius: "12px", padding: "12px 16px", cursor: "pointer",
                    display: "flex", alignItems: "flex-start", gap: "12px", transition: "all 0.15s",
                    marginLeft: "-1px"
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#0ea5e9"; e.currentTarget.style.background = "#f0f9ff"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = isBooked ? "#10b98133" : "#e2e8f0"; e.currentTarget.style.background = "#0f172a"; }}
                >
                  <span style={{ fontSize: "22px", flexShrink: 0 }}>{step.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ color: "#0f172a", fontSize: "14px", fontWeight: "600" }}>{step.label}</span>
                      {time && <span style={{ color: "#10b981", fontSize: "12px", fontFamily: "monospace" }}>{time}</span>}
                      {isBooked && <span style={{ background: "#10b98122", color: "#10b981", fontSize: "10px", padding: "1px 7px", borderRadius: "10px", fontWeight: "700" }}>✓ BOOKED</span>}
                      {!isBooked && <span style={{ background: "#ef444422", color: "#ef4444", fontSize: "10px", padding: "1px 7px", borderRadius: "10px" }}>pending</span>}
                    </div>
                    {summary && <div style={{ color: "#64748b", fontSize: "12px", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</div>}
                    {booking?.reference && <div style={{ color: "#94a3b8", fontSize: "11px", marginTop: "2px", fontFamily: "monospace" }}>Ref: {booking.reference}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {events.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#cbd5e1" }}>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>📅</div>
          <p>No booking steps yet — add some steps to see the timeline.</p>
        </div>
      )}
    </div>
  );
}

// ─── Itinerary View ────────────────────────────────────────────────────────────
function ItineraryView({ holiday, onOpenBooking }) {
  const events = buildTimeline(holiday);
  const dated = events.filter(e => e.date);
  const undated = events.filter(e => !e.date);

  if (!holiday.startDate) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}>
        <div style={{ fontSize: "36px", marginBottom: "12px" }}>🗺️</div>
        <p>Set departure and return dates on the holiday to see the day-by-day itinerary.</p>
      </div>
    );
  }

  // Build day-by-day from startDate to endDate
  const start = new Date(holiday.startDate);
  const end   = holiday.endDate ? new Date(holiday.endDate) : new Date(holiday.startDate);
  const days  = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  const tripDuration = Math.round((end - start) / 86400000) + 1;

  return (
    <div style={{ paddingBottom: "20px" }}>
      {/* Trip duration banner */}
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 18px", marginBottom: "20px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.8px" }}>Departure</div>
          <div style={{ color: "#0f172a", fontSize: "15px", fontWeight: "600", marginTop: "2px" }}>{formatDate(holiday.startDate)}</div>
        </div>
        <div>
          <div style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.8px" }}>Return</div>
          <div style={{ color: "#0f172a", fontSize: "15px", fontWeight: "600", marginTop: "2px" }}>{holiday.endDate ? formatDate(holiday.endDate) : "—"}</div>
        </div>
        <div>
          <div style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.8px" }}>Duration</div>
          <div style={{ color: "#0ea5e9", fontSize: "15px", fontWeight: "700", marginTop: "2px" }}>{tripDuration} day{tripDuration !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {days.map((day, idx) => {
        const dateStr = day.toISOString().slice(0, 10);
        const dayEvents = dated.filter(e => e.date === dateStr);
        const dayNum = idx + 1;
        return (
          <div key={dateStr} style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
              <div style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "5px 12px", display: "flex", flexDirection: "column", alignItems: "center", minWidth: "52px" }}>
                <div style={{ color: "#0ea5e9", fontSize: "10px", fontWeight: "700", textTransform: "uppercase" }}>Day</div>
                <div style={{ color: "#0f172a", fontSize: "18px", fontWeight: "700", lineHeight: 1 }}>{dayNum}</div>
              </div>
              <div>
                <div style={{ color: "#0f172a", fontSize: "14px", fontWeight: "600" }}>{day.toLocaleDateString("en-GB", { weekday: "long" })}</div>
                <div style={{ color: "#94a3b8", fontSize: "12px" }}>{formatDate(dateStr)}</div>
              </div>
            </div>
            {dayEvents.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingLeft: "16px", borderLeft: "2px solid #bae6fd", marginLeft: "26px" }}>
                {dayEvents.map(({ step, booking }) => {
                  const isBooked = booking?.confirmed;
                  const time = getStepTime(step, booking);
                  const summary = getStepSummary(step, booking);
                  return (
                    <div key={step.id} onClick={() => onOpenBooking(step.id)}
                      style={{ background: "#ffffff", border: `1px solid ${isBooked ? "#10b98133" : "#e2e8f0"}`, borderRadius: "10px", padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", transition: "all 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "#0ea5e9"; e.currentTarget.style.background = "#f0f9ff"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = isBooked ? "#10b98133" : "#e2e8f0"; e.currentTarget.style.background = "#0f172a"; }}
                    >
                      <span style={{ fontSize: "20px" }}>{step.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ color: "#0f172a", fontSize: "13px", fontWeight: "600" }}>{step.label}</span>
                          {time && <span style={{ color: "#10b981", fontSize: "12px" }}>{time}</span>}
                        </div>
                        {summary && <div style={{ color: "#94a3b8", fontSize: "11px", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</div>}
                      </div>
                      {!isBooked && <span style={{ color: "#ef4444", fontSize: "10px", whiteSpace: "nowrap" }}>not booked</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ marginLeft: "70px", color: "#e2e8f0", fontSize: "13px", fontStyle: "italic" }}>No bookings for this day</div>
            )}
          </div>
        );
      })}

      {/* Undated items */}
      {undated.length > 0 && (
        <div style={{ marginTop: "8px" }}>
          <div style={{ color: "#94a3b8", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "10px" }}>No date set</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {undated.map(({ step, booking }) => (
              <div key={step.id} onClick={() => onOpenBooking(step.id)}
                style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#0ea5e9"; e.currentTarget.style.background = "#f0f9ff"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#0f172a"; }}
              >
                <span style={{ fontSize: "20px" }}>{step.icon}</span>
                <span style={{ color: "#64748b", fontSize: "13px" }}>{step.label}</span>
                {booking?.provider && <span style={{ color: "#94a3b8", fontSize: "12px" }}>· {booking.provider}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Packing List View ─────────────────────────────────────────────────────────
function PackingView({ holiday, onUpdate }) {
  const packing = holiday.packing || DEFAULT_PACKING.map(cat => ({
    category: cat.category,
    items: cat.items.map(name => ({ id: generateId(), name, checked: false }))
  }));

  const [newItemText, setNewItemText] = useState({});
  const [newCatText, setNewCatText] = useState("");

  function save(updated) {
    onUpdate(updated);
  }

  function toggleItem(catIdx, itemId) {
    const updated = packing.map((cat, ci) => ci !== catIdx ? cat : {
      ...cat, items: cat.items.map(it => it.id === itemId ? { ...it, checked: !it.checked } : it)
    });
    save(updated);
  }

  function addItem(catIdx) {
    const text = (newItemText[catIdx] || "").trim();
    if (!text) return;
    const updated = packing.map((cat, ci) => ci !== catIdx ? cat : {
      ...cat, items: [...cat.items, { id: generateId(), name: text, checked: false }]
    });
    save(updated);
    setNewItemText(prev => ({ ...prev, [catIdx]: "" }));
  }

  function removeItem(catIdx, itemId) {
    const updated = packing.map((cat, ci) => ci !== catIdx ? cat : {
      ...cat, items: cat.items.filter(it => it.id !== itemId)
    });
    save(updated);
  }

  function addCategory() {
    const text = newCatText.trim();
    if (!text) return;
    save([...packing, { category: text, items: [] }]);
    setNewCatText("");
  }

  function removeCategory(catIdx) {
    save(packing.filter((_, i) => i !== catIdx));
  }

  const totalItems = packing.reduce((acc, c) => acc + c.items.length, 0);
  const checkedItems = packing.reduce((acc, c) => acc + c.items.filter(i => i.checked).length, 0);

  return (
    <div style={{ paddingBottom: "20px" }}>
      {/* Progress */}
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 18px", marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ color: "#64748b", fontSize: "13px" }}>{checkedItems} of {totalItems} packed</span>
          <span style={{ color: checkedItems === totalItems && totalItems > 0 ? "#10b981" : "#0ea5e9", fontSize: "13px", fontWeight: "700" }}>
            {totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0}%
          </span>
        </div>
        <div style={{ height: "6px", background: "#e0f2fe", borderRadius: "3px" }}>
          <div style={{ height: "100%", borderRadius: "3px", width: `${totalItems > 0 ? (checkedItems / totalItems) * 100 : 0}%`, background: checkedItems === totalItems && totalItems > 0 ? "#10b981" : "linear-gradient(90deg, #0ea5e9, #38bdf8)", transition: "width 0.3s" }} />
        </div>
      </div>

      {/* Categories */}
      {packing.map((cat, catIdx) => (
        <div key={catIdx} style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <div style={{ color: "#64748b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.8px" }}>{cat.category}</div>
            <button onClick={() => removeCategory(catIdx)} style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", fontSize: "14px" }} title="Remove category">✕</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {cat.items.map(item => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "9px 12px" }}>
                <button onClick={() => toggleItem(catIdx, item.id)} style={{
                  width: "18px", height: "18px", borderRadius: "4px", flexShrink: 0, cursor: "pointer",
                  background: item.checked ? "#10b981" : "transparent",
                  border: `2px solid ${item.checked ? "#10b981" : "#cbd5e1"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "#ffffff"
                }}>{item.checked ? "✓" : ""}</button>
                <span style={{ color: item.checked ? "#94a3b8" : "#334155", fontSize: "14px", flex: 1, textDecoration: item.checked ? "line-through" : "none" }}>{item.name}</span>
                <button onClick={() => removeItem(catIdx, item.id)} style={{ background: "none", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: "14px", padding: "0 2px" }}>✕</button>
              </div>
            ))}
            {/* Add item */}
            <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
              <input value={newItemText[catIdx] || ""} onChange={e => setNewItemText(p => ({ ...p, [catIdx]: e.target.value }))}
                placeholder="Add item..." style={{ ...inputStyle, marginTop: 0, fontSize: "13px", padding: "7px 12px", flex: 1 }}
                onKeyDown={e => e.key === "Enter" && addItem(catIdx)} />
              <button onClick={() => addItem(catIdx)} style={{ ...secondaryBtn, padding: "7px 14px", fontSize: "13px" }}>+</button>
            </div>
          </div>
        </div>
      ))}

      {/* Add category */}
      <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
        <input value={newCatText} onChange={e => setNewCatText(e.target.value)}
          placeholder="New category..." style={{ ...inputStyle, marginTop: 0, flex: 1 }}
          onKeyDown={e => e.key === "Enter" && addCategory()} />
        <button onClick={addCategory} style={{ ...primaryBtn }}>+ Category</button>
      </div>
    </div>
  );
}


// ─── Supplier Ratings Summary ──────────────────────────────────────────────────
function SupplierSummary({ holidays }) {
  // Collect all rated bookings across all holidays
  const entries = [];
  holidays.forEach(h => {
    (h.steps || []).forEach(step => {
      const b = h.bookings?.[step.id];
      if (b?.provider && b?.rating != null) {
        entries.push({
          provider: b.provider,
          stepLabel: step.label,
          stepIcon: step.icon,
          rating: b.rating,
          holidayName: h.name,
          holidayEmoji: h.emoji,
        });
      }
    });
  });

  if (entries.length === 0) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}>
      <div style={{ fontSize: "36px", marginBottom: "12px" }}>⭐</div>
      <p>Rate your suppliers on individual bookings to see a summary here.</p>
    </div>
  );

  // Group by provider
  const byProvider = {};
  entries.forEach(e => {
    if (!byProvider[e.provider]) byProvider[e.provider] = { provider: e.provider, entries: [] };
    byProvider[e.provider].entries.push(e);
  });

  const providers = Object.values(byProvider).map(p => ({
    ...p,
    avgRating: p.entries.reduce((s, e) => s + e.rating, 0) / p.entries.length,
    count: p.entries.length,
  })).sort((a, b) => b.avgRating - a.avgRating);

  const RATING_MAP = { 1: { label: "Poor", emoji: "👎", color: "#ef4444" }, 2: { label: "OK", emoji: "😐", color: "#64748b" }, 3: { label: "Good", emoji: "👍", color: "#0ea5e9" }, 4: { label: "Excellent", emoji: "⭐", color: "#10b981" } };

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {providers.map(p => {
          const avg = p.avgRating;
          const color = avg >= 3.5 ? "#10b981" : avg >= 2.5 ? "#0ea5e9" : avg >= 1.5 ? "#64748b" : "#ef4444";
          return (
            <div key={p.provider} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div>
                  <div style={{ color: "#0f172a", fontSize: "15px", fontWeight: "600" }}>{p.provider}</div>
                  <div style={{ color: "#94a3b8", fontSize: "12px", marginTop: "2px" }}>
                    {[...new Set(p.entries.map(e => e.stepIcon + " " + e.stepLabel))].join("  ·  ")}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ color, fontSize: "22px", fontWeight: "700" }}>{avg.toFixed(1)}</div>
                  <div style={{ color: "#94a3b8", fontSize: "11px" }}>{p.count} review{p.count !== 1 ? "s" : ""}</div>
                </div>
              </div>
              {/* Star bar */}
              <div style={{ height: "4px", background: "#e0f2fe", borderRadius: "2px", marginBottom: "10px" }}>
                <div style={{ height: "100%", borderRadius: "2px", width: `${(avg / 4) * 100}%`, background: color, transition: "width 0.4s" }} />
              </div>
              {/* Individual ratings */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {p.entries.map((e, i) => {
                  const r = RATING_MAP[e.rating];
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                      <span style={{ color: "#94a3b8" }}>{e.holidayEmoji} {e.holidayName}</span>
                      <span style={{ color: r.color }}>{r.emoji} {r.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Memories View ─────────────────────────────────────────────────────────────
function MemoriesView({ holiday, onUpdate }) {
  const memories = holiday.memories || [];
  const [newText, setNewText] = useState("");
  const [newEmoji, setNewEmoji] = useState("✨");
  const MEMORY_EMOJIS = ["✨","🌅","🍕","🏖️","🎉","😂","😍","🥂","🚶","🌊","🏔️","🎭","🍷","📸","🤩","💃","🌺","🎶","⚡","🌙"];

  function addMemory() {
    if (!newText.trim()) return;
    onUpdate([...memories, { id: generateId(), emoji: newEmoji, text: newText.trim(), date: new Date().toISOString().slice(0,10) }]);
    setNewText("");
  }

  function removeMemory(id) {
    onUpdate(memories.filter(m => m.id !== id));
  }

  return (
    <div style={{ paddingBottom: "20px" }}>
      {/* Add memory */}
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "16px 18px", marginBottom: "20px" }}>
        <div style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "12px" }}>Add a memory</div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
          {MEMORY_EMOJIS.map(e => (
            <button key={e} onClick={() => setNewEmoji(e)} style={{ width: "34px", height: "34px", fontSize: "16px", background: newEmoji === e ? "#e0f2fe" : "#f1f5f9", border: `1px solid ${newEmoji === e ? "#0ea5e9" : "#e2e8f0"}`, borderRadius: "8px", cursor: "pointer" }}>{e}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="What made this trip special? A moment, a meal, a laugh..." rows={2}
            style={{ ...inputStyle, marginTop: 0, flex: 1, resize: "none" }}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), addMemory())} />
          <button onClick={addMemory} style={{ ...primaryBtn, alignSelf: "flex-end" }}>Add</button>
        </div>
      </div>

      {/* Memories list */}
      {memories.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#cbd5e1" }}>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>✨</div>
          <p>No memories yet — add highlights from your trip!</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[...memories].reverse().map(m => (
            <div key={m.id} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 16px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <span style={{ fontSize: "24px", flexShrink: 0 }}>{m.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#334155", fontSize: "14px", lineHeight: "1.5" }}>{m.text}</div>
                {m.date && <div style={{ color: "#cbd5e1", fontSize: "11px", marginTop: "4px" }}>{formatDate(m.date)}</div>}
              </div>
              <button onClick={() => removeMemory(m.id)} style={{ background: "none", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: "16px", padding: "0 2px", flexShrink: 0 }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step Card ─────────────────────────────────────────────────────────────────
function StepCard({ step, booking, currency = "GBP", onOpen, onMoveUp, onMoveDown, isFirst, isLast }) {
  const isBooked = booking?.confirmed;
  const rating = RATING_OPTIONS.find(r => r.value === (booking?.rating ?? null));
  const nights = (isHotel(step) || isVilla(step)) && booking?.checkIn && booking?.checkOut
    ? Math.round((new Date(booking.checkOut) - new Date(booking.checkIn)) / 86400000) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div onClick={onOpen} style={{
        background: "#ffffff", border: `1px solid ${isBooked ? "#10b98144" : "#e2e8f0"}`,
        borderRadius: "14px", padding: "16px",
        cursor: "pointer", transition: "all 0.2s", position: "relative", overflow: "hidden", flex: 1
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = isBooked ? "#10b981" : "#0ea5e9"; e.currentTarget.style.background = "#f0f9ff"; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = isBooked ? "#10b98144" : "#e2e8f0"; e.currentTarget.style.background = "#ffffff"; }}
      >
        {isBooked && <div style={{ position: "absolute", top: 0, right: 0, background: "#10b981", padding: "3px 10px 3px 12px", fontSize: "10px", color: "#ffffff", fontWeight: "700", borderBottomLeftRadius: "10px" }}>✓ BOOKED</div>}
        {!isBooked && <div style={{ position: "absolute", top: 0, right: 0, background: "#ef444422", padding: "3px 10px 3px 12px", fontSize: "10px", color: "#ef4444", fontWeight: "700", borderBottomLeftRadius: "10px", border: "1px solid #ff4d6633", borderTop: "none", borderRight: "none" }}>✗ NOT BOOKED</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ fontSize: "24px" }}>{step.icon}</span>
          {booking?.rating != null && <span style={{ fontSize: "15px", marginTop: "2px" }}>{rating?.emoji}</span>}
        </div>
        <div style={{ marginTop: "8px" }}>
          <div style={{ color: "#0f172a", fontSize: "14px", fontWeight: "600" }}>{step.label}</div>
          {booking?.provider && <div style={{ color: "#0ea5e9", fontSize: "12px", marginTop: "2px" }}>{booking.provider}{booking?.flightNumber ? ` · ${booking.flightNumber}` : ""}</div>}
          {booking?.reference && <div style={{ color: "#64748b", fontSize: "11px", marginTop: "2px", fontFamily: "monospace" }}>Ref: {booking.reference}</div>}

          {/* Flight */}
          {isFlight(step) && (booking?.departureAirport || booking?.arrivalAirport) && <div style={{ color: "#64748b", fontSize: "11px", marginTop: "4px" }}>{booking.departureAirport || "?"} → {booking.arrivalAirport || "?"}</div>}
          {isFlight(step) && booking?.flightDate && <div style={{ color: "#64748b", fontSize: "11px", marginTop: "2px" }}>📅 {formatDate(booking.flightDate)}</div>}
          {isFlight(step) && (booking?.departureTime || booking?.arrivalTime) && <div style={{ color: "#10b981", fontSize: "11px", marginTop: "2px" }}>{booking.departureTime || "?"} → {booking.arrivalTime || "?"}</div>}

          {/* Hotel / Villa */}
          {(isHotel(step) || isVilla(step)) && (booking?.checkIn || booking?.checkOut) && <div style={{ color: "#64748b", fontSize: "11px", marginTop: "4px" }}>{booking.checkIn ? formatDate(booking.checkIn) : "?"} → {booking.checkOut ? formatDate(booking.checkOut) : "?"}{nights ? ` (${nights}n)` : ""}</div>}
          {(isHotel(step) || isVilla(step)) && booking?.wifiPassword && <div style={{ color: "#94a3b8", fontSize: "11px", marginTop: "2px" }}>📶 {booking.wifiPassword}</div>}

          {/* Car hire */}
          {isCarHire(step) && (booking?.pickUpDate || booking?.dropOffDate) && <div style={{ color: "#64748b", fontSize: "11px", marginTop: "4px" }}>{booking.pickUpDate ? formatDate(booking.pickUpDate) : "?"} → {booking.dropOffDate ? formatDate(booking.dropOffDate) : "?"}</div>}
          {isCarHire(step) && booking?.carType && <div style={{ color: "#94a3b8", fontSize: "11px", marginTop: "2px" }}>🚗 {booking.carType}</div>}

          {/* Ferry */}
          {(isFerry(step) || isSailing(step)) && booking?.ferryDate && (
            <div style={{ color: "#64748b", fontSize: "11px", marginTop: "4px" }}>
              📅 {formatDate(booking.ferryDate)}{isSailing(step) && booking?.sailingReturnDate ? " → " + formatDate(booking.sailingReturnDate) : ""}
            </div>
          )}
          {(isFerry(step) || isSailing(step)) && (booking?.ferryDepartTime || booking?.ferryArriveTime) && <div style={{ color: "#10b981", fontSize: "11px", marginTop: "2px" }}>{booking.ferryDepartTime || "?"} → {booking.ferryArriveTime || "?"}</div>}

          {/* Parking */}
          {isParking(step) && booking?.carParkName && <div style={{ color: "#64748b", fontSize: "11px", marginTop: "4px" }}>{booking.carParkName}</div>}
          {isParking(step) && booking?.terminalName && <div style={{ color: "#94a3b8", fontSize: "11px", marginTop: "2px" }}>{booking.terminalName}</div>}

          {/* Transfer */}
          {isTransfer(step) && booking?.transferDate && <div style={{ color: "#64748b", fontSize: "11px", marginTop: "4px" }}>📅 {formatDate(booking.transferDate)}</div>}
          {isTransfer(step) && booking?.pickupTime && <div style={{ color: "#10b981", fontSize: "11px", marginTop: "2px" }}>⏰ {booking.pickupTime}</div>}
          {isTransfer(step) && booking?.pickupLocation && <div style={{ color: "#94a3b8", fontSize: "11px", marginTop: "2px" }}>{booking.pickupLocation}</div>}

          {(() => {
            const sym = getCurrencySymbol(booking?.stepCurrency || currency);
            const total = parseFloat((booking?.totalPrice || "").replace(/[^0-9.]/g, ""));
            const paid  = parseFloat((booking?.amountPaid  || "").replace(/[^0-9.]/g, ""));
            const outstanding = !isNaN(total) && !isNaN(paid) ? total - paid : null;
            if (!booking?.totalPrice) return null;
            return (
              <div style={{ marginTop: "5px" }}>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ color: "#10b981", fontSize: "11px" }}>{sym}{Math.ceil(total)}</span>
                  {outstanding !== null && outstanding > 0 && <span style={{ color: "#f59e0b", fontSize: "11px" }}>{sym}{Math.ceil(outstanding)} due</span>}
                  {outstanding !== null && outstanding <= 0 && <span style={{ color: "#10b981", fontSize: "11px" }}>✓ paid</span>}
                </div>
                {outstanding !== null && outstanding > 0 && booking?.paymentDueDate && (
                  <div style={{ color: "#64748b", fontSize: "11px", marginTop: "2px" }}>Due {formatDate(booking.paymentDueDate)}</div>
                )}
              </div>
            );
          })()}
          {booking?.notes && <div style={{ color: "#94a3b8", fontSize: "11px", marginTop: "5px", lineHeight: "1.4", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{booking.notes}</div>}
          {!booking?.provider && !booking?.notes && !booking?.departureAirport && !booking?.checkIn && !booking?.pickUpDate && !booking?.carParkName && !booking?.pickupTime && <div style={{ color: "#cbd5e1", fontSize: "12px", marginTop: "4px" }}>Tap to add details</div>}
        </div>
      </div>
      {/* Reorder bar — below the card, clearly separate */}
      <div style={{ display: "flex", gap: "4px" }}>
        <button
          onClick={e => { e.stopPropagation(); onMoveUp(); }}
          disabled={isFirst}
          style={{
            flex: 1, padding: "7px", background: "#f8fafc",
            border: "1px solid #e2e8f0", borderRadius: "8px",
            color: isFirst ? "#e2e8f0" : "#94a3b8", cursor: isFirst ? "default" : "pointer",
            fontSize: "14px", transition: "all 0.15s",
          }}
          onMouseEnter={e => { if (!isFirst) { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#64748b"; }}}
          onMouseLeave={e => { e.currentTarget.style.background = "#f0f9ff"; e.currentTarget.style.color = isFirst ? "#e2e8f0" : "#94a3b8"; }}
          title="Move up"
        >↑ Move up</button>
        <button
          onClick={e => { e.stopPropagation(); onMoveDown(); }}
          disabled={isLast}
          style={{
            flex: 1, padding: "7px", background: "#f8fafc",
            border: "1px solid #e2e8f0", borderRadius: "8px",
            color: isLast ? "#e2e8f0" : "#94a3b8", cursor: isLast ? "default" : "pointer",
            fontSize: "14px", transition: "all 0.15s",
          }}
          onMouseEnter={e => { if (!isLast) { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#64748b"; }}}
          onMouseLeave={e => { e.currentTarget.style.background = "#f0f9ff"; e.currentTarget.style.color = isLast ? "#e2e8f0" : "#94a3b8"; }}
          title="Move down"
        >↓ Move down</button>
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App({ user }) {
  const [holidays, setHolidays]         = useState([]);
  const [selectedId, setSelectedId]     = useState(null);
  const [view, setView]                 = useState("list");
  const [filterStatus, setFilterStatus] = useState("all");
  const [bookingModal, setBookingModal] = useState(null);
  const [holidayModal, setHolidayModal] = useState(null);
  const [addStepModal, setAddStepModal] = useState(false);
  const [detailTab, setDetailTab]       = useState("bookings");
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [rebookModal, setRebookModal]   = useState(null); // holiday to rebook from // bookings | timeline | itinerary | packing
  const [loaded, setLoaded]             = useState(false);
  const [saveError, setSaveError]       = useState(null);
  const [rates, setRates]               = useState(null);
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => {
    loadFromSupabase(user.id).then(d => setHolidays(d.holidays || [])).catch(console.error).finally(() => setLoaded(true));
  }, []);

  const persist = useCallback(async (hs) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveToSupabase(user.id, { holidays: hs }).catch(() => setSaveError("Save failed — check connection"));
    }, 600);
  }, []);

  const updateHolidays = fn => setHolidays(prev => { const next = fn(prev); persist(next); return next; });

  function updatePacking(packed) {
    updateHolidays(prev => prev.map(h => h.id === selectedId ? { ...h, packing: packed } : h));
  }

  function updateMemories(mems) {
    updateHolidays(prev => prev.map(h => h.id === selectedId ? { ...h, memories: mems } : h));
  }

  function rebookHoliday(source) {
    // Create a new holiday pre-populated with same steps (cleared bookings)
    const newH = {
      id: generateId(),
      name: source.name + " (copy)",
      destination: source.destination,
      emoji: source.emoji,
      currency: source.currency || "GBP",
      startDate: "", endDate: "", notes: "",
      steps: (source.steps || []).map(s => ({ ...s, id: generateId() })),
      bookings: {},
      packing: undefined,
      memories: [],
    };
    updateHolidays(prev => [...prev, newH]);
    setRebookModal(null);
    setSelectedId(newH.id);
    setView("detail");
    setDetailTab("bookings");
  }
  const selectedHoliday = holidays.find(h => h.id === selectedId);

  useEffect(() => {
    if (!selectedHoliday) return;
    const displayCurrency = selectedHoliday.currency || "GBP";
    fetchRates(displayCurrency).then(r => {
      if (r) { setRates(r); setRatesUpdatedAt(r.updatedAt); }
    });
  }, [selectedHoliday?.id, selectedHoliday?.currency]);

  function saveHoliday(form) {
    if (holidayModal?.holiday) updateHolidays(prev => prev.map(h => h.id === holidayModal.holiday.id ? { ...h, ...form } : h));
    else updateHolidays(prev => [...prev, { id: generateId(), ...form, steps: [], bookings: {} }]);
    setHolidayModal(null);
  }

  function deleteHoliday(id) {
    if (!window.confirm("Delete this holiday? All details will be lost.")) return;
    updateHolidays(prev => prev.filter(h => h.id !== id));
    setView("list");
  }

  function addStep(step) {
    updateHolidays(prev => prev.map(h => h.id === selectedId ? { ...h, steps: [...(h.steps || []), step] } : h));
    setAddStepModal(false);
  }

  function removeStep(stepId) {
    updateHolidays(prev => prev.map(h => {
      if (h.id !== selectedId) return h;
      const steps = (h.steps || []).filter(s => s.id !== stepId);
      const bookings = { ...h.bookings }; delete bookings[stepId];
      return { ...h, steps, bookings };
    }));
    setBookingModal(null);
  }

  function renameStep(stepId, newLabel) {
    updateHolidays(prev => prev.map(h => h.id !== selectedId ? h : { ...h, steps: (h.steps || []).map(s => s.id === stepId ? { ...s, label: newLabel } : s) }));
  }

  function moveStep(stepId, dir) {
    updateHolidays(prev => prev.map(h => {
      if (h.id !== selectedId) return h;
      const steps = [...(h.steps || [])];
      const i = steps.findIndex(s => s.id === stepId); const j = i + dir;
      if (j < 0 || j >= steps.length) return h;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...h, steps };
    }));
  }

  function saveBooking(stepId, data) {
    updateHolidays(prev => prev.map(h => h.id === selectedId ? { ...h, bookings: { ...h.bookings, [stepId]: data } } : h));
    setBookingModal(null);
  }

  function completionCount(h) {
    const steps = h.steps || [];
    return { confirmed: steps.filter(s => h.bookings?.[s.id]?.confirmed).length, total: steps.length };
  }

  const filteredHolidays = holidays.filter(h => filterStatus === "all" || getStatus(h) === filterStatus);

  if (!loaded) return <div style={{ ...appShell, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}><div style={{ color: "#0ea5e9", fontSize: "24px" }}>✈️ Loading...</div></div>;

  return (
    <div style={appShell}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-200px", right: "-200px", width: "600px", height: "600px", borderRadius: "50%", background: "radial-gradient(circle, #6c63ff15 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: "-100px", left: "-100px", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, #00d4aa10 0%, transparent 70%)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: "900px", margin: "0 auto", padding: "24px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {view === "detail" && <button onClick={() => setView("list")} style={{ background: "none", border: "none", color: "#0ea5e9", cursor: "pointer", fontSize: "20px", padding: 0 }}>←</button>}
              <h1 style={{ margin: 0, fontSize: "26px", fontFamily: "'Playfair Display', Georgia, serif", color: "#0f172a", letterSpacing: "-0.5px" }}>
                {view === "detail" && selectedHoliday ? <span>{selectedHoliday.emoji} {selectedHoliday.name}</span> : <>My <span style={{ color: "#0ea5e9" }}>Holidays</span></>}
              </h1>
            </div>
            {view === "detail" && selectedHoliday && <p style={{ margin: "4px 0 0 30px", color: "#94a3b8", fontSize: "13px" }}>{selectedHoliday.destination && `📍 ${selectedHoliday.destination}`}{selectedHoliday.startDate && ` · ${formatDate(selectedHoliday.startDate)}${selectedHoliday.endDate ? ` → ${formatDate(selectedHoliday.endDate)}` : ""}`}</p>}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {view === "detail" && selectedHoliday && (<>
              <button onClick={() => setRebookModal(selectedHoliday)} style={{ ...secondaryBtn, color: "#0ea5e9", borderColor: "#0ea5e944" }}>Rebook</button>
              <button onClick={() => setHolidayModal({ holiday: selectedHoliday })} style={secondaryBtn}>Edit</button>
              <button onClick={() => deleteHoliday(selectedHoliday.id)} style={{ ...secondaryBtn, color: "#ef4444", borderColor: "#ef444444" }}>Delete</button>
            </>)}
            {view === "list" && <>
              <button onClick={() => setHolidayModal({})} style={primaryBtn}>+ New Holiday</button>
              <button onClick={() => setShowSuppliers(s => !s)} style={{ ...secondaryBtn, color: showSuppliers ? "#0f172a" : "#64748b", background: showSuppliers ? "#e0f2fe" : "#f1f5f9" }}>⭐ Suppliers</button>
            </>}
            <button onClick={() => supabase.auth.signOut()} style={{ ...secondaryBtn, fontSize: "12px", padding: "8px 12px", color: "#94a3b8" }} title={user.email}>Sign out</button>
          </div>
        </div>

        {/* List view */}
        {view === "list" && (<>
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
            {["all","upcoming","active","past"].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "6px 16px", borderRadius: "20px", fontSize: "13px", cursor: "pointer", background: filterStatus === s ? "#0ea5e9" : "#f1f5f9", border: `1px solid ${filterStatus === s ? "#0ea5e9" : "#e2e8f0"}`, color: filterStatus === s ? "#0f172a" : "#64748b", textTransform: "capitalize" }}>{s}</button>
            ))}
          </div>
          {/* Supplier ratings panel */}
          {showSuppliers && (
            <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "20px", marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "16px", color: "#0f172a" }}>⭐ Supplier Ratings</div>
                <div style={{ color: "#94a3b8", fontSize: "12px" }}>Across all holidays</div>
              </div>
              <SupplierSummary holidays={holidays} />
            </div>
          )}

          {filteredHolidays.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "#94a3b8" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>🌍</div>
              <p style={{ fontSize: "16px" }}>No holidays yet. Add your first trip!</p>
              <button onClick={() => setHolidayModal({})} style={{ ...primaryBtn, marginTop: "16px" }}>+ Add Holiday</button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "14px" }}>
              {[...filteredHolidays].sort((a, b) => (a.startDate || "9999") < (b.startDate || "9999") ? -1 : 1).map(h => {
                const { confirmed, total } = completionCount(h);
                const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0;
                const status = getStatus(h);
                return (
                  <div key={h.id} onClick={() => { setSelectedId(h.id); setView("detail"); }}
                    style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "20px 24px", cursor: "pointer", display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "center", transition: "border-color 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "#0ea5e9"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "#e2e8f0"}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "22px" }}>{h.emoji}</span>
                        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "17px", color: "#0f172a" }}>{h.name}</span>
                        <span style={{ fontSize: "11px", padding: "2px 10px", borderRadius: "20px", textTransform: "uppercase", background: STATUS_COLORS[status] + "22", color: STATUS_COLORS[status], border: `1px solid ${STATUS_COLORS[status]}44` }}>{status}</span>
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: "13px", display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "10px" }}>
                        {h.destination && <span>📍 {h.destination}</span>}
                        {h.startDate && <span>📅 {formatDate(h.startDate)}{h.endDate ? ` → ${formatDate(h.endDate)}` : ""}</span>}
                        <span style={{ color: "#cbd5e1" }}>{total} step{total !== 1 ? "s" : ""}</span>
                      </div>
                      {total > 0 ? (<>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}><span>{confirmed}/{total} confirmed</span><span style={{ color: pct === 100 ? "#10b981" : "#0ea5e9" }}>{pct}%</span></div>
                        <div style={{ height: "4px", background: "#e0f2fe", borderRadius: "2px" }}><div style={{ height: "100%", borderRadius: "2px", width: `${pct}%`, background: pct === 100 ? "#10b981" : "linear-gradient(90deg, #0ea5e9, #38bdf8)", transition: "width 0.4s" }} /></div>
                        {(() => {
                          const displayC = h.currency || "GBP";
                          const sym = getCurrencySymbol(displayC);
                          let gt = 0, gp = 0, has = false;
                          (h.steps || []).forEach(s => {
                            const b = h.bookings?.[s.id] || {};
                            const stepC = b.stepCurrency || displayC;
                            const t = parseFloat((b.totalPrice || "").replace(/[^0-9.]/g, ""));
                            const p = parseFloat((b.amountPaid  || "").replace(/[^0-9.]/g, ""));
                            if (!isNaN(t)) { gt += convertAmount(t, stepC, displayC, rates); has = true; }
                            if (!isNaN(p)) gp += convertAmount(p, stepC, displayC, rates);
                          });
                          if (!has) return null;
                          const go = gt - gp;
                          return (
                            <div style={{ display: "flex", gap: "12px", marginTop: "8px", fontSize: "12px" }}>
                              {go > 0 && <span style={{ color: "#f59e0b" }}>{sym}{Math.ceil(go)} outstanding</span>}
                              {go <= 0 && <span style={{ color: "#10b981" }}>✓ all paid</span>}
                            </div>
                          );
                        })()}
                      </>) : <span style={{ fontSize: "12px", color: "#cbd5e1" }}>No booking steps added yet</span>}
                    </div>
                    <div style={{ color: "#e2e8f0", fontSize: "20px" }}>›</div>
                  </div>
                );
              })}
            </div>
          )}
        </>)}

        {/* Detail view */}
        {view === "detail" && selectedHoliday && (() => {
          const steps = selectedHoliday.steps || [];
          return (
            <div>
              {selectedHoliday.notes && <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "12px 16px", marginBottom: "16px", color: "#64748b", fontSize: "13px" }}>📝 {selectedHoliday.notes}</div>}

              {/* Tab bar */}
              <div style={{ display: "flex", gap: "4px", marginBottom: "20px", background: "#f8fafc", borderRadius: "10px", padding: "4px" }}>
                {[
                  { id: "bookings",   label: "Bookings",  icon: "📋" },
                  { id: "timeline",   label: "Timeline",  icon: "📅" },
                  { id: "itinerary",  label: "Itinerary", icon: "🗺️" },
                  { id: "packing",    label: "Packing",   icon: "🎒" },
                  { id: "memories",   label: "Memories",  icon: "✨" },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setDetailTab(tab.id)} style={{
                    flex: 1, padding: "8px 4px", borderRadius: "7px", border: "none", cursor: "pointer",
                    background: detailTab === tab.id ? "#e0f2fe" : "transparent",
                    color: detailTab === tab.id ? "#0f172a" : "#94a3b8",
                    fontSize: "12px", fontWeight: detailTab === tab.id ? "700" : "400",
                    transition: "all 0.15s", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px"
                  }}>
                    <span style={{ fontSize: "16px" }}>{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Bookings tab */}
              {detailTab === "bookings" && (<>
                {steps.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(255px, 1fr))", gap: "12px" }}>
                    {steps.map((step, idx) => (
                      <StepCard key={step.id} step={step} booking={selectedHoliday.bookings?.[step.id]}
                        currency={selectedHoliday.currency || "GBP"}
                        onOpen={() => setBookingModal({ stepId: step.id })}
                        onMoveUp={() => moveStep(step.id, -1)}
                        onMoveDown={() => moveStep(step.id, 1)}
                        isFirst={idx === 0} isLast={idx === steps.length - 1} />
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8", border: "1px dashed #bae6fd", borderRadius: "16px" }}>
                    <div style={{ fontSize: "40px", marginBottom: "12px" }}>📋</div>
                    <p style={{ fontSize: "15px", lineHeight: "1.6" }}>No booking steps yet.<br /><span style={{ color: "#94a3b8", fontSize: "13px" }}>Add just the steps that apply to this trip.</span></p>
                  </div>
                )}
                <button onClick={() => setAddStepModal(true)} style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "center", width: "100%", marginTop: "14px", padding: "13px", background: "#ffffff", border: "1px dashed #bae6fd", borderRadius: "12px", color: "#94a3b8", fontSize: "14px", cursor: "pointer", transition: "all 0.2s", boxSizing: "border-box" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#0ea5e9"; e.currentTarget.style.color = "#0ea5e9"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#94a3b8"; }}
                ><span style={{ fontSize: "18px" }}>＋</span> Add Booking Step</button>
              </>)}

              {/* Timeline tab */}
              {detailTab === "timeline" && (
                <TimelineView holiday={selectedHoliday} onOpenBooking={stepId => setBookingModal({ stepId })} />
              )}

              {/* Itinerary tab */}
              {detailTab === "itinerary" && (
                <ItineraryView holiday={selectedHoliday} onOpenBooking={stepId => setBookingModal({ stepId })} />
              )}

              {/* Packing tab */}
              {detailTab === "packing" && (
                <PackingView holiday={selectedHoliday} onUpdate={updatePacking} />
              )}

              {/* Memories tab */}
              {detailTab === "memories" && (
                <MemoriesView holiday={selectedHoliday} onUpdate={updateMemories} />
              )}

              {steps.length > 0 && (() => {
                const { confirmed, total } = completionCount(selectedHoliday);
                const status = getStatus(selectedHoliday);
                const daysTo = selectedHoliday.startDate ? Math.ceil((new Date(selectedHoliday.startDate) - new Date()) / 86400000) : null;
                let grandTotal = 0, grandPaid = 0, hasAnyPrice = false;
                const displayCur = selectedHoliday.currency || "GBP";
                steps.forEach(s => {
                  const b = selectedHoliday.bookings?.[s.id] || {};
                  const stepCur = b.stepCurrency || displayCur;
                  const t = parseFloat((b.totalPrice || "").replace(/[^0-9.]/g, ""));
                  const p = parseFloat((b.amountPaid  || "").replace(/[^0-9.]/g, ""));
                  if (!isNaN(t)) { grandTotal += convertAmount(t, stepCur, displayCur, rates); hasAnyPrice = true; }
                  if (!isNaN(p)) grandPaid  += convertAmount(p, stepCur, displayCur, rates);
                });
                const grandOutstanding = grandTotal - grandPaid;
                return (
                  <>
                    <div style={{ marginTop: "18px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 20px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
                      <Stat label="Progress" value={`${confirmed}/${total}`} color={confirmed === total && total > 0 ? "#10b981" : "#0f172a"} />
                      <Stat label="Status" value={status} color={STATUS_COLORS[status]} small />
                      {daysTo !== null && daysTo > 0 && <Stat label="Days to Go" value={daysTo} color="#0ea5e9" />}
                    </div>
                    {hasAnyPrice && (
                      <div style={{ marginTop: "10px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 20px" }}>
                        <div style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "12px" }}>Trip Finances</div>
                        {(() => { const sym = getCurrencySymbol(selectedHoliday.currency); return (
                        <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginBottom: "12px" }}>
                          <Stat label="Outstanding" value={grandOutstanding <= 0 ? "✓ All paid" : `${sym}${Math.ceil(grandOutstanding)}`} color={grandOutstanding <= 0 ? "#10b981" : "#f59e0b"} />
                        </div>); })()}
                        {grandOutstanding > 0 && (
                          <div style={{ height: "6px", background: "#e0f2fe", borderRadius: "3px" }}>
                            <div style={{ height: "100%", borderRadius: "3px", width: `${Math.min(100, (grandPaid / grandTotal) * 100).toFixed(1)}%`, background: "linear-gradient(90deg, #10b981, #0ea5e9)", transition: "width 0.4s" }} />
                          </div>
                        )}
                        {ratesUpdatedAt && (
                          <div style={{ marginTop: "8px", color: "#cbd5e1", fontSize: "11px" }}>
                            Exchange rates: {new Date(ratesUpdatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          );
        })()}
      </div>

      {addStepModal && <AddStepModal onAdd={addStep} onClose={() => setAddStepModal(false)} />}

      {bookingModal && selectedHoliday && (() => {
        const step = (selectedHoliday.steps || []).find(s => s.id === bookingModal.stepId);
        if (!step) return null;
        return <BookingModal step={step} booking={selectedHoliday.bookings?.[bookingModal.stepId]}
          currency={selectedHoliday.currency || "GBP"}
          onSave={data => saveBooking(bookingModal.stepId, data)}
          onDelete={() => removeStep(bookingModal.stepId)}
          onRename={newLabel => renameStep(bookingModal.stepId, newLabel)}
          onClose={() => setBookingModal(null)} />;
      })()}

      {holidayModal !== null && <HolidayModal holiday={holidayModal.holiday} onSave={saveHoliday} onClose={() => setHolidayModal(null)} />}

      {/* Rebook modal */}
      {rebookModal && (
        <div style={overlay}>
          <div style={{ ...modal, maxWidth: "420px" }}>
            <div style={modalHeader}>
              <h3 style={modalTitle}>Rebook Holiday</h3>
              <button onClick={() => setRebookModal(null)} style={closeBtn}>✕</button>
            </div>
            <p style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.6", marginBottom: "20px" }}>
              This will create a new copy of <strong style={{ color: "#0f172a" }}>{rebookModal.emoji} {rebookModal.name}</strong> with the same booking steps but no booking details filled in — ready for you to start fresh for a new trip.
            </p>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px", fontSize: "13px", color: "#94a3b8" }}>
              {(rebookModal.steps || []).length} step{(rebookModal.steps || []).length !== 1 ? "s" : ""} will be copied · All booking details cleared · Dates cleared
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={() => setRebookModal(null)} style={{ ...secondaryBtn, flex: 1 }}>Cancel</button>
              <button onClick={() => rebookHoliday(rebookModal)} style={{ ...primaryBtn, flex: 2 }}>Create Copy</button>
            </div>
          </div>
        </div>
      )}

      {saveError && (
        <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", background: "#ef4444", color: "#0f172a", padding: "10px 20px", borderRadius: "10px", fontSize: "13px", zIndex: 2000 }}>
          ⚠️ {saveError} <button onClick={() => setSaveError(null)} style={{ background: "none", border: "none", color: "#0f172a", marginLeft: "12px", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color, small }) {
  return (
    <div>
      <div style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.8px" }}>{label}</div>
      <div style={{ color: color || "#0f172a", fontSize: small ? "14px" : "20px", fontWeight: "700", marginTop: "2px", textTransform: small ? "capitalize" : "none" }}>{value}</div>
    </div>
  );
}

const appShell    = { minHeight: "100vh", background: "#f0f9ff", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#0f172a" };
const overlay     = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(8px)", padding: "20px" };
const modal       = { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", padding: "28px", width: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(14,165,233,0.12)" };
const modalHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "22px" };
const modalTitle  = { margin: 0, fontSize: "17px", color: "#0f172a" };
const closeBtn    = { background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "20px", lineHeight: 1 };
const labelStyle  = { display: "block", marginBottom: "14px", fontSize: "11px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px" };
const inputStyle  = { display: "block", width: "100%", marginTop: "6px", padding: "10px 13px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#0f172a", fontSize: "14px", outline: "none", boxSizing: "border-box" };
const primaryBtn  = { padding: "10px 20px", background: "linear-gradient(135deg, #0ea5e9, #38bdf8)", border: "none", borderRadius: "10px", color: "#ffffff", fontSize: "14px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" };
const secondaryBtn = { padding: "10px 16px", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", color: "#64748b", fontSize: "14px", cursor: "pointer", whiteSpace: "nowrap" };
const toggleBtn   = { padding: "10px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" };
const reorderBtn  = { background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "9px", lineHeight: 1, padding: "2px 3px" };
