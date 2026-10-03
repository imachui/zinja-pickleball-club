const SUPABASE_URL = "https://kbafnegagyiwztyfmxpr.supabase.co";
const SUPABASE_KEY = "sb_publishable_djA6ivm66-hfO3WLub527w_AbOa8rvc";

const headers = {
  apikey: SUPABASE_KEY,
  "Content-Type": "application/json"
};

const CHAT_POLL_MS = 60000;
const DATA_POLL_MS = 300000;
const STATUS_POLL_MS = 300000;
const LIVE_MATCH_POLL_MS = 60000;

const BOOKING_DISPLAY_DAYS = 30;
const OPENPLAY_DISPLAY_DAYS = 7;

const OPEN_PLAY_START_MIN = 18 * 60;
const OPEN_PLAY_END_MIN = 24 * 60;
const OPEN_PLAY_START_TIME = "18:00";
const PLAYERS_PER_COURT = 16;
const TOTAL_COURTS = 2;
const OPEN_PLAY_FEE = 50;

const MORNING_START_MIN = 6 * 60;
const MORNING_END_MIN = 16 * 60;
const MORNING_RATE = 100;
const EVENING_RATE = 150;

const CLOSURE_DAY_START = 5;
const CLOSURE_DAY_END = 6;
const CLOSURE_START_HOUR = 17;
const CLOSURE_END_HOUR = 17;
const PHT_OFFSET_HOURS = 8;

const ADMIN_PASSWORD = "zinja2026";
let adminData = { bookings: [], openplay: [] };
let currentAdminTab = 'tournament';

function getPHTNow() {
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcMs + (PHT_OFFSET_HOURS * 3600000));
}

function getTodayStr() {
  const pht = getPHTNow();
  const y = pht.getFullYear();
  const m = String(pht.getMonth() + 1).padStart(2, "0");
  const d = String(pht.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function generateCancelCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatTime(time) {
  if (!time) return "";
  const parts = String(time).split(":");
  const hour = Number(parts[0]);
  const minute = parts[1] ?? "00";
  if (Number.isNaN(hour)) return escapeHtml(time);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "Unknown Date";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function addHoursToTime(time, hours) {
  if (!time) return "";
  const parts = String(time).split(":");
  const totalMinutes = (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0) + Number(hours) * 60;
  const endHour = Math.floor(totalMinutes / 60) % 24;
  const endMinute = totalMinutes % 60;
  const suffix = endHour >= 12 ? "PM" : "AM";
  const displayHour = endHour % 12 || 12;
  return `${displayHour}:${String(endMinute).padStart(2, "0")} ${suffix}`;
}

function formatClockTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function showResult(element, message, success = true) {
  if (!element) return;
  element.textContent = message;
  element.style.display = "block";
  element.style.padding = "10px";
  element.style.marginTop = "10px";
  element.style.borderRadius = "8px";
  element.style.background = success ? "#e8f5e9" : "#ffebee";
  element.style.color = success ? "#1b5e20" : "#b71c1c";
}

async function supabaseFetch(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const detail = typeof data === "string" ? data : data?.message || data?.hint || data?.details || `HTTP ${response.status}`;
    throw new Error(detail);
  }
  return data;
}

function timeToMinutes(time) {
  if (!time) return 0;
  const parts = String(time).split(":");
  return (Number(parts[0]) || 0) * 60 + (Number(parts[1]) || 0);
}

function bookingOverlaps(newTime, newDuration, oldTime, oldDuration) {
  const newStart = timeToMinutes(newTime);
  const newEnd = newStart + Number(newDuration) * 60;
  const oldStart = timeToMinutes(oldTime);
  const oldEnd = oldStart + Number(oldDuration) * 60;
  return newStart < oldEnd && oldStart < newEnd;
}

function saveCancellation(type, data) {
  try {
    const key = type === "booking" ? "zinja_last_booking" : "zinja_last_open_play";
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) { console.warn("Could not save cancellation info:", error); }
}

function getSavedCancellation(type) {
  try {
    const key = type === "booking" ? "zinja_last_booking" : "zinja_last_open_play";
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch { return null; }
}

function calculateBookingPrice(startTime, durationHours) {
  if (!startTime || !durationHours) return { total: 0, rate: 0, breakdown: "" };
  const startMin = timeToMinutes(startTime);
  let total = 0;
  let morningHours = 0;
  let eveningHours = 0;

  for (let i = 0; i < Number(durationHours); i++) {
    const hourStart = startMin + (i * 60);
    if (hourStart >= MORNING_START_MIN && hourStart < MORNING_END_MIN) {
      total += MORNING_RATE;
      morningHours++;
    } else {
      total += EVENING_RATE;
      eveningHours++;
    }
  }

  let breakdown = "";
  if (morningHours > 0 && eveningHours > 0) {
    breakdown = `${morningHours}h × ₱${MORNING_RATE} + ${eveningHours}h × ₱${EVENING_RATE}`;
  }

  const rate = morningHours >= eveningHours ? MORNING_RATE : EVENING_RATE;
  return { total, rate, breakdown, morningHours, eveningHours };
}

function updatePriceDisplay() {
  const timeInput = document.getElementById("time")?.value;
  const durationInput = Number(document.getElementById("duration")?.value);
  const priceDiv = document.getElementById("priceDisplay");
  const rateEl = document.getElementById("ratePerHour");
  const totalEl = document.getElementById("totalPrice");
  const noteEl = document.getElementById("rateNote");
  if (!priceDiv) return;
  if (!timeInput || !durationInput) { priceDiv.style.display = "none"; return; }

  const calc = calculateBookingPrice(timeInput, durationInput);
  priceDiv.style.display = "block";
  rateEl.textContent = `₱${calc.rate}`;
  totalEl.textContent = `₱${calc.total.toLocaleString()}`;

  if (calc.breakdown) {
    noteEl.textContent = `Mixed rate: ${calc.breakdown}`;
  } else {
    noteEl.textContent = calc.rate === MORNING_RATE ? "☀️ Day rate (6AM-4PM)" : "🌙 Evening rate (5PM-12AM)";
  }
}

function setupPriceDisplay() {
  const timeInput = document.getElementById("time");
  const durationInput = document.getElementById("duration");
  if (timeInput) {
    timeInput.addEventListener("change", updatePriceDisplay);
    timeInput.addEventListener("input", updatePriceDisplay);
  }
  if (durationInput) {
    durationInput.addEventListener("change", updatePriceDisplay);
    durationInput.addEventListener("input", updatePriceDisplay);
  }
}

function checkClosureForBooking(dateStr, timeStr, durationHours) {
  if (!dateStr || !timeStr) return { closed: false };
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const startMin = timeToMinutes(timeStr);
  const endMin = startMin + Number(durationHours) * 60;
  const fridayStart = CLOSURE_START_HOUR * 60;
  const saturdayEnd = CLOSURE_END_HOUR * 60;

  if (day === CLOSURE_DAY_START && endMin > fridayStart) {
    return { closed: true, message: "Our facility observes a weekly rest period every Friday from 5:00 PM until Saturday 5:00 PM. Please choose another date or time." };
  }
  if (day === CLOSURE_DAY_END && startMin < saturdayEnd) {
    return { closed: true, message: "Our facility observes a weekly rest period every Friday from 5:00 PM until Saturday 5:00 PM. Please choose another date or time." };
  }
  return { closed: false };
}

function checkClosureForOpenPlay(playDate) {
  if (!playDate) return { closed: false };
  const d = new Date(playDate + "T00:00:00");
  const day = d.getDay();
  const openPlayStart = OPEN_PLAY_START_MIN;
  const closureEnd = CLOSURE_END_HOUR * 60;
  if (day === CLOSURE_DAY_START) {
    return { closed: true, message: "Our facility observes a weekly rest period every Friday from 5:00 PM until Saturday 5:00 PM. Please choose another date." };
  }
  if (day === CLOSURE_DAY_END && openPlayStart < closureEnd) {
    return { closed: true, message: "Our facility observes a weekly rest period every Friday from 5:00 PM until Saturday 5:00 PM. Please choose another date." };
  }
  return { closed: false };
}

function getCurrentClosureStatus() {
  const pht = getPHTNow();
  const day = pht.getDay();
  const hour = pht.getHours();
  if (day === CLOSURE_DAY_START && hour >= CLOSURE_START_HOUR) return true;
  if (day === CLOSURE_DAY_END && hour < CLOSURE_END_HOUR) return true;
  return false;
}

function updateLiveClosureStatus() {
  const banner = document.getElementById("liveStatus");
  if (!banner) return;
  const isClosed = getCurrentClosureStatus();
  const pht = getPHTNow();
  const timeStr = pht.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  if (isClosed) {
    banner.innerHTML = `<span style="display:inline-block;width:10px;height:10px;background:#fff;border-radius:50%;margin-right:8px;"></span><strong>🔴 CLOSED NOW</strong> — Weekly Rest Period (reopens Saturday 5:00 PM) · ${timeStr} PHT`;
    banner.style.background = "linear-gradient(135deg, #dc2626, #991b1b)";
  } else {
    banner.innerHTML = `<span style="display:inline-block;width:10px;height:10px;background:#fff;border-radius:50%;margin-right:8px;"></span><strong>🟢 OPEN NOW</strong> — Book your court or join Open Play! · ${timeStr} PHT`;
    banner.style.background = "linear-gradient(135deg, #059669, #047857)";
  }
}

function announceClosureInChat() {
  const container = document.getElementById("chatMessages");
  if (!container) return;
  const existing = document.getElementById("closureChatNotice");
  if (existing) existing.remove();
  if (!getCurrentClosureStatus()) return;
  const notice = document.createElement("div");
  notice.id = "closureChatNotice";
  notice.style.cssText = "margin-bottom:12px;padding:12px;background:#7f1d1d;border-radius:8px;border-left:4px solid #ef4444;color:#fff;font-size:0.95em;";
  notice.innerHTML = `<strong>📢 Facility Notice:</strong> Courts and Open Play are currently <strong>CLOSED</strong> for our scheduled rest period. We reopen on <strong>Saturday at 5:00 PM (PHT)</strong>. Thank you for understanding!`;
  container.insertBefore(notice, container.firstChild);
}

async function getAvailableCourtsForDate(playDate) {
  if (!playDate) return [];
  try {
    const bookings = await supabaseFetch(`/rest/v1/bookings?select=court,start_time,duration_hours&booking_date=eq.${encodeURIComponent(playDate)}`);
    const occupiedCourts = new Set();
    (bookings || []).forEach(b => {
      const bStart = timeToMinutes(b.start_time);
      const bEnd = bStart + Number(b.duration_hours) * 60;
      if (bStart < OPEN_PLAY_END_MIN && OPEN_PLAY_START_MIN < bEnd) {
        occupiedCourts.add(Number(b.court));
      }
    });
    const availableCourts = [];
    for (let c = 1; c <= TOTAL_COURTS; c++) {
      if (!occupiedCourts.has(c)) availableCourts.push(c);
    }
    return availableCourts;
  } catch (error) {
    console.error("Available courts error:", error);
    return [1, 2];
  }
}

async function checkOpenPlayCapacity(playDate) {
  if (!playDate) return null;
  const availableCourts = await getAvailableCourtsForDate(playDate);
  const maxSlots = availableCourts.length * PLAYERS_PER_COURT;
  const registrations = await supabaseFetch(`/rest/v1/open_play?select=id&play_date=eq.${encodeURIComponent(playDate)}`);
  const currentCount = (registrations || []).length;
  return {
    availableCourts, maxSlots, currentCount,
    spotsLeft: maxSlots - currentCount,
    isFull: currentCount >= maxSlots,
    noCourts: availableCourts.length === 0
  };
}

async function updateOpenPlayInfo() {
  const playDate = document.getElementById("playDate")?.value;
  const infoDiv = document.getElementById("openPlayInfo");
  if (!infoDiv) return;
  if (!playDate) { infoDiv.innerHTML = ""; return; }
  try {
    const closureCheck = checkClosureForOpenPlay(playDate);
    if (closureCheck.closed) {
      infoDiv.innerHTML = `<div style="background:#ffebee;padding:12px;border-radius:8px;border-left:4px solid #ef4444;"><strong>🚫 Closed on ${formatDate(playDate)}</strong><p style="margin:6px 0 0 0;font-size:0.9em;">${closureCheck.message}</p></div>`;
      return;
    }
    infoDiv.innerHTML = "<p>⏳ Checking available slots...</p>";
    const cap = await checkOpenPlayCapacity(playDate);
    if (cap.noCourts) {
      infoDiv.innerHTML = `<div style="background:#ffebee;padding:12px;border-radius:8px;border-left:4px solid #ef4444;"><strong>❌ Open Play unavailable on ${formatDate(playDate)}</strong><p style="margin:6px 0 0 0;font-size:0.9em;">Both courts are booked during Open Play hours (6PM-12AM).</p></div>`;
      return;
    }
    const statusColor = cap.isFull ? "#ef4444" : (cap.spotsLeft < 5 ? "#ff9800" : "#4caf50");
    const statusBg = cap.isFull ? "#ffebee" : (cap.spotsLeft < 5 ? "#fff3e0" : "#e8f5e9");
    const courtLabel = cap.availableCourts.length === 2 ? "🏓 2 Courts (both available)" : `🏓 1 Court (Court ${cap.availableCourts[0]})`;
    infoDiv.innerHTML = `<div style="background:${statusBg};padding:12px;border-radius:8px;border-left:4px solid ${statusColor};"><strong>Open Play on ${formatDate(playDate)} (6PM - 12AM)</strong><p style="margin:6px 0;font-size:0.95em;">${courtLabel}</p><p style="margin:6px 0;font-size:0.95em;"><strong>${cap.currentCount}/${cap.maxSlots}</strong> slots taken ${cap.isFull ? "— <strong>FULL</strong>" : `— <strong>${cap.spotsLeft}</strong> slots left`}</p></div>`;
  } catch (error) { console.error("Open play info error:", error); infoDiv.innerHTML = ""; }
}

function setupOpenPlayInfo() {
  const playDateInput = document.getElementById("playDate");
  if (playDateInput) playDateInput.addEventListener("change", updateOpenPlayInfo);
}

async function checkAvailability() {
  const bookingDate = document.getElementById("date")?.value;
  const court = Number(document.getElementById("court")?.value);
  const availabilityDiv = document.getElementById("availabilityInfo");
  if (!availabilityDiv) return;
  if (!bookingDate || !court) { availabilityDiv.innerHTML = ""; return; }
  try {
    const closureCheck = checkClosureForBooking(bookingDate, "17:00", 12);
    if (closureCheck.closed) {
      availabilityDiv.innerHTML = `<div style="background:#ffebee;padding:10px;border-radius:8px;border-left:4px solid #ef4444;"><strong>🚫 Closed on ${formatDate(bookingDate)}</strong><p style="margin:6px 0 0 0;font-size:0.9em;">${closureCheck.message}</p></div>`;
      return;
    }
    const existing = await supabaseFetch(`/rest/v1/bookings?select=start_time,duration_hours&booking_date=eq.${encodeURIComponent(bookingDate)}&court=eq.${encodeURIComponent(court)}`);
    if (!existing || existing.length === 0) {
      availabilityDiv.innerHTML = `<p style="color:#1b5e20;background:#e8f5e9;padding:10px;border-radius:8px;border-left:4px solid #4caf50;">✅ Court ${court} is fully available on ${formatDate(bookingDate)}!</p>`;
      return;
    }
    const bookedSlots = existing.map(b => {
      const start = formatTime(b.start_time);
      const end = addHoursToTime(b.start_time, b.duration_hours);
      return `<li><strong>${start} - ${end}</strong></li>`;
    }).join("");
    availabilityDiv.innerHTML = `<div style="background:#fff3e0;padding:10px;border-radius:8px;border-left:4px solid #ff9800;"><strong>⚠️ Court ${court} is partially booked on ${formatDate(bookingDate)}:</strong><ul style="margin:8px 0 0 20px;padding:0;">${bookedSlots}</ul><small style="color:#666;">Please avoid these times when booking.</small></div>`;
  } catch (error) { console.error("Availability check error:", error); }
}

function setupAvailabilityCheck() {
  const dateInput = document.getElementById("date");
  const courtSelect = document.getElementById("court");
  if (dateInput) dateInput.addEventListener("change", checkAvailability);
  if (courtSelect) courtSelect.addEventListener("change", checkAvailability);
}

async function loadBookings() {
  const container = document.getElementById("bookingsList");
  if (!container) return;
  try {
    const rows = await supabaseFetch("/rest/v1/bookings?select=customer_name,booking_date,start_time,court,duration_hours,price&order=booking_date.asc,start_time.asc");
    const today = new Date(); today.setHours(0,0,0,0);
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - BOOKING_DISPLAY_DAYS);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const filtered = (rows || []).filter(r => r.booking_date && r.booking_date >= cutoffStr);
    if (filtered.length === 0) { container.innerHTML = "<p>No court bookings in the last 30 days.</p>"; return; }
    const grouped = {};
    filtered.forEach(r => { if (!grouped[r.booking_date]) grouped[r.booking_date] = []; grouped[r.booking_date].push(r); });
    container.innerHTML = Object.entries(grouped).map(([date, bookings]) => `
      <div class="date-group" style="margin-bottom:20px;">
        <h4 style="border-bottom:2px solid #7c3aed;padding-bottom:5px;color:#7c3aed;">📅 ${formatDate(date)}</h4>
        ${bookings.map(b => {
          let displayPrice = b.price;
          if (!displayPrice || displayPrice === 0) {
            const calc = calculateBookingPrice(b.start_time, b.duration_hours);
            displayPrice = calc.total;
          }
          return `
            <div class="booking-item" style="padding:10px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
              <div>
                <strong>${escapeHtml(b.customer_name)}</strong>
                <div style="font-size:0.9em;color:#666;">${formatTime(b.start_time)} - ${addHoursToTime(b.start_time, b.duration_hours)} · Court ${escapeHtml(b.court)} · ${escapeHtml(b.duration_hours)} hour(s)</div>
              </div>
              <div style="padding:6px 14px;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;border-radius:20px;font-weight:700;font-size:0.95em;white-space:nowrap;">₱${Number(displayPrice).toLocaleString()}</div>
            </div>
          `;
        }).join("")}
      </div>
    `).join("");
  } catch (error) { console.error("Bookings error:", error); container.innerHTML = "<p>Unable to load bookings right now.</p>"; }
}

async function loadOpenPlay() {
  const container = document.getElementById("openPlayList");
  if (!container) return;
  try {
    const rows = await supabaseFetch("/rest/v1/open_play?select=player_name,play_date,skill_level&order=play_date.asc");
    const today = new Date(); today.setHours(0,0,0,0);
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - OPENPLAY_DISPLAY_DAYS);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const filtered = (rows || []).filter(r => r.play_date && r.play_date >= cutoffStr);
    if (filtered.length === 0) { container.innerHTML = "<p>No Open Play registrations in the last 7 days.</p>"; return; }
    const grouped = {};
    filtered.forEach(r => { if (!grouped[r.play_date]) grouped[r.play_date] = []; grouped[r.play_date].push(r); });
    container.innerHTML = Object.entries(grouped).map(([date, players]) => {
      const totalFee = players.length * OPEN_PLAY_FEE;
      return `
      <div class="date-group" style="margin-bottom:20px;">
        <h4 style="border-bottom:2px solid #7c3aed;padding-bottom:5px;color:#7c3aed;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <span>📅 ${formatDate(date)} · ${players.length} player(s)</span>
          <span style="padding:4px 14px;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;border-radius:20px;font-size:0.75em;font-weight:700;">Total: ₱${totalFee.toLocaleString()}</span>
        </h4>
        ${players.map(p => `
          <div class="open-play-item" style="padding:10px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <div>
              <strong>${escapeHtml(p.player_name)}</strong>
              <div style="font-size:0.9em;color:#666;">${escapeHtml(p.skill_level || "Not specified")}</div>
            </div>
            <div style="padding:6px 14px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border-radius:20px;font-weight:700;font-size:0.95em;white-space:nowrap;">₱${OPEN_PLAY_FEE}</div>
          </div>
        `).join("")}
      </div>
    `;
    }).join("");
  } catch (error) { console.error("Open Play error:", error); container.innerHTML = "<p>Unable to load Open Play right now.</p>"; }
}

async function handleBookingSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const result = document.getElementById("bookingResult");
  const name = document.getElementById("name")?.value.trim();
  const mobile = document.getElementById("phone")?.value.trim();
  const bookingDate = document.getElementById("date")?.value;
  const bookingTime = document.getElementById("time")?.value;
  const court = Number(document.getElementById("court")?.value);
  const duration = Number(document.getElementById("duration")?.value);

  if (!name || !mobile || !bookingDate || !bookingTime || !court || !duration) {
    showResult(result, "Please complete all booking fields.", false); return;
  }
  if (![1, 2].includes(court)) { showResult(result, "Please select Court 1 or Court 2.", false); return; }
  if (isNaN(duration) || duration < 1 || duration > 10) {
    showResult(result, "Please select a valid duration (1 to 10 hours).", false); return;
  }

  const closureCheck = checkClosureForBooking(bookingDate, bookingTime, duration);
  if (closureCheck.closed) {
    showResult(result, `🚫 Facility Closed — ${closureCheck.message}`, false);
    alert(`⚠️ FACILITY CLOSED\n\n${closureCheck.message}`);
    return;
  }

  try {
    showResult(result, "⏳ Checking court availability...", true);
    const existing = await supabaseFetch(`/rest/v1/public_bookings?select=start_time,duration_hours&booking_date=eq.${encodeURIComponent(bookingDate)}&court=eq.${encodeURIComponent(court)}`);
    const conflictingBooking = (existing || []).find(booking => bookingOverlaps(bookingTime, duration, booking.start_time, booking.duration_hours));
    if (conflictingBooking) {
      const conflictStart = formatTime(conflictingBooking.start_time);
      const conflictEnd = addHoursToTime(conflictingBooking.start_time, conflictingBooking.duration_hours);
      const newEnd = addHoursToTime(bookingTime, duration);
      showResult(result, `❌ BOOKING CONFLICT! Court ${court} on ${formatDate(bookingDate)} is already booked from ${conflictStart} to ${conflictEnd}.`, false);
      alert(`⚠️ BOOKING CONFLICT!\n\nCourt ${court} on ${formatDate(bookingDate)}\n\nAlready reserved: ${conflictStart} - ${conflictEnd}\nYour requested: ${formatTime(bookingTime)} - ${newEnd}`);
      return;
    }
    const priceCalc = calculateBookingPrice(bookingTime, duration);
    const cancellationCode = generateCancelCode();
    await supabaseFetch("/rest/v1/bookings", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        customer_name: name, mobile, booking_date: bookingDate, start_time: bookingTime,
        court, duration_hours: duration, cancellation_code: cancellationCode,
        price: priceCalc.total, hourly_rate: priceCalc.rate
      })
    });
    saveCancellation("booking", { mobile, code: cancellationCode });
    const endTime = addHoursToTime(bookingTime, duration);
    showResult(result, `✅ Thank you, ${name}! Booking confirmed for Court ${court}, ${formatDate(bookingDate)} from ${formatTime(bookingTime)} to ${endTime}. 💰 Total: ₱${priceCalc.total.toLocaleString()}. Cancellation code: ${cancellationCode}.`, true);
    form.reset();
    const priceDiv = document.getElementById("priceDisplay");
    if (priceDiv) priceDiv.style.display = "none";
    const availabilityDiv = document.getElementById("availabilityInfo");
    if (availabilityDiv) availabilityDiv.innerHTML = "";
    await loadBookings();
  } catch (error) {
    console.error("Booking error:", error);
    showResult(result, `Something went wrong. ${error.message || "Please try again."}`, false);
  }
}

async function handleOpenPlaySubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const result = document.getElementById("playResult");
  const name = document.getElementById("player")?.value.trim();
  const mobile = document.getElementById("playerPhone")?.value.trim();
  const playDate = document.getElementById("playDate")?.value;
  const skillLevel = document.getElementById("level")?.value;

  if (!name || !mobile || !playDate || !skillLevel) {
    showResult(result, "Please complete all Open Play fields.", false); return;
  }

  const closureCheck = checkClosureForOpenPlay(playDate);
  if (closureCheck.closed) {
    showResult(result, `🚫 Facility Closed — ${closureCheck.message}`, false);
    alert(`⚠️ FACILITY CLOSED\n\n${closureCheck.message}`);
    return;
  }

  try {
    showResult(result, "⏳ Checking Open Play availability...", true);
    const cap = await checkOpenPlayCapacity(playDate);
    if (cap.noCourts) {
      showResult(result, `❌ Open Play is CANCELLED on ${formatDate(playDate)}. Both courts are booked.`, false);
      alert(`⚠️ OPEN PLAY UNAVAILABLE\n\n${formatDate(playDate)}`);
      return;
    }
    if (cap.isFull) {
      showResult(result, `❌ Open Play is FULL on ${formatDate(playDate)}. ${cap.currentCount}/${cap.maxSlots} slots taken.`, false);
      alert(`⚠️ OPEN PLAY FULL\n\n${formatDate(playDate)}`);
      return;
    }
    const cancellationCode = generateCancelCode();
    await supabaseFetch("/rest/v1/open_play", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ player_name: name, mobile, play_date: playDate, play_time: OPEN_PLAY_START_TIME, skill_level: skillLevel, cancellation_code: cancellationCode })
    });
    saveCancellation("open_play", { mobile, code: cancellationCode });
    const newCount = cap.currentCount + 1;
    showResult(result, `✅ Thank you, ${name}! Open Play confirmed for ${formatDate(playDate)} (6PM-12AM). Fee: ₱${OPEN_PLAY_FEE}. Cancellation code: ${cancellationCode}.\n\n📊 Slots: ${newCount}/${cap.maxSlots} taken.`, true);
    form.reset();
    const infoDiv = document.getElementById("openPlayInfo");
    if (infoDiv) infoDiv.innerHTML = "";
    await loadOpenPlay();
  } catch (error) {
    console.error("Open Play error:", error);
    showResult(result, `Something went wrong. ${error.message || "Please try again."}`, false);
  }
}

function createCancellationBoxes() {
  const bookingForm = document.getElementById("bookingForm");
  const playForm = document.getElementById("playForm");

  if (bookingForm && !document.getElementById("cancelBookingBox")) {
    bookingForm.insertAdjacentHTML("afterend", `
      <div id="cancelBookingBox" style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:12px;">
        <h3>Cancel My Court Booking</h3>
        <p>Enter the mobile number and cancellation code you received when booking.</p>
        <input id="cancelBookingMobile" type="tel" placeholder="Mobile number" style="display:block;width:100%;margin:8px 0;padding:10px;">
        <input id="cancelBookingCode" type="text" placeholder="Cancellation code" maxlength="8" style="display:block;width:100%;margin:8px 0;padding:10px;text-transform:uppercase;">
        <button type="button" id="cancelBookingButton">Cancel Booking</button>
        <div id="cancelBookingResult"></div>
      </div>
    `);
    document.getElementById("cancelBookingButton")?.addEventListener("click", cancelBooking);
    const saved = getSavedCancellation("booking");
    if (saved) {
      const mobileInput = document.getElementById("cancelBookingMobile");
      const codeInput = document.getElementById("cancelBookingCode");
      if (mobileInput) mobileInput.value = saved.mobile || "";
      if (codeInput) codeInput.value = saved.code || "";
    }
  }

  if (playForm && !document.getElementById("cancelOpenPlayBox")) {
    playForm.insertAdjacentHTML("afterend", `
      <div id="cancelOpenPlayBox" style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:12px;">
        <h3>Cancel My Open Play Registration</h3>
        <p>Enter the mobile number and cancellation code you received when joining.</p>
        <input id="cancelOpenPlayMobile" type="tel" placeholder="Mobile number" style="display:block;width:100%;margin:8px 0;padding:10px;">
        <input id="cancelOpenPlayCode" type="text" placeholder="Cancellation code" maxlength="8" style="display:block;width:100%;margin:8px 0;padding:10px;text-transform:uppercase;">
        <button type="button" id="cancelOpenPlayButton">Cancel Registration</button>
        <div id="cancelOpenPlayResult"></div>
      </div>
    `);
    document.getElementById("cancelOpenPlayButton")?.addEventListener("click", cancelOpenPlay);
    const saved = getSavedCancellation("open_play");
    if (saved) {
      const mobileInput = document.getElementById("cancelOpenPlayMobile");
      const codeInput = document.getElementById("cancelOpenPlayCode");
      if (mobileInput) mobileInput.value = saved.mobile || "";
      if (codeInput) codeInput.value = saved.code || "";
    }
  }
}

async function cancelBooking() {
  const mobile = document.getElementById("cancelBookingMobile")?.value.trim();
  const code = document.getElementById("cancelBookingCode")?.value.trim().toUpperCase();
  const result = document.getElementById("cancelBookingResult");
  if (!mobile || !code) { showResult(result, "Please enter your mobile number and cancellation code.", false); return; }
  try {
    showResult(result, "Cancelling booking...", true);
    const data = await supabaseFetch("/rest/v1/rpc/cancel_booking", { method: "POST", body: JSON.stringify({ p_mobile: mobile, p_code: code }) });
    if (data === true) {
      try { localStorage.removeItem("zinja_last_booking"); } catch {}
      showResult(result, "Your court booking has been cancelled.", true);
      await loadBookings();
    } else {
      showResult(result, "No matching booking was found.", false);
    }
  } catch (error) { showResult(result, `Cancellation failed. ${error.message || "Please try again."}`, false); }
}

async function cancelOpenPlay() {
  const mobile = document.getElementById("cancelOpenPlayMobile")?.value.trim();
  const code = document.getElementById("cancelOpenPlayCode")?.value.trim().toUpperCase();
  const result = document.getElementById("cancelOpenPlayResult");
  if (!mobile || !code) { showResult(result, "Please enter your mobile number and cancellation code.", false); return; }
  try {
    showResult(result, "Cancelling registration...", true);
    const data = await supabaseFetch("/rest/v1/rpc/cancel_open_play", { method: "POST", body: JSON.stringify({ p_mobile: mobile, p_code: code }) });
    if (data === true) {
      try { localStorage.removeItem("zinja_last_open_play"); } catch {}
      showResult(result, "Your Open Play registration has been cancelled.", true);
      await loadOpenPlay();
    } else {
      showResult(result, "No matching Open Play registration was found.", false);
    }
  } catch (error) { showResult(result, `Cancellation failed. ${error.message || "Please try again."}`, false); }
}

// ====================
// AUTO CLEANUP
// ====================

async function autoCleanupOldData() {
  const today = getTodayStr();
  let lastCleanup = null;
  try { lastCleanup = localStorage.getItem("zinja_last_cleanup_date"); } catch {}
  if (lastCleanup === today) return;

  try {
    await supabaseFetch(`/rest/v1/matches?play_date=lt.${today}`, { method: "DELETE" });
    await supabaseFetch(`/rest/v1/check_ins?play_date=lt.${today}`, { method: "DELETE" });
    try { localStorage.setItem("zinja_last_cleanup_date", today); } catch {}
    console.log("✅ Auto-cleanup complete for " + today);
  } catch (error) { console.warn("Auto-cleanup failed:", error); }
}

// ====================
// CHECK-IN SYSTEM
// ====================

async function loadCheckIns(dateStr) {
  try {
    const rows = await supabaseFetch(`/rest/v1/check_ins?select=player_name,status,is_walkin&play_date=eq.${encodeURIComponent(dateStr)}`);
    const map = {};
    (rows || []).forEach(r => { map[r.player_name] = { status: r.status, is_walkin: r.is_walkin }; });
    return map;
  } catch (error) { console.warn("Could not load check-ins:", error); return {}; }
}

async function addCheckIn(dateStr, playerName, isWalkin = false) {
  await supabaseFetch("/rest/v1/check_ins", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ play_date: dateStr, player_name: playerName, is_walkin: isWalkin, status: 'active' })
  });
}

async function removeCheckIn(dateStr, playerName) {
  await supabaseFetch(`/rest/v1/check_ins?play_date=eq.${encodeURIComponent(dateStr)}&player_name=eq.${encodeURIComponent(playerName)}`, { method: "DELETE" });
}

async function setPlayerStatus(dateStr, playerName, status) {
  await supabaseFetch(`/rest/v1/check_ins?play_date=eq.${encodeURIComponent(dateStr)}&player_name=eq.${encodeURIComponent(playerName)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: status })
  });
}

// ====================
// MATCH CRUD
// ====================

async function loadMatches(dateStr) {
  try {
    const rows = await supabaseFetch(`/rest/v1/matches?play_date=eq.${encodeURIComponent(dateStr)}&order=created_at.asc`);
    return rows || [];
  } catch (error) { console.warn("Could not load matches:", error); return []; }
}

async function createMatch(dateStr, court, teamA, teamB) {
  // court === null or 0 means queue
  const isQueue = !court || court === 0;
  const payload = {
    play_date: dateStr,
    court: isQueue ? null : court,
    team_a_1: teamA[0],
    team_a_2: teamA[1],
    team_b_1: teamB[0],
    team_b_2: teamB[1],
    status: isQueue ? 'queued' : 'active',
    started_at: isQueue ? null : new Date().toISOString()
  };
  await supabaseFetch("/rest/v1/matches", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
}

async function declareWinner(matchId, winningTeam) {
  const today = getTodayStr();
  // 1. Get the match to know its court
  let freedCourt = null;
  try {
    const info = await supabaseFetch(`/rest/v1/matches?id=eq.${matchId}&select=court,status`);
    if (info && info[0]) {
      if (info[0].status === 'active') freedCourt = info[0].court;
    }
  } catch (e) { console.warn("Could not fetch match info:", e); }

  // 2. Mark done
  await supabaseFetch(`/rest/v1/matches?id=eq.${matchId}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: 'done',
      winning_team: winningTeam,
      ended_at: new Date().toISOString()
    })
  });

  // 3. Auto-promote next queued match to freed court
  if (freedCourt) {
    await promoteNextFromQueue(today, freedCourt);
  }
}

async function promoteNextFromQueue(dateStr, court) {
  try {
    const queued = await supabaseFetch(
      `/rest/v1/matches?play_date=eq.${encodeURIComponent(dateStr)}&status=eq.queued&order=created_at.asc&limit=1`
    );
    if (!queued || !queued[0]) return null;
    await supabaseFetch(`/rest/v1/matches?id=eq.${queued[0].id}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        court: court,
        status: 'active',
        started_at: new Date().toISOString()
      })
    });
    return queued[0];
  } catch (e) { console.warn("Promote from queue failed:", e); return null; }
}

async function cancelMatch(matchId) {
  const today = getTodayStr();
  let freedCourt = null;
  try {
    const info = await supabaseFetch(`/rest/v1/matches?id=eq.${matchId}&select=court,status`);
    if (info && info[0] && info[0].status === 'active') freedCourt = info[0].court;
  } catch (e) {}
  await supabaseFetch(`/rest/v1/matches?id=eq.${matchId}`, { method: "DELETE" });
  if (freedCourt) await promoteNextFromQueue(today, freedCourt);
}

// ====================
// SMART SUGGEST
// ====================

function computePlayerStats(playerNames, matches) {
  const stats = {};
  playerNames.forEach(name => { stats[name] = { games: 0, wins: 0, losses: 0 }; });

  matches.forEach(m => {
    const teamA = [m.team_a_1, m.team_a_2];
    const teamB = [m.team_b_1, m.team_b_2];
    [...teamA, ...teamB].forEach(n => { if (stats[n]) stats[n].games++; });
    if (m.status === 'done' && m.winning_team) {
      const winners = m.winning_team === 'A' ? teamA : teamB;
      const losers = m.winning_team === 'A' ? teamB : teamA;
      winners.forEach(n => { if (stats[n]) stats[n].wins++; });
      losers.forEach(n => { if (stats[n]) stats[n].losses++; });
    }
  });

  return stats;
}

function getPlayersInPendingMatches(matches) {
  const set = new Set();
  matches.filter(m => m.status === 'active' || m.status === 'queued').forEach(m => {
    set.add(m.team_a_1);
    set.add(m.team_a_2);
    set.add(m.team_b_1);
    set.add(m.team_b_2);
  });
  return set;
}

function smartSuggest(availablePlayers, matches) {
  if (availablePlayers.length < 4) return null;
  const stats = computePlayerStats(availablePlayers, matches);

  const sorted = availablePlayers.slice().sort((a, b) => {
    const ga = stats[a].games;
    const gb = stats[b].games;
    if (ga !== gb) return ga - gb;
    const wa = stats[a].wins - stats[a].losses;
    const wb = stats[b].wins - stats[b].losses;
    if (wb !== wa) return wb - wa;
    return Math.random() - 0.5;
  });

  const picked = sorted.slice(0, 4);
  picked.sort((a, b) => {
    const wa = stats[a].wins - stats[a].losses;
    const wb = stats[b].wins - stats[b].losses;
    return wb - wa;
  });

  return { teamA: [picked[0], picked[3]], teamB: [picked[1], picked[2]] };
}

// ====================
// PUBLIC LIVE BOARD
// ====================

function renderMatchCard(m, mode, queueNumber) {
  // mode: 'active' | 'queued' | 'done'
  const teamALabel = `${escapeHtml(m.team_a_1)} & ${escapeHtml(m.team_a_2)}`;
  const teamBLabel = `${escapeHtml(m.team_b_1)} & ${escapeHtml(m.team_b_2)}`;

  const aWon = m.winning_team === 'A';
  const bWon = m.winning_team === 'B';
  const hasResult = !!m.winning_team;

  const markA = aWon ? ' 🏆' : (bWon ? ' ❌' : '');
  const markB = bWon ? ' 🏆' : (aWon ? ' ❌' : '');
  const nameStyleA = bWon ? 'text-decoration:line-through;opacity:0.55;' : '';
  const nameStyleB = aWon ? 'text-decoration:line-through;opacity:0.55;' : '';

  const winButtons = mode === 'active' ? `
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
      <button type="button" onclick="reportMatchWin(${m.id}, 'A')"
        style="flex:1;min-width:130px;padding:12px 14px;border:2px solid #10b981;border-radius:8px;background:rgba(16,185,129,0.25);color:#fff;font-weight:700;font-size:0.9em;cursor:pointer;">
        🏆 Team A Won
      </button>
      <button type="button" onclick="reportMatchWin(${m.id}, 'B')"
        style="flex:1;min-width:130px;padding:12px 14px;border:2px solid #f59e0b;border-radius:8px;background:rgba(245,158,11,0.25);color:#fff;font-weight:700;font-size:0.9em;cursor:pointer;">
        🏆 Team B Won
      </button>
    </div>
  ` : '';

  const banner = hasResult
    ? `<div style="margin-top:10px;padding:8px 12px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border-radius:8px;text-align:center;font-weight:700;font-size:0.9em;">🏆 Team ${m.winning_team} Wins!</div>`
    : '';

  // Style per mode
  let bg, borderColor, badge, timeLabel;
  if (mode === 'active') {
    bg = 'linear-gradient(135deg,#064e3b,#065f46)';
    borderColor = '#10b981';
    badge = '🟢 NOW PLAYING';
    timeLabel = `🏓 Court ${m.court} · 🕐 ${formatClockTime(m.started_at)}`;
  } else if (mode === 'queued') {
    bg = 'linear-gradient(135deg,#4c1d95,#5b21b6)';
    borderColor = '#a78bfa';
    badge = `⏳ UP NEXT #${queueNumber}`;
    timeLabel = '📋 Waiting for a court';
  } else {
    bg = 'linear-gradient(135deg,#1e293b,#0f172a)';
    borderColor = '#7c3aed';
    badge = '✅ COMPLETED';
    timeLabel = `🏓 Court ${m.court} · 🕐 ${formatClockTime(m.started_at)}${m.ended_at ? ' - ' + formatClockTime(m.ended_at) : ''}`;
  }

  return `
    <div style="background:${bg};border-radius:12px;padding:16px;margin-bottom:12px;border-left:4px solid ${borderColor};color:#fff;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px;">
        <span style="font-size:0.85em;font-weight:700;">${badge}</span>
        <span style="font-size:0.75em;opacity:0.9;">${timeLabel}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,255,255,0.1);border-radius:8px;margin:4px 0;flex-wrap:wrap;${nameStyleA}">
        <strong style="color:#10b981;">Team A:</strong>
        <span>${teamALabel}</span>
        <span style="margin-left:auto;">${markA}</span>
      </div>
      <div style="text-align:center;font-weight:700;color:#a78bfa;padding:4px 0;">— VS —</div>
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,255,255,0.1);border-radius:8px;margin:4px 0;flex-wrap:wrap;${nameStyleB}">
        <strong style="color:#f59e0b;">Team B:</strong>
        <span>${teamBLabel}</span>
        <span style="margin-left:auto;">${markB}</span>
      </div>
      ${banner}
      ${winButtons}
    </div>
  `;
}

async function renderLiveBoard() {
  const container = document.getElementById("matchupsContainer");
  if (!container) return;
  const today = getTodayStr();
  try {
    const [checkInMap, matches] = await Promise.all([
      loadCheckIns(today),
      loadMatches(today)
    ]);

    const activeMatches = matches.filter(m => m.status === 'active');
    const queuedMatches = matches.filter(m => m.status === 'queued');
    const doneMatches = matches.filter(m => m.status === 'done').reverse();

    const playersInPending = getPlayersInPendingMatches(matches);
    const waitingPlayers = Object.keys(checkInMap).filter(n =>
      checkInMap[n].status === 'active' && !playersInPending.has(n)
    );

    let html = '';

    // Active matches
    if (activeMatches.length === 0) {
      html += `<div style="text-align:center;padding:24px;background:rgba(124,58,237,0.1);border-radius:12px;border:1px solid rgba(124,58,237,0.3);margin-bottom:16px;">
        <p style="font-size:1.5em;margin:8px 0;">⏳</p>
        <p style="font-weight:700;margin:8px 0;">No live matches right now</p>
        <p style="font-size:0.9em;opacity:0.75;margin:4px 0;">The admin will start games soon. Stay tuned!</p>
      </div>`;
    } else {
      activeMatches.forEach(m => { html += renderMatchCard(m, 'active'); });
    }

    // Queue
    if (queuedMatches.length > 0) {
      html += `<h3 style="color:#a78bfa;margin:24px 0 8px 0;text-align:center;">⏳ Up Next — Queue (${queuedMatches.length})</h3>`;
      html += `<p style="text-align:center;font-size:0.85em;opacity:0.75;margin:0 0 12px 0;">These matches will auto-start as soon as a court frees up.</p>`;
      queuedMatches.forEach((m, idx) => { html += renderMatchCard(m, 'queued', idx + 1); });
    }

    // Waiting pool
    html += `
      <div style="margin-top:20px;padding:16px;background:rgba(245,158,11,0.1);border-radius:12px;border-left:4px solid #f59e0b;color:#fff;">
        <p style="font-weight:700;margin:0 0 8px 0;">🪑 Waiting Pool (${waitingPlayers.length})</p>
        <p style="font-size:0.9em;opacity:0.85;margin:0;line-height:1.6;">${waitingPlayers.length > 0 ? waitingPlayers.map(escapeHtml).join(' · ') : 'No one waiting right now.'}</p>
      </div>
    `;

    // Completed
    if (doneMatches.length > 0) {
      html += `<h3 style="color:#a78bfa;margin:24px 0 8px 0;text-align:center;">✅ Completed Today (${doneMatches.length})</h3>`;
      doneMatches.forEach(m => { html += renderMatchCard(m, 'done'); });
    }

    container.innerHTML = html;
  } catch (error) {
    console.error("Live board error:", error);
    container.innerHTML = `<p style="text-align:center;color:#ef4444;">Unable to load live board: ${escapeHtml(error.message)}</p>`;
  }
}

window.reportMatchWin = async function (matchId, winningTeam) {
  const teamLabel = winningTeam === 'A' ? 'Team A' : 'Team B';
  if (!confirm(`🏆 Confirm: ${teamLabel} won this match?`)) return;
  try {
    await declareWinner(matchId, winningTeam);
    await renderLiveBoard();
  } catch (error) {
    alert("Failed to save result: " + error.message);
  }
};

// ====================
// ADMIN — TOURNAMENT TAB
// ====================

async function renderAdminTournament() {
  const container = document.getElementById('adminContent');
  if (!container) return;
  const today = getTodayStr();

  try {
    const [regs, checkInMap, matches] = await Promise.all([
      supabaseFetch(`/rest/v1/open_play?select=player_name,skill_level&play_date=eq.${encodeURIComponent(today)}`),
      loadCheckIns(today),
      loadMatches(today)
    ]);

    const registeredPlayers = (regs || []).map(r => r.player_name);
    const walkInPlayers = Object.keys(checkInMap).filter(n => checkInMap[n].is_walkin && !registeredPlayers.includes(n));
    const allPlayers = [...registeredPlayers, ...walkInPlayers];

    const activeMatches = matches.filter(m => m.status === 'active');
    const queuedMatches = matches.filter(m => m.status === 'queued');
    const doneMatches = matches.filter(m => m.status === 'done');

    const playersInPending = getPlayersInPendingMatches(matches);
    const availablePlayers = allPlayers.filter(n =>
      checkInMap[n] && checkInMap[n].status === 'active' && !playersInPending.has(n)
    );

    const stats = computePlayerStats(allPlayers, matches);
    const courtsInUse = new Set(activeMatches.map(m => m.court));
    const freeCourts = [1, 2].filter(c => !courtsInUse.has(c));

    // Player list
    const playerListHTML = allPlayers.length === 0
      ? '<p style="color:#888;">No players yet today. Tap "➕ Add Walk-In" to add one.</p>'
      : allPlayers.map(name => {
          const ci = checkInMap[name];
          const inPending = playersInPending.has(name);
          const s = stats[name] || { games: 0, wins: 0, losses: 0 };
          const recStr = s.games > 0 ? `${s.wins}-${s.losses}` : '—';
          const safeName = escapeHtml(name);

          let badge = '';
          let bg = '#f9fafb';
          if (inPending) {
            badge = '<span style="background:#10b981;color:#fff;padding:3px 10px;border-radius:12px;font-size:0.7em;font-weight:700;">IN MATCH</span>';
            bg = '#ecfdf5';
          } else if (ci && ci.status === 'left') {
            badge = '<span style="background:#dc2626;color:#fff;padding:3px 10px;border-radius:12px;font-size:0.7em;font-weight:700;">LEFT</span>';
            bg = '#fef2f2';
          } else if (ci && ci.status === 'active') {
            badge = '<span style="background:#059669;color:#fff;padding:3px 10px;border-radius:12px;font-size:0.7em;font-weight:700;">AVAILABLE</span>';
            bg = '#f0fdf4';
          } else {
            badge = '<span style="background:#9ca3af;color:#fff;padding:3px 10px;border-radius:12px;font-size:0.7em;font-weight:700;">NOT CHECKED IN</span>';
          }
          if (ci && ci.is_walkin) {
            badge += ' <span style="background:#f59e0b;color:#fff;padding:3px 10px;border-radius:12px;font-size:0.7em;font-weight:700;margin-left:4px;">WALK-IN</span>';
          }

          let actions = '';
          if (!ci) {
            actions = `<button type="button" onclick="toggleCheckIn('${safeName}', false)" style="padding:6px 14px;background:#10b981;color:#fff;border:none;border-radius:6px;font-size:0.8em;font-weight:600;cursor:pointer;">✓ Check In</button>`;
          } else if (inPending) {
            actions = `<span style="font-size:0.75em;color:#666;font-style:italic;">In active/queued match</span>`;
          } else if (ci.status === 'left') {
            actions = `<button type="button" onclick="togglePlayerLeft('${safeName}', false)" style="padding:6px 12px;background:#6b7280;color:#fff;border:none;border-radius:6px;font-size:0.8em;font-weight:600;cursor:pointer;">↺ Back Active</button>
              <button type="button" onclick="toggleCheckIn('${safeName}', true)" style="padding:6px 12px;background:#dc2626;color:#fff;border:none;border-radius:6px;font-size:0.8em;font-weight:600;cursor:pointer;margin-left:4px;">✕ Remove</button>`;
          } else {
            actions = `<button type="button" onclick="togglePlayerLeft('${safeName}', true)" style="padding:6px 12px;background:#dc2626;color:#fff;border:none;border-radius:6px;font-size:0.8em;font-weight:600;cursor:pointer;">⏸ Mark as Left</button>
              <button type="button" onclick="toggleCheckIn('${safeName}', true)" style="padding:6px 12px;background:#6b7280;color:#fff;border:none;border-radius:6px;font-size:0.8em;font-weight:600;cursor:pointer;margin-left:4px;">✕ Remove</button>`;
          }

          return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:${bg};border-radius:8px;margin-bottom:6px;flex-wrap:wrap;gap:8px;">
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <strong>${safeName}</strong>
              ${badge}
              <span style="font-size:0.8em;color:#666;">Games: ${s.games} · Record: ${recStr}</span>
            </div>
            <div>${actions}</div>
          </div>`;
        }).join('');

    // Active matches admin
    const activeHTML = activeMatches.length === 0
      ? '<p style="color:#888;">No active matches.</p>'
      : activeMatches.map(m => `
          <div style="padding:12px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px;">
              <strong>Court ${m.court}</strong>
              <small style="color:#666;">Started ${formatClockTime(m.started_at)}</small>
            </div>
            <p style="margin:4px 0;font-size:0.9em;"><strong>A:</strong> ${escapeHtml(m.team_a_1)} & ${escapeHtml(m.team_a_2)}</p>
            <p style="margin:4px 0;font-size:0.9em;"><strong>B:</strong> ${escapeHtml(m.team_b_1)} & ${escapeHtml(m.team_b_2)}</p>
            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
              <button type="button" onclick="adminDeclareWinner(${m.id}, 'A')" style="padding:6px 12px;background:#10b981;color:#fff;border:none;border-radius:6px;font-size:0.8em;font-weight:600;cursor:pointer;">🏆 A Won</button>
              <button type="button" onclick="adminDeclareWinner(${m.id}, 'B')" style="padding:6px 12px;background:#f59e0b;color:#fff;border:none;border-radius:6px;font-size:0.8em;font-weight:600;cursor:pointer;">🏆 B Won</button>
              <button type="button" onclick="adminCancelMatch(${m.id})" style="padding:6px 12px;background:#dc2626;color:#fff;border:none;border-radius:6px;font-size:0.8em;font-weight:600;cursor:pointer;">✕ Cancel</button>
            </div>
          </div>
        `).join('');

    // Queue admin
    const queueHTML = queuedMatches.length === 0
      ? '<p style="color:#888;">No matches in queue.</p>'
      : queuedMatches.map((m, idx) => `
          <div style="padding:12px;background:#faf5ff;border:1px solid #a78bfa;border-radius:8px;margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px;">
              <strong style="color:#7c3aed;">⏳ Queue #${idx + 1}</strong>
              <small style="color:#666;">Auto-starts when a court frees up</small>
            </div>
            <p style="margin:4px 0;font-size:0.9em;"><strong>A:</strong> ${escapeHtml(m.team_a_1)} & ${escapeHtml(m.team_a_2)}</p>
            <p style="margin:4px 0;font-size:0.9em;"><strong>B:</strong> ${escapeHtml(m.team_b_1)} & ${escapeHtml(m.team_b_2)}</p>
            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
              <button type="button" onclick="adminCancelMatch(${m.id})" style="padding:6px 12px;background:#dc2626;color:#fff;border:none;border-radius:6px;font-size:0.8em;font-weight:600;cursor:pointer;">✕ Remove from Queue</button>
            </div>
          </div>
        `).join('');

    // Create form — with Court dropdown including Queue option
    const playerOptions = availablePlayers.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    const courtOptionsHTML = `
      <option value="0">📋 Queue — auto-assign when a court frees up</option>
      ${freeCourts.map(c => `<option value="${c}">🏓 Court ${c} — start now</option>`).join('')}
    `;

    const createHTML = availablePlayers.length < 4
      ? `<p style="color:#f59e0b;font-weight:600;">Need at least 4 available players. Currently: ${availablePlayers.length}.</p>`
      : `
        <div style="background:#f9fafb;padding:12px;border-radius:8px;margin-bottom:12px;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
            <label style="font-weight:600;display:flex;gap:6px;align-items:center;">
              Court:
              <select id="newMatchCourt" style="padding:6px 10px;border-radius:6px;border:1px solid #ddd;">
                ${courtOptionsHTML}
              </select>
            </label>
            <button type="button" onclick="doSmartSuggest()" style="padding:6px 14px;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:0.85em;">✨ Smart Suggest</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div>
              <label style="display:block;font-size:0.85em;font-weight:600;color:#10b981;margin-bottom:4px;">Team A</label>
              <select id="teamAP1" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;margin-bottom:6px;"><option value="">— Player 1 —</option>${playerOptions}</select>
              <select id="teamAP2" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;"><option value="">— Player 2 —</option>${playerOptions}</select>
            </div>
            <div>
              <label style="display:block;font-size:0.85em;font-weight:600;color:#f59e0b;margin-bottom:4px;">Team B</label>
              <select id="teamBP1" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;margin-bottom:6px;"><option value="">— Player 1 —</option>${playerOptions}</select>
              <select id="teamBP2" style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;"><option value="">— Player 2 —</option>${playerOptions}</select>
            </div>
          </div>
          <button type="button" onclick="doCreateMatch()" style="margin-top:12px;padding:12px 24px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;width:100%;">▶ Create Match</button>
          <p style="font-size:0.8em;color:#666;margin:8px 0 0 0;text-align:center;">If you pick Queue, the match will auto-start the moment a court is free.</p>
        </div>
      `;

    const completedHTML = doneMatches.length === 0
      ? '<p style="color:#888;">No completed matches yet.</p>'
      : doneMatches.map(m => `
          <div style="padding:8px 12px;background:#f9fafb;border-radius:6px;margin-bottom:6px;font-size:0.9em;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <span>Court ${m.court} · ${escapeHtml(m.team_a_1)} & ${escapeHtml(m.team_a_2)} vs ${escapeHtml(m.team_b_1)} & ${escapeHtml(m.team_b_2)}</span>
            <strong style="color:#10b981;">🏆 Team ${m.winning_team}</strong>
          </div>
        `).join('');

    const checkedInCount = Object.values(checkInMap).filter(c => c.status === 'active').length;

    container.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          <h3 style="color:#7c3aed;margin:0;">👥 Check-In & Player Management (${checkedInCount} active)</h3>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" onclick="doAddWalkIn()" style="padding:8px 16px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.85em;">➕ Add Walk-In</button>
            <button type="button" onclick="doResetToday()" style="padding:8px 16px;background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.85em;">🗑 Reset Today</button>
            <button type="button" onclick="doClearOldData()" style="padding:8px 16px;background:#6b7280;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:0.85em;">🧹 Clean Old Data</button>
          </div>
        </div>
        <p style="color:#666;font-size:0.9em;margin-bottom:12px;">Tap ✓ Check In for arrivals, ⏸ Mark as Left for departures.</p>
        ${playerListHTML}
      </div>

      <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;">
        <h3 style="color:#10b981;margin-top:0;">🟢 Active Matches (${activeMatches.length})</h3>
        ${activeHTML}
      </div>

      <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;">
        <h3 style="color:#a78bfa;margin-top:0;">⏳ Up Next — Queue (${queuedMatches.length})</h3>
        <p style="color:#666;font-size:0.9em;margin-top:0;">These matches will auto-start as soon as a court frees up.</p>
        ${queueHTML}
      </div>

      <div style="background:#fff;border-radius:12px;padding:16px;margin-bottom:16px;">
        <h3 style="color:#f59e0b;margin-top:0;">➕ Create New Match</h3>
        <p style="color:#666;font-size:0.9em;margin-bottom:12px;">Free courts: ${freeCourts.map(c => 'Court ' + c).join(', ') || 'None — use Queue'} · Available players: ${availablePlayers.length}</p>
        ${createHTML}
      </div>

      <div style="background:#fff;border-radius:12px;padding:16px;">
        <h3 style="color:#7c3aed;margin-top:0;">✅ Completed Today (${doneMatches.length})</h3>
        ${completedHTML}
      </div>
    `;
  } catch (error) {
    console.error("Admin tournament error:", error);
    container.innerHTML = `<p style="color:red;">❌ ${escapeHtml(error.message)}</p>`;
  }
}

window.toggleCheckIn = async function (playerName, isCurrentlyIn) {
  const today = getTodayStr();
  try {
    if (isCurrentlyIn) await removeCheckIn(today, playerName);
    else await addCheckIn(today, playerName, false);
    await renderAdminTournament();
  } catch (error) { alert("Failed to update check-in: " + error.message); }
};

window.togglePlayerLeft = async function (playerName, markLeft) {
  const today = getTodayStr();
  const action = markLeft ? 'mark as LEFT' : 'mark as ACTIVE again';
  if (!confirm(`Are you sure you want to ${action} "${playerName}"?`)) return;
  try {
    await setPlayerStatus(today, playerName, markLeft ? 'left' : 'active');
    await renderAdminTournament();
  } catch (error) { alert("Failed to update status: " + error.message); }
};

window.doAddWalkIn = async function () {
  const today = getTodayStr();
  const name = prompt("Enter walk-in player's full name:");
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  try {
    const checkInMap = await loadCheckIns(today);
    if (checkInMap[trimmed]) { alert(`"${trimmed}" is already on today's list.`); return; }
    await addCheckIn(today, trimmed, true);
    await renderAdminTournament();
  } catch (error) { alert("Failed to add walk-in: " + error.message); }
};

window.doResetToday = async function () {
  const today = getTodayStr();
  if (!confirm(`🗑 Reset Today's Session\n\nThis will delete ALL matches and check-ins for TODAY (${today}).\n\nContinue?`)) return;
  try {
    await supabaseFetch(`/rest/v1/matches?play_date=eq.${today}`, { method: "DELETE" });
    await supabaseFetch(`/rest/v1/check_ins?play_date=eq.${today}`, { method: "DELETE" });
    try { localStorage.removeItem("zinja_last_cleanup_date"); } catch {}
    alert("✅ Today's session has been reset.");
    await renderAdminTournament();
    await renderLiveBoard();
  } catch (error) { alert("❌ Reset failed: " + error.message); }
};

window.doClearOldData = async function () {
  const today = getTodayStr();
  if (!confirm(`🧹 Clean Old Data\n\nDeletes ALL matches and check-ins from PREVIOUS days.\n\nToday (${today}) is safe. Continue?`)) return;
  try {
    await supabaseFetch(`/rest/v1/matches?play_date=lt.${today}`, { method: "DELETE" });
    await supabaseFetch(`/rest/v1/check_ins?play_date=lt.${today}`, { method: "DELETE" });
    try { localStorage.setItem("zinja_last_cleanup_date", today); } catch {}
    alert("✅ Old data cleaned.");
    await renderAdminTournament();
    await renderLiveBoard();
  } catch (error) { alert("❌ Cleanup failed: " + error.message); }
};

window.doSmartSuggest = async function () {
  const today = getTodayStr();
  try {
    const [regs, checkInMap, matches] = await Promise.all([
      supabaseFetch(`/rest/v1/open_play?select=player_name&play_date=eq.${encodeURIComponent(today)}`),
      loadCheckIns(today),
      loadMatches(today)
    ]);
    const registeredPlayers = (regs || []).map(r => r.player_name);
    const walkInPlayers = Object.keys(checkInMap).filter(n => checkInMap[n].is_walkin && !registeredPlayers.includes(n));
    const allPlayers = [...registeredPlayers, ...walkInPlayers];
    const playersInPending = getPlayersInPendingMatches(matches);
    const available = allPlayers.filter(n => checkInMap[n] && checkInMap[n].status === 'active' && !playersInPending.has(n));

    if (available.length < 4) { alert(`Need at least 4 available players. Currently: ${available.length}`); return; }
    const suggestion = smartSuggest(available, matches);
    if (!suggestion) { alert("Could not generate suggestion."); return; }

    document.getElementById('teamAP1').value = suggestion.teamA[0];
    document.getElementById('teamAP2').value = suggestion.teamA[1];
    document.getElementById('teamBP1').value = suggestion.teamB[0];
    document.getElementById('teamBP2').value = suggestion.teamB[1];
    alert(`✨ Smart Suggest applied!\n\nTeam A: ${suggestion.teamA[0]} & ${suggestion.teamA[1]}\nTeam B: ${suggestion.teamB[0]} & ${suggestion.teamB[1]}`);
  } catch (error) { alert("Suggest failed: " + error.message); }
};

window.doCreateMatch = async function () {
  const today = getTodayStr();
  const court = Number(document.getElementById('newMatchCourt')?.value);
  const a1 = document.getElementById('teamAP1')?.value;
  const a2 = document.getElementById('teamAP2')?.value;
  const b1 = document.getElementById('teamBP1')?.value;
  const b2 = document.getElementById('teamBP2')?.value;

  if (!a1 || !a2 || !b1 || !b2) { alert("Please select all 4 players."); return; }
  const all = [a1, a2, b1, b2];
  if (new Set(all).size !== 4) { alert("Each player can only appear once."); return; }

  try {
    await createMatch(today, court, [a1, a2], [b1, b2]);
    await renderAdminTournament();
    await renderLiveBoard();
  } catch (error) { alert("Failed to create match: " + error.message); }
};

window.adminDeclareWinner = async function (matchId, team) {
  if (!confirm(`Declare Team ${team} as winner?\n\nIf a court frees up, the next queued match will auto-start.`)) return;
  try {
    await declareWinner(matchId, team);
    await renderAdminTournament();
    await renderLiveBoard();
  } catch (error) { alert("Failed: " + error.message); }
};

window.adminCancelMatch = async function (matchId) {
  if (!confirm("Cancel this match? It will be deleted permanently.")) return;
  try {
    await cancelMatch(matchId);
    await renderAdminTournament();
    await renderLiveBoard();
  } catch (error) { alert("Failed: " + error.message); }
};

// ====================
// CLUB CHAT
// ====================

async function loadChatMessages() {
  const container = document.getElementById("chatMessages");
  if (!container) return;
  if (document.visibilityState !== 'visible') return;
  try {
    const rows = await supabaseFetch("/rest/v1/chat_messages?select=player_name,message,created_at&order=created_at.asc&limit=50");
    if (!rows || rows.length === 0) {
      container.innerHTML = "<p style='text-align:center;color:#aaa;'>No messages yet today. Be the first to say hi! 👋</p>";
      return;
    }
    const currentScroll = container.scrollTop + container.clientHeight;
    const wasAtBottom = currentScroll >= container.scrollHeight - 50;
    container.innerHTML = rows.map(msg => {
      const time = new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      return `
        <div style="margin-bottom:12px;padding:10px;background:#2a2a4a;border-radius:8px;border-left:3px solid #7c3aed;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <strong style="color:#a78bfa;">${escapeHtml(msg.player_name)}</strong>
            <small style="color:#aaa;">${time}</small>
          </div>
          <div style="word-wrap:break-word;font-size:1.05em;color:#fff;">${escapeHtml(msg.message)}</div>
        </div>
      `;
    }).join("");
    if (wasAtBottom) container.scrollTop = container.scrollHeight;
  } catch (error) {
    console.error("Chat load error:", error);
    container.innerHTML = "<p style='text-align:center;color:#ef4444;'>Unable to load chat. Please refresh.</p>";
  }
}

async function sendChatMessage() {
  const nameInput = document.getElementById("chatName");
  const messageInput = document.getElementById("chatInput");
  const name = nameInput?.value.trim();
  const message = messageInput?.value.trim();
  if (!name) { alert("Please enter your name first."); nameInput?.focus(); return; }
  if (!message) { alert("Please type a message."); return; }
  if (message.length > 500) { alert("Message is too long. Maximum is 500 characters."); return; }
  try { localStorage.setItem("zinja_chat_name", name); } catch {}
  try {
    const sendBtn = document.getElementById("sendChatBtn");
    if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = "..."; }
    await supabaseFetch("/rest/v1/chat_messages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ player_name: name, message: message })
    });
    messageInput.value = "";
    messageInput.focus();
    await loadChatMessages();
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send"; }
  } catch (error) {
    console.error("Send chat error:", error);
    alert("Failed to send message: " + error.message);
    const sendBtn = document.getElementById("sendChatBtn");
    if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "Send"; }
  }
}

function insertEmoji(emoji) {
  const input = document.getElementById("chatInput");
  if (!input) return;
  input.value += emoji;
  input.focus();
}

function setupChatEmojiPicker() {
  const emojiBtn = document.getElementById("emojiBtn");
  const emojiPicker = document.getElementById("emojiPicker");
  if (!emojiBtn || !emojiPicker) return;
  emojiBtn.addEventListener("click", () => {
    emojiPicker.style.display = emojiPicker.style.display === "none" ? "block" : "none";
  });
  document.addEventListener("click", (e) => {
    if (!emojiPicker.contains(e.target) && !emojiBtn.contains(e.target)) {
      emojiPicker.style.display = "none";
    }
  });
}

function setupChatName() {
  const nameInput = document.getElementById("chatName");
  if (!nameInput) return;
  try {
    const savedName = localStorage.getItem("zinja_chat_name");
    if (savedName) nameInput.value = savedName;
  } catch {}
}

function setupChat() {
  const chatSection = document.getElementById("chat");
  if (!chatSection) return;
  setupChatName();
  setupChatEmojiPicker();
  announceClosureInChat();
  loadChatMessages();
}

// ====================
// ADMIN PANEL
// ====================

async function loadAdminData() {
  const pw = document.getElementById('adminPassword')?.value;
  const resultDiv = document.getElementById('adminResult');
  const dataDiv = document.getElementById('adminData');

  if (pw !== ADMIN_PASSWORD) {
    if (resultDiv) resultDiv.innerHTML = '<p style="color: red; font-weight: bold;">❌ Invalid password.</p>';
    return;
  }
  if (resultDiv) resultDiv.innerHTML = '';
  if (dataDiv) dataDiv.style.display = 'block';

  try {
    const bkRes = await supabaseFetch('/rest/v1/bookings?select=id,customer_name,mobile,booking_date,start_time,court,duration_hours,price,created_at&order=created_at.desc');
    adminData.bookings = bkRes || [];
    const opRes = await supabaseFetch('/rest/v1/open_play?select=id,player_name,mobile,play_date,skill_level&order=created_at.desc');
    adminData.openplay = opRes || [];
    renderAdminContent();
  } catch (err) {
    if (resultDiv) resultDiv.innerHTML = `<p style="color: red;">❌ Failed to load data: ${err.message}</p>`;
  }
}

function switchAdminTab(tab) {
  currentAdminTab = tab;
  const tabIds = { bookings: 'tabBookings', openplay: 'tabOpenPlay', tournament: 'tabTournament' };
  Object.keys(tabIds).forEach(t => {
    const btn = document.getElementById(tabIds[t]);
    if (btn) {
      if (t === tab) {
        btn.style.background = 'linear-gradient(135deg, #7c3aed, #6d28d9)';
        btn.style.color = '#ffffff';
        btn.style.border = '2px solid #6d28d9';
      } else {
        btn.style.background = '#ffffff';
        btn.style.color = '#333333';
        btn.style.border = '2px solid #dddddd';
      }
    }
  });
  renderAdminContent();
}

function renderAdminContent() {
  const container = document.getElementById('adminContent');
  if (!container) return;

  if (currentAdminTab === 'tournament') { renderAdminTournament(); return; }

  let html = '';
  if (currentAdminTab === 'bookings') {
    if (adminData.bookings.length === 0) {
      html = '<p style="color: #888;">No court bookings yet.</p>';
    } else {
      html = adminData.bookings.map(b => `
        <div class="admin-card">
          <button class="admin-delete-btn" onclick="deleteBooking('${b.id}')">🗑 Delete</button>
          <h4>🏓 ${escapeHtml(b.customer_name || 'Unknown')}</h4>
          <p>📱 ${escapeHtml(b.mobile || 'No phone')}</p>
          <p>📅 ${escapeHtml(b.booking_date || 'No date')} at ${escapeHtml(b.start_time || 'No time')}</p>
          <p>🏟️ Court ${escapeHtml(b.court || '?')} • ⏱️ ${escapeHtml(b.duration_hours || '?')} hour(s)</p>
          <p>💰 ₱${Number(b.price || 0).toLocaleString()}</p>
        </div>
      `).join('');
    }
  } else if (currentAdminTab === 'openplay') {
    if (adminData.openplay.length === 0) {
      html = '<p style="color: #888;">No Open Play registrations yet.</p>';
    } else {
      html = adminData.openplay.map(o => `
        <div class="admin-card">
          <button class="admin-delete-btn" onclick="deleteOpenPlay('${o.id}')">🗑 Delete</button>
          <h4>🏓 ${escapeHtml(o.player_name || 'Unknown')}</h4>
          <p>📱 ${escapeHtml(o.mobile || 'No phone')}</p>
          <p>📅 ${escapeHtml(o.play_date || 'No date')}</p>
          <p>🎯 Skill Level: ${escapeHtml(o.skill_level || 'Not specified')}</p>
        </div>
      `).join('');
    }
  }
  container.innerHTML = html;
}

async function deleteBooking(id) {
  const pw = prompt("Enter admin password to delete this booking:");
  if (pw !== ADMIN_PASSWORD) { alert("❌ Invalid password"); return; }
  if (!confirm("Delete this booking? Cannot be undone.")) return;
  try {
    await supabaseFetch(`/rest/v1/bookings?id=eq.${id}`, { method: "DELETE" });
    alert("✅ Booking deleted.");
    await loadAdminData();
    await loadBookings();
  } catch (error) { alert("❌ Delete failed: " + error.message); }
}

async function deleteOpenPlay(id) {
  const pw = prompt("Enter admin password to delete this player:");
  if (pw !== ADMIN_PASSWORD) { alert("❌ Invalid password"); return; }
  if (!confirm("Delete this player registration? Cannot be undone.")) return;
  try {
    await supabaseFetch(`/rest/v1/open_play?id=eq.${id}`, { method: "DELETE" });
    alert("✅ Player removed.");
    await loadAdminData();
  } catch (error) { alert("❌ Delete failed: " + error.message); }
}

// ====================
// START
// ====================

document.addEventListener("DOMContentLoaded", async () => {
  const bookingForm = document.getElementById("bookingForm");
  const playForm = document.getElementById("playForm");
  if (bookingForm) bookingForm.addEventListener("submit", handleBookingSubmit);
  if (playForm) playForm.addEventListener("submit", handleOpenPlaySubmit);

  createCancellationBoxes();
  setupPriceDisplay();
  setupAvailabilityCheck();
  setupOpenPlayInfo();
  setupChat();
  loadBookings();
  loadOpenPlay();
  updateLiveClosureStatus();

  await autoCleanupOldData();
  renderLiveBoard();

  const refreshBookingsBtn = document.getElementById("refreshBookingsBtn");
  if (refreshBookingsBtn) {
    refreshBookingsBtn.addEventListener("click", async () => {
      refreshBookingsBtn.disabled = true;
      refreshBookingsBtn.textContent = "⏳ Loading...";
      await loadBookings();
      refreshBookingsBtn.disabled = false;
      refreshBookingsBtn.textContent = "🔄 Refresh Bookings";
    });
  }

  const refreshOpenPlayBtn = document.getElementById("refreshOpenPlayBtn");
  if (refreshOpenPlayBtn) {
    refreshOpenPlayBtn.addEventListener("click", async () => {
      refreshOpenPlayBtn.disabled = true;
      refreshOpenPlayBtn.textContent = "⏳ Loading...";
      await loadOpenPlay();
      refreshOpenPlayBtn.disabled = false;
      refreshOpenPlayBtn.textContent = "🔄 Refresh Open Play";
    });
  }

  setInterval(async () => {
    if (document.visibilityState === 'visible') {
      await renderLiveBoard();
      const adminDataEl = document.getElementById('adminData');
      if (currentAdminTab === 'tournament' && adminDataEl && adminDataEl.style.display !== 'none') {
        await renderAdminTournament();
      }
    }
  }, LIVE_MATCH_POLL_MS);

  let lastChatLoad = 0;
  let lastDataLoad = 0;
  let lastStatusUpdate = 0;

  function smartLoop(timestamp) {
    if (document.visibilityState === 'visible') {
      if (timestamp - lastChatLoad >= CHAT_POLL_MS) {
        lastChatLoad = timestamp;
        loadChatMessages();
      }
      if (timestamp - lastDataLoad >= DATA_POLL_MS) {
        lastDataLoad = timestamp;
        loadBookings();
        loadOpenPlay();
      }
      if (timestamp - lastStatusUpdate >= STATUS_POLL_MS) {
        lastStatusUpdate = timestamp;
        updateLiveClosureStatus();
      }
    }
    requestAnimationFrame(smartLoop);
  }
  requestAnimationFrame(smartLoop);

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible") {
      loadChatMessages();
      loadBookings();
      loadOpenPlay();
      updateLiveClosureStatus();
      await autoCleanupOldData();
      renderLiveBoard();
    }
  });
});
