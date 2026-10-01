const SUPABASE_URL = "https://kbafnegagyiwztyfmxpr.supabase.co";
const SUPABASE_KEY = "sb_publishable_djA6ivm66-hfO3WLub527w_AbOa8rvc";

const headers = {
  apikey: SUPABASE_KEY,
  "Content-Type": "application/json"
};

const CHAT_POLL_MS = 60000;
const DATA_POLL_MS = 300000;
const STATUS_POLL_MS = 300000;

const BOOKING_DISPLAY_DAYS = 30;
const OPENPLAY_DISPLAY_DAYS = 7;

const OPEN_PLAY_START_MIN = 18 * 60;
const OPEN_PLAY_END_MIN = 24 * 60;
const OPEN_PLAY_START_TIME = "18:00";
const PLAYERS_PER_COURT = 16;
const TOTAL_COURTS = 2;
const OPEN_PLAY_FEE = 50;

const MATCH_DURATION_MIN = 15;
const MATCH_TARGET_SCORE = 11;

// ===== SKILL MATCHING THRESHOLDS =====
// If total players < 12 → ALL MIXED (para lahat makalaro)
// If >= 12 players AND may 2+ skill tiers na may 4+ players → SKILL-BASED
const MIXED_MODE_THRESHOLD = 12;
const MIN_TIER_SIZE = 4;

const SESSION_START_TIME = "18:00";
const SESSION_END_TIME = "24:00";

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
let currentAdminTab = 'bookings';

function getPHTNow() {
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcMs + (PHT_OFFSET_HOURS * 3600000));
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

function addMinutesToTime(time, mins) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function formatTime12(time) {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  return `${displayH}:${String(m).padStart(2, "0")} ${suffix}`;
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
    banner.innerHTML = `<span style="display: inline-block; width: 10px; height: 10px; background: #fff; border-radius: 50%; margin-right: 8px;"></span><strong>🔴 CLOSED NOW</strong> — Weekly Rest Period (reopens Saturday 5:00 PM) · ${timeStr} PHT`;
    banner.style.background = "linear-gradient(135deg, #dc2626, #991b1b)";
  } else {
    banner.innerHTML = `<span style="display: inline-block; width: 10px; height: 10px; background: #fff; border-radius: 50%; margin-right: 8px;"></span><strong>🟢 OPEN NOW</strong> — Book your court or join Open Play! · ${timeStr} PHT`;
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
  notice.style.cssText = "margin-bottom: 12px; padding: 12px; background: #7f1d1d; border-radius: 8px; border-left: 4px solid #ef4444; color: #fff; font-size: 0.95em;";
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
    const existing = await supabaseFetch(`/rest/v1/bookings?select=start_time,duration_hours&booking_date=eq.${encodeURIComponent(bookingDate)}&court=eq.${encodeURIComponent(court)}`);
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
    
    const matchDateInput = document.getElementById("matchDate");
    if (matchDateInput && matchDateInput.value === bookingDate) {
      localStorage.removeItem(`zinja_matchup_seed_${bookingDate}`);
      await loadAutoMatchups(bookingDate);
    }
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
    
    const matchDateInput = document.getElementById("matchDate");
    if (matchDateInput && matchDateInput.value === playDate) {
      localStorage.removeItem(`zinja_matchup_seed_${playDate}`);
      await loadAutoMatchups(playDate);
    }
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
// AUTO MATCH SYSTEM (BULLETPROOF VERSION)
// ====================

function seededShuffle(array, seed) {
  const arr = [...array];
  let s = 0;
  for (let i = 0; i < String(seed).length; i++) s += String(seed).charCodeAt(i);
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function groupPlayersBySkill(players) {
  const advanced = [];
  const intermediate = [];
  const beginner = [];
  const flexible = [];
  players.forEach(p => {
    const lvl = String(p.skill_level || '').trim();
    if (lvl === 'Advanced') advanced.push(p);
    else if (lvl === 'Intermediate') intermediate.push(p);
    else if (lvl === 'Beginner') beginner.push(p);
    else flexible.push(p);
  });
  return { advanced, intermediate, beginner, flexible };
}

// ===== SIMPLIFIED BULLETPROOF buildPools =====
function buildPools(players) {
  const total = players.length;
  const groups = groupPlayersBySkill(players);
  const advCount = groups.advanced.length;
  const intCount = groups.intermediate.length;
  const begCount = groups.beginner.length;
  const flexCount = groups.flexible.length;

  // DEBUG
  console.log('=== MATCHUP DEBUG ===');
  console.log('Total players:', total);
  console.log('Advanced:', advCount, '| Intermediate:', intCount, '| Beginner:', begCount, '| Any level:', flexCount);
  console.log('Mixed mode threshold:', MIXED_MODE_THRESHOLD);

  // RULE 1: If < 12 players total → ALWAYS Mixed mode (kasama lahat)
  if (total < MIXED_MODE_THRESHOLD) {
    console.log('→ MIXED MODE (few players, all included)');
    return [{ name: 'Mixed', color: '#7c3aed', players: [...players] }];
  }

  // RULE 2: Skill-based mode requires at least 2 tiers with >= 4 players each
  const hasAdvTier = advCount >= MIN_TIER_SIZE;
  const hasIntTier = intCount >= MIN_TIER_SIZE;
  const hasBegTier = begCount >= MIN_TIER_SIZE;
  const validTierCount = [hasAdvTier, hasIntTier, hasBegTier].filter(Boolean).length;

  console.log('Valid tiers:', validTierCount, '(need >= 2)');

  // RULE 3: If < 2 valid tiers → Mixed mode (all included)
  if (validTierCount < 2) {
    console.log('→ MIXED MODE (not enough valid skill tiers)');
    return [{ name: 'Mixed', color: '#7c3aed', players: [...players] }];
  }

  // RULE 4: Skill-based mode
  console.log('→ SKILL-BASED MODE');
  const pools = [];
  const leftover = [];

  if (hasAdvTier) {
    pools.push({ name: 'Advanced', color: '#dc2626', players: [...groups.advanced] });
  } else {
    leftover.push(...groups.advanced);
  }

  if (hasIntTier) {
    pools.push({ name: 'Intermediate', color: '#f59e0b', players: [...groups.intermediate] });
  } else {
    leftover.push(...groups.intermediate);
  }

  if (hasBegTier) {
    pools.push({ name: 'Beginner', color: '#10b981', players: [...groups.beginner] });
  } else {
    leftover.push(...groups.beginner);
  }

  // Always add flexible (Any level) players to leftover
  leftover.push(...groups.flexible);

  console.log('Leftover players:', leftover.length);

  if (leftover.length >= MIN_TIER_SIZE) {
    pools.push({ name: 'Mixed', color: '#7c3aed', players: leftover });
  } else if (leftover.length > 0) {
    // Merge sa pinakamalaking tier
    const largest = pools.reduce((max, p) => p.players.length > max.players.length ? p : max);
    largest.players.push(...leftover);
    console.log('Merged leftover into', largest.name);
  }

  console.log('Final pools:', pools.map(p => `${p.name}(${p.players.length})`).join(', '));
  return pools;
}

function generateAutoSchedule(players, startTime, availableCourts) {
  if (!players || players.length < 4 || !availableCourts || availableCourts.length === 0) return [];

  const numCourts = availableCourts.length;
  const pools = buildPools(players);
  if (pools.length === 0) return [];

  const sessionStartMin = timeToMinutes(SESSION_START_TIME);
  const sessionEndMin = 24 * 60;
  const sessionMinutes = sessionEndMin - sessionStartMin;
  const totalWaves = Math.floor(sessionMinutes / MATCH_DURATION_MIN);
  const maxMatches = totalWaves * numCourts;

  const allMatches = [];
  let round = 0;
  const MAX_SAFETY_ROUNDS = 200;

  while (allMatches.length < maxMatches && round < MAX_SAFETY_ROUNDS) {
    let matchesThisRound = 0;
    pools.forEach(p => {
      if (allMatches.length >= maxMatches) return;
      const shuffled = seededShuffle(p.players, `${p.name}-round-${round}`);
      for (let i = 0; i + 4 <= shuffled.length; i += 4) {
        if (allMatches.length >= maxMatches) break;
        allMatches.push({
          tier: p.name,
          tierColor: p.color,
          round: round + 1,
          teamA: [shuffled[i], shuffled[i+1]],
          teamB: [shuffled[i+2], shuffled[i+3]]
        });
        matchesThisRound++;
      }
    });
    if (matchesThisRound === 0) break;
    round++;
  }

  if (allMatches.length === 0) return [];

  const schedule = [];
  let currentTime = startTime;
  for (let i = 0; i < allMatches.length; i += numCourts) {
    const currentMinutes = timeToMinutes(currentTime);
    if (currentMinutes >= sessionEndMin) break;

    const wave = allMatches.slice(i, i + numCourts);
    wave.forEach((match, idx) => {
      match.court = availableCourts[idx];
      match.startTime = currentTime;
      match.endTime = addMinutesToTime(currentTime, MATCH_DURATION_MIN);
      schedule.push(match);
    });
    currentTime = addMinutesToTime(currentTime, MATCH_DURATION_MIN);
  }

  return schedule;
}

function renderAutoSchedule(schedule, dateStr, playerCount, availableCourts) {
  const container = document.getElementById("matchupsContainer");
  if (!container) return;

  if (schedule.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:#f59e0b;">⚠️ No matchups for ${formatDate(dateStr)}. Need at least 4 players.</p>`;
    return;
  }

  const numCourts = availableCourts.length;
  const courtsLabel = numCourts === 2 ? "🏓 2 Courts (parallel)" : `🏓 1 Court (Court ${availableCourts[0]})`;

  const lastMatch = schedule[schedule.length - 1];
  const sessionEnd = lastMatch ? formatTime12(lastMatch.endTime) : "N/A";

  const totalPlayerSlots = schedule.length * 4;
  const gamesPerPlayer = Math.round(totalPlayerSlots / playerCount);

  const tierCounts = {};
  schedule.forEach(m => { tierCounts[m.tier] = (tierCounts[m.tier] || 0) + 1; });
  const tierSummary = Object.entries(tierCounts).map(([t, c]) => `${t}: ${c}`).join(' · ');

  const isMixedMode = tierCounts['Mixed'] && Object.keys(tierCounts).length === 1;
  const modeLabel = isMixedMode ? "🎲 Mixed Mode" : "🎯 Skill-Based Mode";

  let html = `
    <div style="text-align: center; margin-bottom: 20px; padding: 16px; background: rgba(124,58,237,0.15); border-radius: 12px; border: 1px solid rgba(124,58,237,0.3);">
      <p style="font-size: 1.1em; margin: 4px 0;">📅 <strong>${formatDate(dateStr)}</strong></p>
      <p style="font-size: 0.95em; margin: 4px 0; opacity: 0.9;">👥 ${playerCount} players · ${courtsLabel}</p>
      <p style="font-size: 0.95em; margin: 4px 0; opacity: 0.9;">🏓 ${schedule.length} matches · 🕐 Start: <strong>${formatTime12(SESSION_START_TIME)}</strong> · End: <strong>${sessionEnd}</strong></p>
      <p style="font-size: 0.85em; margin: 4px 0; opacity: 0.75;">~${gamesPerPlayer} games per player · 15 min/match to 11 points</p>
      <p style="font-size: 0.85em; margin: 8px 0 0 0; opacity: 0.85;">${modeLabel} — ${tierSummary}</p>
    </div>
  `;

  schedule.forEach((m, idx) => {
    const isNow = idx < numCourts;
    const isNext = idx >= numCourts && idx < numCourts * 2;
    let cls = "matchup-card";
    let badge = `⏳ MATCH #${idx + 1}`;
    if (isNow) { cls += " now-playing"; badge = "🟢 NOW PLAYING"; }
    else if (isNext) { cls += " up-next"; badge = "🟡 UP NEXT"; }

    const tierColor = m.tierColor || '#7c3aed';
    const tierIcon = m.tier === 'Advanced' ? '🔥' : m.tier === 'Intermediate' ? '⚡' : m.tier === 'Beginner' ? '🌱' : '🎲';

    html += `
      <div class="${cls}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 6px;">
          <span style="font-size: 0.85em; font-weight: 700;">${badge}</span>
          <span style="font-size: 0.75em; opacity: 0.9;">🏓 Court ${m.court} · 🕐 ${formatTime12(m.startTime)} - ${formatTime12(m.endTime)}</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span style="display: inline-block; padding: 3px 12px; background: ${tierColor}33; border: 1px solid ${tierColor}; border-radius: 20px; font-size: 0.75em; font-weight: 700; color: #fff;">${tierIcon} ${m.tier} · Round ${m.round}</span>
        </div>
        <div class="team-block">
          <strong style="color: #10b981;">Team A:</strong>
          <span>${escapeHtml(m.teamA[0].player_name)}</span>
          <span style="opacity: 0.5;">&</span>
          <span>${escapeHtml(m.teamA[1].player_name)}</span>
        </div>
        <div class="vs-badge">— VS — (to 11 pts)</div>
        <div class="team-block">
          <strong style="color: #f59e0b;">Team B:</strong>
          <span>${escapeHtml(m.teamB[0].player_name)}</span>
          <span style="opacity: 0.5;">&</span>
          <span>${escapeHtml(m.teamB[1].player_name)}</span>
        </div>
      </div>
    `;
  });

  html += `<p style="text-align: center; font-size: 0.85em; opacity: 0.7; margin-top: 24px;">💡 ${isMixedMode ? 'Mixed mode — lahat magkakasama.' : 'Skill-based matching — Advanced vs Advanced, Beginner vs Beginner.'} Auto-generated 6PM-12AM. Admin can re-shuffle.</p>`;
  container.innerHTML = html;
}

async function loadAutoMatchups(dateStr) {
  const container = document.getElementById("matchupsContainer");
  if (!container || !dateStr) return;
  container.innerHTML = '<p style="text-align:center;">⏳ Generating schedule...</p>';
  try {
    const players = await supabaseFetch(`/rest/v1/open_play?select=player_name,skill_level&play_date=eq.${encodeURIComponent(dateStr)}`);
    if (!players || players.length === 0) {
      container.innerHTML = `<p style="text-align:center;color:#f59e0b;">⚠️ No Open Play registrations for ${formatDate(dateStr)}.</p>`;
      return;
    }
    if (players.length < 4) {
      container.innerHTML = `<p style="text-align:center;color:#f59e0b;">⚠️ Need at least 4 players to generate matchups. Currently: ${players.length}.</p>`;
      return;
    }
    const availableCourts = await getAvailableCourtsForDate(dateStr);
    if (availableCourts.length === 0) {
      container.innerHTML = `<p style="text-align:center;color:#ef4444;">⚠️ Both courts are booked for Open Play hours on ${formatDate(dateStr)}. No matchups to generate.</p>`;
      return;
    }
    const seedKey = `zinja_matchup_seed_${dateStr}`;
    let seed = localStorage.getItem(seedKey);
    if (!seed) { seed = "default-seed"; localStorage.setItem(seedKey, seed); }
    const shuffled = seededShuffle(players, seed);
    const schedule = generateAutoSchedule(shuffled, SESSION_START_TIME, availableCourts);
    renderAutoSchedule(schedule, dateStr, shuffled.length, availableCourts);
  } catch (error) {
    console.error("Matchups error:", error);
    container.innerHTML = `<p style="text-align:center;color:#ef4444;">❌ ${error.message}</p>`;
  }
}

async function adminRerollMatchups() {
  const pw = prompt("Enter admin password to re-shuffle:");
  if (pw !== ADMIN_PASSWORD) { alert("❌ Invalid password"); return; }
  const dateInput = document.getElementById("adminMatchDate");
  const dateStr = dateInput?.value;
  if (!dateStr) { alert("Please select a date first."); return; }
  const newSeed = Math.random().toString(36).substring(2, 10);
  localStorage.setItem(`zinja_matchup_seed_${dateStr}`, newSeed);
  await renderAdminMatchups(dateStr);
  await loadAutoMatchups(dateStr);
}

async function renderAdminMatchups(dateStr) {
  const container = document.getElementById("adminMatchupsContainer");
  if (!container || !dateStr) return;
  container.innerHTML = '<p style="text-align:center;">⏳ Loading...</p>';
  try {
    const players = await supabaseFetch(`/rest/v1/open_play?select=player_name,skill_level&play_date=eq.${encodeURIComponent(dateStr)}`);
    if (!players || players.length < 4) {
      container.innerHTML = `<p style="color:#888;">Need at least 4 players. Currently: ${players?.length || 0}.</p>`;
      return;
    }
    const availableCourts = await getAvailableCourtsForDate(dateStr);
    if (availableCourts.length === 0) {
      container.innerHTML = `<p style="color:#ef4444;">⚠️ No courts available on ${formatDate(dateStr)}.</p>`;
      return;
    }
    const seedKey = `zinja_matchup_seed_${dateStr}`;
    let seed = localStorage.getItem(seedKey) || "default-seed";
    const shuffled = seededShuffle(players, seed);
    const schedule = generateAutoSchedule(shuffled, SESSION_START_TIME, availableCourts);
    const numCourts = availableCourts.length;
    const courtsLabel = numCourts === 2 ? "Courts 1 & 2" : `Court ${availableCourts[0]}`;
    const lastMatch = schedule[schedule.length - 1];
    const endTime = lastMatch ? formatTime12(lastMatch.endTime) : "N/A";
    const tierCounts = {};
    schedule.forEach(m => { tierCounts[m.tier] = (tierCounts[m.tier] || 0) + 1; });
    const isMixedMode = tierCounts['Mixed'] && Object.keys(tierCounts).length === 1;
    const modeLabel = isMixedMode ? "Mixed Mode" : "Skill-Based Mode";
    container.innerHTML = `<p style="color:#10b981; font-weight:600;">✅ ${courtsLabel} · ${shuffled.length} players · ${schedule.length} matches · Ends ${endTime} · ${modeLabel}</p>`;
  } catch (error) {
    container.innerHTML = `<p style="color:red;">❌ ${error.message}</p>`;
  }
}

async function deleteBooking(id) {
  const pw = prompt("Enter admin password to delete this booking:");
  if (pw !== ADMIN_PASSWORD) { alert("❌ Invalid password"); return; }
  if (!confirm("Are you sure you want to delete this booking? This cannot be undone.")) return;
  try {
    let bookingDate = null;
    try {
      const info = await supabaseFetch(`/rest/v1/bookings?id=eq.${id}&select=booking_date`);
      if (info && info[0]) bookingDate = info[0].booking_date;
    } catch (e) { console.warn("Could not fetch booking date", e); }
    
    await supabaseFetch(`/rest/v1/bookings?id=eq.${id}`, { method: "DELETE" });
    alert("✅ Booking deleted.");
    await loadAdminData();
    await loadBookings();
    
    const matchDateInput = document.getElementById("matchDate");
    if (matchDateInput && bookingDate && matchDateInput.value === bookingDate) {
      await loadAutoMatchups(bookingDate);
    }
  } catch (error) { alert("❌ Delete failed: " + error.message); }
}

async function deleteOpenPlay(id) {
  const pw = prompt("Enter admin password to delete this player:");
  if (pw !== ADMIN_PASSWORD) { alert("❌ Invalid password"); return; }
  if (!confirm("Are you sure you want to delete this player registration? This cannot be undone.")) return;
  try {
    let playerDate = null;
    try {
      const info = await supabaseFetch(`/rest/v1/open_play?id=eq.${id}&select=play_date`);
      if (info && info[0]) playerDate = info[0].play_date;
    } catch (e) { console.warn("Could not fetch player date", e); }
    
    await supabaseFetch(`/rest/v1/open_play?id=eq.${id}`, { method: "DELETE" });
    alert("✅ Player removed.");
    await loadAdminData();
    
    const matchDateInput = document.getElementById("matchDate");
    if (matchDateInput && playerDate && matchDateInput.value === playerDate) {
      localStorage.removeItem(`zinja_matchup_seed_${playerDate}`);
      await loadAutoMatchups(playerDate);
    }
  } catch (error) { alert("❌ Delete failed: " + error.message); }
}// ====================
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
        <div style="margin-bottom: 12px; padding: 10px; background: #2a2a4a; border-radius: 8px; border-left: 3px solid #7c3aed;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <strong style="color: #a78bfa;">${escapeHtml(msg.player_name)}</strong>
            <small style="color: #aaa;">${time}</small>
          </div>
          <div style="word-wrap: break-word; font-size: 1.05em; color: #ffffff;">${escapeHtml(msg.message)}</div>
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
    const bookings = bkRes || [];
    const opRes = await supabaseFetch('/rest/v1/open_play?select=id,player_name,mobile,play_date,skill_level&order=created_at.desc');
    const openplay = opRes || [];
    adminData.bookings = bookings;
    adminData.openplay = openplay;
    renderAdminContent();
  } catch (err) {
    if (resultDiv) resultDiv.innerHTML = `<p style="color: red;">❌ Failed to load data: ${err.message}</p>`;
  }
}

function switchAdminTab(tab) {
  currentAdminTab = tab;
  const tabs = ['bookings', 'openplay', 'matchups'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
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
  } else if (currentAdminTab === 'matchups') {
    const today = new Date().toISOString().split("T")[0];
    html = `
      <div style="background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 16px;">
        <h3 style="color: #7c3aed; margin-top: 0;">🎲 Matchups Manager</h3>
        <p style="color: #666; font-size: 0.9em;">Auto-generated schedule from 6PM to 12AM — matches to 11 points (~15 min).</p>
        <p style="color: #888; font-size: 0.85em; font-style: italic;">&lt; 12 players = Mixed Mode · ≥ 12 players with 2+ valid tiers = Skill-Based Mode</p>
        <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
          <input id="adminMatchDate" type="date" value="${today}" style="flex: 1; min-width: 200px; padding: 12px; border-radius: 8px; border: 1px solid #ddd;">
          <button type="button" onclick="renderAdminMatchups(document.getElementById('adminMatchDate').value)" style="padding: 12px 24px; background: linear-gradient(135deg, #7c3aed, #6d28d9); color: #fff; border: none; border-radius: 8px; font-weight: 700; cursor: pointer;">🔄 Load</button>
          <button type="button" onclick="adminRerollMatchups()" style="padding: 12px 24px; background: #ef4444; color: #fff; border: none; border-radius: 8px; font-weight: 700; cursor: pointer;">🔀 Re-Shuffle</button>
        </div>
        <div id="adminMatchupsContainer">
          <p style="color: #888;">Select a date and click Load.</p>
        </div>
      </div>
    `;
  }
  container.innerHTML = html;
}

document.addEventListener("DOMContentLoaded", () => {
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

  const matchDateInput = document.getElementById("matchDate");
  if (matchDateInput) {
    const today = new Date().toISOString().split("T")[0];
    matchDateInput.value = today;
    matchDateInput.addEventListener("change", () => loadAutoMatchups(matchDateInput.value));
    loadAutoMatchups(today);
  }

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

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'visible') {
      loadChatMessages();
      loadBookings();
      loadOpenPlay();
      updateLiveClosureStatus();
      if (matchDateInput?.value) loadAutoMatchups(matchDateInput.value);
    }
  });
});
