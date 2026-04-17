import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase.js";

// ─── Constants ─────────────────────────────────────────────────────────────────

const SHARED_ROW_ID = "shared";

const STEP_TEMPLATES = [
  { icon: "✈️", label: "Outbound Flights" },
  { icon: "✈️", label: "Return Flights" },
  { icon: "🛫", label: "Internal Flight" },
  { icon: "🅿️", label: "Airport Parking" },
  { icon: "🚕", label: "Taxi to Airport" },
  { icon: "🚂", label: "Train to Airport" },
  { icon: "🏨", label: "Hotel" },
  { icon: "🏠", label: "Villa / Apartment" },
  { icon: "🚗", label: "Car Hire" },
  { icon: "🚌", label: "Airport Transfer" },
  { icon: "🛡️", label: "Travel Insurance" },
  { icon: "📋", label: "Visa / ETA" },
  { icon: "💱", label: "Currency" },
  { icon: "🎭", label: "Activities / Tours" },
  { icon: "🚢", label: "Ferry / Cruise" },
  { icon: "🎫", label: "Theme Park Tickets" },
  { icon: "🍽️", label: "Restaurant Reservation" },
  { icon: "🏥", label: "Travel Vaccinations" },
  { icon: "📱", label: "SIM Card / Roaming" },
  { icon: "🎒", label: "Tour Package" },
];

const STEP_ICONS = ["✈️","🛫","🅿️","🚕","🚂","🏨","🏠","🚗","🚌","🛡️","📋","💱","🎭","🚢","🎫","🍽️","🏥","📱","🎒","⛵","🏔️","🌊","🎿","🏖️","🚁","🎪"];

const RATING_OPTIONS = [
  { value: null,  label: "Unrated",   emoji: "—"  },
  { value: 1,     label: "Poor",      emoji: "👎" },
  { value: 2,     label: "OK",        emoji: "😐" },
  { value: 3,     label: "Good",      emoji: "👍" },
  { value: 4,     label: "Excellent", emoji: "⭐" },
];

const STATUS_COLORS = { upcoming: "#00d4aa", active: "#FFD93D", past: "#a0a0b0" };

// ─── Helpers ───────────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

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

// ─── Supabase persistence ──────────────────────────────────────────────────────
// We store everything in a single row in the `app_data` table:
//   id TEXT PRIMARY KEY, data JSONB, updated_at TIMESTAMPTZ
// The row id is always SHARED_ROW_ID so all users share one dataset.

async function loadFromSupabase() {
  const { data, error } = await supabase
    .from("app_data")
    .select("data")
    .eq("id", SHARED_ROW_ID)
    .maybeSingle();
  if (error) throw error;
  return data?.data ?? { holidays: [] };
}

async function saveToSupabase(payload) {
  const { error } = await supabase
    .from("app_data")
    .upsert({ id: SHARED_ROW_ID, data: payload, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ─── Modals ────────────────────────────────────────────────────────────────────

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
          {[["template", "Choose from list"], ["custom", "Custom step"]].map(([v, l]) => (
            <button key={v} onClick={() => setMode(v)} style={{
              ...toggleBtn, flex: 1,
              background: mode === v ? "#1e1e3a" : "#1a1a2e",
              border: `1px solid ${mode === v ? "#6c63ff" : "#2a2a45"}`,
              color: mode === v ? "#fff" : "#888"
            }}>{l}</button>
          ))}
        </div>
        {mode === "template" ? (
          <>
            <input placeholder="Search steps…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, marginBottom: "12px" }} autoFocus />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", maxHeight: "320px", overflowY: "auto" }}>
              {filtered.map((t, i) => (
                <button key={i} onClick={() => onAdd({ id: generateId(), icon: t.icon, label: t.label })}
                  style={{
                    display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px",
                    background: "#1a1a2e", border: "1px solid #2a2a45", borderRadius: "10px",
                    cursor: "pointer", color: "#ccc", fontSize: "13px", textAlign: "left", transition: "all 0.15s"
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#6c63ff"; e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a45"; e.currentTarget.style.color = "#ccc"; }}
                >
                  <span style={{ fontSize: "20px" }}>{t.icon}</span><span>{t.label}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ color: "#555", fontSize: "13px", gridColumn: "1/-1", padding: "16px 0" }}>
                  No matches — try Custom step
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <label style={labelStyle}>
              <span>Icon</span>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
                {STEP_ICONS.map(e => (
                  <button key={e} onClick={() => setCustomIcon(e)} style={{
                    width: "38px", height: "38px", fontSize: "18px",
                    background: customIcon === e ? "#1e1e3a" : "#1a1a2e",
                    border: `1px solid ${customIcon === e ? "#6c63ff" : "#2a2a45"}`,
                    borderRadius: "8px", cursor: "pointer"
                  }}>{e}</button>
                ))}
              </div>
            </label>
            <label style={labelStyle}>
              <span>Step Name</span>
              <input autoFocus value={customLabel} onChange={e => setCustomLabel(e.target.value)}
                placeholder="e.g. Florence to Rome Train…" style={inputStyle}
                onKeyDown={e => e.key === "Enter" && customLabel.trim() &&
                  onAdd({ id: generateId(), icon: customIcon, label: customLabel.trim() })} />
            </label>
            <button
              onClick={() => customLabel.trim() && onAdd({ id: generateId(), icon: customIcon, label: customLabel.trim() })}
              style={{ ...primaryBtn, width: "100%", opacity: customLabel.trim() ? 1 : 0.4 }}
            >Add Step</button>
          </>
        )}
      </div>
    </div>
  );
}

const FLIGHT_ICONS = ["✈️", "🛫"];
function isFlight(step) {
  return FLIGHT_ICONS.includes(step.icon) ||
    /flight|fly|fligh/i.test(step.label);
}

// Convert a File to base64 string
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Call Claude API to extract flight/booking details from an image
async function extractFromImage(base64Data, mediaType, isFlightStep) {
  const prompt = isFlightStep
    ? `Extract all flight booking details from this image. Return ONLY a JSON object with these fields (use empty string if not found):
{
  "provider": "airline name",
  "reference": "booking reference / PNR code",
  "departureAirport": "departure airport name and IATA code e.g. Manchester (MAN)",
  "arrivalAirport": "arrival airport name and IATA code e.g. Palermo (PMO)",
  "flightDate": "YYYY-MM-DD date of the flight",
  "departureTime": "HH:MM in 24h format",
  "arrivalTime": "HH:MM in 24h format",
  "dateBooked": "YYYY-MM-DD date the booking was made, if visible",
  "notes": "any other useful info like flight number, seat, baggage allowance"
}`
    : `Extract booking details from this image. Return ONLY a JSON object with these fields (use empty string if not found):
{
  "provider": "company or provider name",
  "reference": "booking reference or confirmation number",
  "dateBooked": "YYYY-MM-DD if visible",
  "notes": "any other useful details"
}`;

  const response = await fetch("/api/scan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64Data } },
          { type: "text", text: prompt }
        ]
      }]
    })
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || "";
  // Strip any markdown fences just in case
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

function BookingModal({ step, booking, onSave, onDelete, onClose, onRename }) {
  const isFlightStep = isFlight(step);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    confirmed:        booking?.confirmed        || false,
    provider:         booking?.provider         || "",
    reference:        booking?.reference        || "",
    notes:            booking?.notes            || "",
    rating:           booking?.rating           ?? null,
    dateBooked:       booking?.dateBooked       || "",
    departureAirport: booking?.departureAirport || "",
    arrivalAirport:   booking?.arrivalAirport   || "",
    departureTime:    booking?.departureTime    || "",
    arrivalTime:      booking?.arrivalTime      || "",
  });
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(step.label);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [scanPreview, setScanPreview] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const commitRename = () => {
    setEditingName(false);
    if (newName.trim()) onRename(newName.trim());
  };

  const handlePhotoScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    setScanning(true);
    setScanPreview(URL.createObjectURL(file));
    try {
      const base64 = await fileToBase64(file);
      const extracted = await extractFromImage(base64, file.type, isFlightStep);
      // Merge extracted values into form, only overwriting empty fields
      setForm(prev => {
        const next = { ...prev };
        Object.entries(extracted).forEach(([k, v]) => {
          if (v && next[k] !== undefined) next[k] = v;
        });
        return next;
      });
    } catch (err) {
      console.error(err);
      setScanError("Couldn't read the image — try a clearer photo or fill in manually.");
    } finally {
      setScanning(false);
      // Reset file input so same file can be reselected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div style={overlay}>
      <div style={{ ...modal, maxWidth: "480px" }}>
        <div style={modalHeader}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "22px" }}>{step.icon}</span>
            {editingName ? (
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditingName(false); setNewName(step.label); } }}
                style={{ ...inputStyle, margin: 0, padding: "4px 8px", fontSize: "16px", width: "220px" }} />
            ) : (
              <h3 style={{ margin: 0, fontSize: "17px", color: "#fff", cursor: "pointer" }}
                title="Click to rename" onClick={() => setEditingName(true)}>
                {step.label} <span style={{ fontSize: "12px", color: "#444" }}>✏️</span>
              </h3>
            )}
          </div>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {/* Photo scan button */}
        <div style={{ marginBottom: "20px" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoScan}
            style={{ display: "none" }}
            id="photo-scan-input"
          />
          <label htmlFor="photo-scan-input" style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            padding: "11px", borderRadius: "10px", cursor: scanning ? "wait" : "pointer",
            background: scanning ? "#1a1a2e" : "#1e1e3a",
            border: "1px dashed #6c63ff",
            color: scanning ? "#666" : "#a78bfa",
            fontSize: "13px", fontWeight: "600", transition: "all 0.2s",
            opacity: scanning ? 0.7 : 1
          }}>
            {scanning ? (
              <><span style={{ fontSize: "16px" }}>⏳</span> Scanning image…</>
            ) : (
              <><span style={{ fontSize: "16px" }}>📷</span> Scan from photo or screenshot</>
            )}
          </label>
          {scanPreview && !scanning && (
            <div style={{ marginTop: "8px", borderRadius: "8px", overflow: "hidden", maxHeight: "80px", display: "flex", justifyContent: "center", background: "#1a1a2e" }}>
              <img src={scanPreview} alt="Scanned" style={{ maxHeight: "80px", objectFit: "contain" }} />
            </div>
          )}
          {scanError && (
            <div style={{ marginTop: "6px", color: "#ff4d66", fontSize: "12px" }}>⚠️ {scanError}</div>
          )}
          {!scanning && scanPreview && !scanError && (
            <div style={{ marginTop: "6px", color: "#00d4aa", fontSize: "12px" }}>✓ Details extracted — check and edit below</div>
          )}
        </div>

        {/* Status */}
        <label style={labelStyle}>
          <span>Status</span>
          <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
            {[true, false].map(v => (
              <button key={String(v)} onClick={() => set("confirmed", v)} style={{
                ...toggleBtn, flex: 1,
                background: form.confirmed === v ? (v ? "#00d4aa22" : "#ff4d6622") : "#1a1a2e",
                border: `1px solid ${form.confirmed === v ? (v ? "#00d4aa" : "#ff4d66") : "#2a2a45"}`,
                color: form.confirmed === v ? (v ? "#00d4aa" : "#ff4d66") : "#888"
              }}>{v ? "✓ Booked" : "○ Not Booked"}</button>
            ))}
          </div>
        </label>

        {/* Flight-specific fields */}
        {isFlightStep && (
          <>
            <div style={{ display: "flex", gap: "12px" }}>
              <label style={{ ...labelStyle, flex: 1 }}>
                <span>Departure Airport</span>
                <input value={form.departureAirport} onChange={e => set("departureAirport", e.target.value)}
                  placeholder="e.g. Manchester (MAN)" style={inputStyle} />
              </label>
              <label style={{ ...labelStyle, flex: 1 }}>
                <span>Arrival Airport</span>
                <input value={form.arrivalAirport} onChange={e => set("arrivalAirport", e.target.value)}
                  placeholder="e.g. Palermo (PMO)" style={inputStyle} />
              </label>
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <label style={{ ...labelStyle, flex: 1 }}>
                <span>Flight Date</span>
                <input type="date" value={form.flightDate || ""} onChange={e => set("flightDate", e.target.value)}
                  style={inputStyle} />
              </label>
              <label style={{ ...labelStyle, flex: 1 }}>
                <span>&nbsp;</span>
                <div style={{ ...inputStyle, background: "transparent", border: "none", padding: 0 }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: "12px" }}>
              <label style={{ ...labelStyle, flex: 1 }}>
                <span>Departure Time</span>
                <input type="time" value={form.departureTime} onChange={e => set("departureTime", e.target.value)}
                  style={inputStyle} />
              </label>
              <label style={{ ...labelStyle, flex: 1 }}>
                <span>Arrival Time</span>
                <input type="time" value={form.arrivalTime} onChange={e => set("arrivalTime", e.target.value)}
                  style={inputStyle} />
              </label>
            </div>
          </>
        )}

        {/* Common fields */}
        {[
          { key: "provider",   label: "Airline / Provider",  placeholder: isFlightStep ? "e.g. Ryanair, EasyJet…" : "e.g. Hilton, Hertz…" },
          { key: "reference",  label: "Booking Reference",   placeholder: "e.g. ABC123XY" },
          { key: "dateBooked", label: "Date Booked",         type: "date" },
        ].map(({ key, label, placeholder, type }) => (
          <label key={key} style={labelStyle}>
            <span>{label}</span>
            <input type={type || "text"} value={form[key]}
              onChange={e => set(key, e.target.value)} placeholder={placeholder} style={inputStyle} />
          </label>
        ))}

        <label style={labelStyle}>
          <span>Notes</span>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
            placeholder={isFlightStep ? "Seat numbers, baggage allowance, terminal info…" : "Confirmation details, special requirements…"}
            rows={3} style={{ ...inputStyle, resize: "vertical" }} />
        </label>

        <label style={labelStyle}>
          <span>Rating</span>
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            {RATING_OPTIONS.map(r => (
              <button key={String(r.value)} onClick={() => set("rating", r.value)} style={{
                ...toggleBtn, flex: 1,
                background: form.rating === r.value ? "#1e1e3a" : "#1a1a2e",
                border: `1px solid ${form.rating === r.value ? "#6c63ff" : "#2a2a45"}`,
                color: form.rating === r.value ? "#fff" : "#888", fontSize: "18px"
              }} title={r.label}>{r.emoji}</button>
            ))}
          </div>
        </label>

        <div style={{ display: "flex", gap: "8px", marginTop: "24px" }}>
          <button onClick={onDelete}
            style={{ ...secondaryBtn, color: "#ff4d66", borderColor: "#ff4d6644", padding: "10px 14px" }}
            title="Remove this step">🗑</button>
          <button onClick={onClose} style={{ ...secondaryBtn, flex: 1 }}>Cancel</button>
          <button onClick={() => onSave(form)} style={{ ...primaryBtn, flex: 2 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function HolidayModal({ holiday, onSave, onClose }) {
  const [form, setForm] = useState({
    name: holiday?.name || "", destination: holiday?.destination || "",
    startDate: holiday?.startDate || "", endDate: holiday?.endDate || "",
    notes: holiday?.notes || "", emoji: holiday?.emoji || "✈️",
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
              <button key={e} onClick={() => set("emoji", e)} style={{
                width: "40px", height: "40px", fontSize: "20px",
                background: form.emoji === e ? "#1e1e3a" : "#1a1a2e",
                border: `1px solid ${form.emoji === e ? "#6c63ff" : "#2a2a45"}`,
                borderRadius: "8px", cursor: "pointer"
              }}>{e}</button>
            ))}
          </div>
        </label>
        {[
          { key: "name",        label: "Holiday Name", placeholder: "e.g. Summer in Tuscany 2025" },
          { key: "destination", label: "Destination",  placeholder: "e.g. Florence, Italy" },
        ].map(({ key, label, placeholder }) => (
          <label key={key} style={labelStyle}>
            <span>{label}</span>
            <input value={form[key]} onChange={e => set(key, e.target.value)}
              placeholder={placeholder} style={inputStyle} />
          </label>
        ))}
        <div style={{ display: "flex", gap: "12px" }}>
          {[{ key: "startDate", label: "Departure" }, { key: "endDate", label: "Return" }].map(({ key, label }) => (
            <label key={key} style={{ ...labelStyle, flex: 1 }}>
              <span>{label}</span>
              <input type="date" value={form[key]} onChange={e => set(key, e.target.value)} style={inputStyle} />
            </label>
          ))}
        </div>
        <label style={labelStyle}>
          <span>Notes</span>
          <textarea value={form.notes} onChange={e => set("notes", e.target.value)}
            placeholder="Any general notes…" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
        </label>
        <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
          <button onClick={onClose} style={{ ...secondaryBtn, flex: 1 }}>Cancel</button>
          <button onClick={() => form.name && onSave(form)}
            style={{ ...primaryBtn, flex: 2, opacity: form.name ? 1 : 0.4 }}>Save Holiday</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [holidays, setHolidays]       = useState([]);
  const [selectedId, setSelectedId]   = useState(null);
  const [view, setView]               = useState("list");
  const [filterStatus, setFilterStatus] = useState("all");
  const [bookingModal, setBookingModal] = useState(null);
  const [holidayModal, setHolidayModal] = useState(null);
  const [addStepModal, setAddStepModal] = useState(false);
  const [loaded, setLoaded]           = useState(false);
  const [saveError, setSaveError]     = useState(null);
  const saveTimer = useRef(null);

  // Load on mount
  useEffect(() => {
    loadFromSupabase()
      .then(d => setHolidays(d.holidays || []))
      .catch(err => console.error("Load error:", err))
      .finally(() => setLoaded(true));
  }, []);

  // Debounced save — waits 600 ms after last change before writing to Supabase
  const persist = useCallback((newHolidays) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveToSupabase({ holidays: newHolidays })
        .catch(err => { console.error("Save error:", err); setSaveError("Save failed — check connection"); });
    }, 600);
  }, []);

  const updateHolidays = fn => {
    setHolidays(prev => {
      const next = fn(prev);
      persist(next);
      return next;
    });
  };

  const selectedHoliday = holidays.find(h => h.id === selectedId);

  // ── Holiday CRUD ────────────────────────────────────────────────────────────
  function saveHoliday(form) {
    if (holidayModal?.holiday) {
      updateHolidays(prev => prev.map(h => h.id === holidayModal.holiday.id ? { ...h, ...form } : h));
    } else {
      updateHolidays(prev => [...prev, { id: generateId(), ...form, steps: [], bookings: {} }]);
    }
    setHolidayModal(null);
  }

  function deleteHoliday(id) {
    if (!window.confirm("Delete this holiday? All details will be lost.")) return;
    updateHolidays(prev => prev.filter(h => h.id !== id));
    setView("list");
  }

  // ── Step management ─────────────────────────────────────────────────────────
  function addStep(step) {
    updateHolidays(prev => prev.map(h =>
      h.id === selectedId ? { ...h, steps: [...(h.steps || []), step] } : h
    ));
    setAddStepModal(false);
  }

  function removeStep(stepId) {
    updateHolidays(prev => prev.map(h => {
      if (h.id !== selectedId) return h;
      const steps = (h.steps || []).filter(s => s.id !== stepId);
      const bookings = { ...h.bookings };
      delete bookings[stepId];
      return { ...h, steps, bookings };
    }));
    setBookingModal(null);
  }

  function renameStep(stepId, newLabel) {
    updateHolidays(prev => prev.map(h =>
      h.id !== selectedId ? h
        : { ...h, steps: (h.steps || []).map(s => s.id === stepId ? { ...s, label: newLabel } : s) }
    ));
  }

  function moveStep(stepId, dir) {
    updateHolidays(prev => prev.map(h => {
      if (h.id !== selectedId) return h;
      const steps = [...(h.steps || [])];
      const i = steps.findIndex(s => s.id === stepId);
      const j = i + dir;
      if (j < 0 || j >= steps.length) return h;
      [steps[i], steps[j]] = [steps[j], steps[i]];
      return { ...h, steps };
    }));
  }

  // ── Booking CRUD ────────────────────────────────────────────────────────────
  function saveBooking(stepId, data) {
    updateHolidays(prev => prev.map(h =>
      h.id === selectedId ? { ...h, bookings: { ...h.bookings, [stepId]: data } } : h
    ));
    setBookingModal(null);
  }

  function completionCount(h) {
    const steps = h.steps || [];
    return { confirmed: steps.filter(s => h.bookings?.[s.id]?.confirmed).length, total: steps.length };
  }

  const filteredHolidays = holidays.filter(h =>
    filterStatus === "all" || getStatus(h) === filterStatus
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  if (!loaded) return (
    <div style={{ ...appShell, display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ color: "#6c63ff", fontSize: "24px" }}>✈️ Loading…</div>
    </div>
  );

  return (
    <div style={appShell}>
      {/* Background glows */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
        <div style={{ position: "absolute", top: "-200px", right: "-200px", width: "600px", height: "600px", borderRadius: "50%", background: "radial-gradient(circle, #6c63ff15 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: "-100px", left: "-100px", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, #00d4aa10 0%, transparent 70%)" }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: "900px", margin: "0 auto", padding: "24px 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {view === "detail" && (
                <button onClick={() => setView("list")}
                  style={{ background: "none", border: "none", color: "#6c63ff", cursor: "pointer", fontSize: "20px", padding: 0 }}>←</button>
              )}
              <h1 style={{ margin: 0, fontSize: "26px", fontFamily: "'Playfair Display', Georgia, serif", color: "#fff", letterSpacing: "-0.5px" }}>
                {view === "detail" && selectedHoliday
                  ? <span>{selectedHoliday.emoji} {selectedHoliday.name}</span>
                  : <>My <span style={{ color: "#6c63ff" }}>Holidays</span></>}
              </h1>
            </div>
            {view === "detail" && selectedHoliday && (
              <p style={{ margin: "4px 0 0 30px", color: "#555", fontSize: "13px" }}>
                {selectedHoliday.destination && `📍 ${selectedHoliday.destination}`}
                {selectedHoliday.startDate && ` · ${formatDate(selectedHoliday.startDate)}${selectedHoliday.endDate ? ` → ${formatDate(selectedHoliday.endDate)}` : ""}`}
              </p>
            )}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {view === "detail" && selectedHoliday && (
              <>
                <button onClick={() => setHolidayModal({ holiday: selectedHoliday })} style={secondaryBtn}>Edit</button>
                <button onClick={() => deleteHoliday(selectedHoliday.id)}
                  style={{ ...secondaryBtn, color: "#ff4d66", borderColor: "#ff4d6644" }}>Delete</button>
              </>
            )}
            {view === "list" && (
              <button onClick={() => setHolidayModal({})} style={primaryBtn}>+ New Holiday</button>
            )}
          </div>
        </div>

        {/* ── LIST VIEW ── */}
        {view === "list" && (
          <>
            <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
              {["all", "upcoming", "active", "past"].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} style={{
                  padding: "6px 16px", borderRadius: "20px", fontSize: "13px", cursor: "pointer",
                  background: filterStatus === s ? "#6c63ff" : "#1a1a2e",
                  border: `1px solid ${filterStatus === s ? "#6c63ff" : "#2a2a45"}`,
                  color: filterStatus === s ? "#fff" : "#888", textTransform: "capitalize"
                }}>{s}</button>
              ))}
            </div>

            {filteredHolidays.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 20px", color: "#444" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>🌍</div>
                <p style={{ fontSize: "16px" }}>No holidays yet. Add your first trip!</p>
                <button onClick={() => setHolidayModal({})} style={{ ...primaryBtn, marginTop: "16px" }}>+ Add Holiday</button>
              </div>
            ) : (
              <div style={{ display: "grid", gap: "14px" }}>
                {[...filteredHolidays]
                  .sort((a, b) => (a.startDate || "9999") < (b.startDate || "9999") ? -1 : 1)
                  .map(h => {
                    const { confirmed, total } = completionCount(h);
                    const pct = total > 0 ? Math.round((confirmed / total) * 100) : 0;
                    const status = getStatus(h);
                    return (
                      <div key={h.id}
                        onClick={() => { setSelectedId(h.id); setView("detail"); }}
                        style={{
                          background: "#12121f", border: "1px solid #2a2a45", borderRadius: "16px",
                          padding: "20px 24px", cursor: "pointer",
                          display: "grid", gridTemplateColumns: "1fr auto", gap: "12px", alignItems: "center",
                          transition: "border-color 0.2s"
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = "#6c63ff"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "#2a2a45"}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "22px" }}>{h.emoji}</span>
                            <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "17px", color: "#fff" }}>{h.name}</span>
                            <span style={{
                              fontSize: "11px", padding: "2px 10px", borderRadius: "20px", textTransform: "uppercase",
                              background: STATUS_COLORS[status] + "22", color: STATUS_COLORS[status],
                              border: `1px solid ${STATUS_COLORS[status]}44`
                            }}>{status}</span>
                          </div>
                          <div style={{ color: "#555", fontSize: "13px", display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "10px" }}>
                            {h.destination && <span>📍 {h.destination}</span>}
                            {h.startDate && <span>📅 {formatDate(h.startDate)}{h.endDate ? ` → ${formatDate(h.endDate)}` : ""}</span>}
                            <span style={{ color: "#3a3a5a" }}>{total} step{total !== 1 ? "s" : ""}</span>
                          </div>
                          {total > 0 ? (
                            <>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#444", marginBottom: "4px" }}>
                                <span>{confirmed}/{total} confirmed</span>
                                <span style={{ color: pct === 100 ? "#00d4aa" : "#6c63ff" }}>{pct}%</span>
                              </div>
                              <div style={{ height: "4px", background: "#1e1e3a", borderRadius: "2px" }}>
                                <div style={{ height: "100%", borderRadius: "2px", width: `${pct}%`, background: pct === 100 ? "#00d4aa" : "linear-gradient(90deg, #6c63ff, #a78bfa)", transition: "width 0.4s" }} />
                              </div>
                            </>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#333" }}>No booking steps added yet</span>
                          )}
                        </div>
                        <div style={{ color: "#2a2a45", fontSize: "20px" }}>›</div>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        )}

        {/* ── DETAIL VIEW ── */}
        {view === "detail" && selectedHoliday && (() => {
          const steps = selectedHoliday.steps || [];
          return (
            <div>
              {selectedHoliday.notes && (
                <div style={{ background: "#12121f", border: "1px solid #2a2a45", borderRadius: "12px", padding: "12px 16px", marginBottom: "18px", color: "#777", fontSize: "13px" }}>
                  📝 {selectedHoliday.notes}
                </div>
              )}

              {steps.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(255px, 1fr))", gap: "12px" }}>
                  {steps.map((step, idx) => {
                    const booking = selectedHoliday.bookings?.[step.id];
                    const isBooked = booking?.confirmed;
                    const rating = RATING_OPTIONS.find(r => r.value === (booking?.rating ?? null));
                    return (
                      <div key={step.id} style={{ position: "relative", display: "flex", flexDirection: "column" }}>
                        <div style={{ position: "absolute", top: "8px", left: "8px", display: "flex", flexDirection: "column", gap: "2px", zIndex: 2 }}>
                          <button onClick={e => { e.stopPropagation(); moveStep(step.id, -1); }} disabled={idx === 0}
                            style={{ ...reorderBtn, opacity: idx === 0 ? 0.15 : 0.45 }}>▲</button>
                          <button onClick={e => { e.stopPropagation(); moveStep(step.id, 1); }} disabled={idx === steps.length - 1}
                            style={{ ...reorderBtn, opacity: idx === steps.length - 1 ? 0.15 : 0.45 }}>▼</button>
                        </div>
                        <div onClick={() => setBookingModal({ stepId: step.id })}
                          style={{
                            background: "#12121f",
                            border: `1px solid ${isBooked ? "#00d4aa44" : "#2a2a45"}`,
                            borderRadius: "14px", padding: "16px 16px 16px 36px",
                            cursor: "pointer", transition: "all 0.2s", position: "relative", overflow: "hidden", flex: 1
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = isBooked ? "#00d4aa" : "#6c63ff"; e.currentTarget.style.background = "#161628"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = isBooked ? "#00d4aa44" : "#2a2a45"; e.currentTarget.style.background = "#12121f"; }}
                        >
                          {isBooked && (
                            <div style={{ position: "absolute", top: 0, right: 0, background: "#00d4aa", padding: "3px 10px 3px 12px", fontSize: "10px", color: "#001a15", fontWeight: "700", borderBottomLeftRadius: "10px" }}>✓ BOOKED</div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                            <span style={{ fontSize: "24px" }}>{step.icon}</span>
                            {booking?.rating !== undefined && booking?.rating !== null && (
                              <span style={{ fontSize: "15px", marginTop: "2px" }}>{rating?.emoji}</span>
                            )}
                          </div>
                          <div style={{ marginTop: "8px" }}>
                            <div style={{ color: "#fff", fontSize: "14px", fontWeight: "600" }}>{step.label}</div>
                            {booking?.provider  && <div style={{ color: "#6c63ff", fontSize: "12px", marginTop: "2px" }}>{booking.provider}</div>}
                            {booking?.reference && <div style={{ color: "#666", fontSize: "11px", marginTop: "2px", fontFamily: "monospace" }}>Ref: {booking.reference}</div>}
                            {isFlight(step) && (booking?.departureAirport || booking?.arrivalAirport) && (
                              <div style={{ color: "#aaa", fontSize: "11px", marginTop: "4px" }}>
                                {booking.departureAirport || "?"} → {booking.arrivalAirport || "?"}
                              </div>
                            )}
                            {isFlight(step) && booking?.flightDate && (
                              <div style={{ color: "#888", fontSize: "11px", marginTop: "2px" }}>
                                📅 {formatDate(booking.flightDate)}
                              </div>
                            )}
                            {isFlight(step) && (booking?.departureTime || booking?.arrivalTime) && (
                              <div style={{ color: "#00d4aa", fontSize: "11px", marginTop: "2px" }}>
                                {booking.departureTime || "?"} → {booking.arrivalTime || "?"}
                              </div>
                            )}
                            {booking?.notes     && <div style={{ color: "#555", fontSize: "11px", marginTop: "5px", lineHeight: "1.4", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{booking.notes}</div>}
                            {!booking?.provider && !booking?.notes && !booking?.departureAirport && (
                              <div style={{ color: "#2e2e4a", fontSize: "12px", marginTop: "4px" }}>Tap to add details</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "60px 20px", color: "#333", border: "1px dashed #1e1e38", borderRadius: "16px" }}>
                  <div style={{ fontSize: "40px", marginBottom: "12px" }}>📋</div>
                  <p style={{ fontSize: "15px", lineHeight: "1.6" }}>No booking steps yet.<br />
                    <span style={{ color: "#444", fontSize: "13px" }}>Add just the steps that apply to this trip.</span>
                  </p>
                </div>
              )}

              <button onClick={() => setAddStepModal(true)} style={{
                display: "flex", alignItems: "center", gap: "10px", justifyContent: "center",
                width: "100%", marginTop: "14px", padding: "13px",
                background: "#12121f", border: "1px dashed #2a2a45",
                borderRadius: "12px", color: "#444", fontSize: "14px", cursor: "pointer",
                transition: "all 0.2s", boxSizing: "border-box"
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#6c63ff"; e.currentTarget.style.color = "#6c63ff"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a45"; e.currentTarget.style.color = "#444"; }}
              >
                <span style={{ fontSize: "18px" }}>＋</span> Add Booking Step
              </button>

              {steps.length > 0 && (() => {
                const { confirmed, total } = completionCount(selectedHoliday);
                const status = getStatus(selectedHoliday);
                const daysTo = selectedHoliday.startDate
                  ? Math.ceil((new Date(selectedHoliday.startDate) - new Date()) / 86400000)
                  : null;
                return (
                  <div style={{ marginTop: "18px", background: "#12121f", border: "1px solid #2a2a45", borderRadius: "12px", padding: "14px 20px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
                    <Stat label="Progress" value={`${confirmed}/${total}`} color={confirmed === total && total > 0 ? "#00d4aa" : "#fff"} />
                    <Stat label="Status" value={status} color={STATUS_COLORS[status]} small />
                    {daysTo !== null && daysTo > 0 && <Stat label="Days to Go" value={daysTo} color="#6c63ff" />}
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </div>

      {/* Modals */}
      {addStepModal && <AddStepModal onAdd={addStep} onClose={() => setAddStepModal(false)} />}

      {bookingModal && selectedHoliday && (() => {
        const step = (selectedHoliday.steps || []).find(s => s.id === bookingModal.stepId);
        if (!step) return null;
        return (
          <BookingModal step={step} booking={selectedHoliday.bookings?.[bookingModal.stepId]}
            onSave={data => saveBooking(bookingModal.stepId, data)}
            onDelete={() => removeStep(bookingModal.stepId)}
            onRename={newLabel => renameStep(bookingModal.stepId, newLabel)}
            onClose={() => setBookingModal(null)} />
        );
      })()}

      {holidayModal !== null && (
        <HolidayModal holiday={holidayModal.holiday} onSave={saveHoliday} onClose={() => setHolidayModal(null)} />
      )}

      {/* Save error toast */}
      {saveError && (
        <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", background: "#ff4d66", color: "#fff", padding: "10px 20px", borderRadius: "10px", fontSize: "13px", zIndex: 2000 }}>
          ⚠️ {saveError}
          <button onClick={() => setSaveError(null)} style={{ background: "none", border: "none", color: "#fff", marginLeft: "12px", cursor: "pointer" }}>✕</button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color, small }) {
  return (
    <div>
      <div style={{ color: "#444", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.8px" }}>{label}</div>
      <div style={{ color: color || "#fff", fontSize: small ? "14px" : "20px", fontWeight: "700", marginTop: "2px", textTransform: small ? "capitalize" : "none" }}>{value}</div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const appShell    = { minHeight: "100vh", background: "#080814", fontFamily: "'DM Sans','Segoe UI',sans-serif", color: "#fff" };
const overlay     = { position: "fixed", inset: 0, background: "rgba(8,8,20,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(6px)", padding: "20px" };
const modal       = { background: "#12121f", border: "1px solid #2a2a45", borderRadius: "16px", padding: "28px", width: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" };
const modalHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "22px" };
const modalTitle  = { margin: 0, fontSize: "17px", color: "#fff" };
const closeBtn    = { background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: "20px", lineHeight: 1 };
const labelStyle  = { display: "block", marginBottom: "14px", fontSize: "11px", color: "#555", textTransform: "uppercase", letterSpacing: "0.8px" };
const inputStyle  = { display: "block", width: "100%", marginTop: "6px", padding: "10px 13px", background: "#1a1a2e", border: "1px solid #2a2a45", borderRadius: "8px", color: "#fff", fontSize: "14px", outline: "none", boxSizing: "border-box" };
const primaryBtn  = { padding: "10px 20px", background: "linear-gradient(135deg, #6c63ff, #a78bfa)", border: "none", borderRadius: "10px", color: "#fff", fontSize: "14px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" };
const secondaryBtn = { padding: "10px 16px", background: "#1a1a2e", border: "1px solid #2a2a45", borderRadius: "10px", color: "#aaa", fontSize: "14px", cursor: "pointer", whiteSpace: "nowrap" };
const toggleBtn   = { padding: "10px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "600" };
const reorderBtn  = { background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "9px", lineHeight: 1, padding: "2px 3px" };
