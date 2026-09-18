const SUPABASE_URL = "https://kbafnegagyiwztyfmxpr.supabase.co";
const SUPABASE_KEY = "sb_publishable_djA6ivm66-hfO3WLub527w_AbOa8rvc";

const headers = {
  apikey: SUPABASE_KEY,
  "Content-Type": "application/json"
};

const POLL_MS = 30000;
const MEDIA_BUCKET = "zinja-media";
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const OPEN_PLAY_START_MIN = 17 * 60;
const OPEN_PLAY_END_MIN = 24 * 60;
const OPEN_PLAY_START_TIME = "17:00";
const PLAYERS_PER_COURT = 16;
const TOTAL_COURTS = 2;
const OPEN_PLAY_FEE = 50;

// ====================
// PRICING CONFIG
// ====================

const MORNING_START_MIN = 6 * 60;
const MORNING_END_MIN = 17 * 60;
const MORNING_RATE = 100;
const EVENING_RATE = 150;

// ====================
// WEEKLY CLOSURE
// ====================

const CLOSURE_DAY_START = 5;
const CLOSURE_DAY_END = 6;
const CLOSURE_START_HOUR = 17;
const CLOSURE_END_HOUR = 17;
const PHT_OFFSET_HOURS = 8;

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

// ====================
// PRICING FUNCTIONS
// ====================

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

  if (!timeInput || !durationInput) {
    priceDiv.style.display = "none";
    return;
  }

  const calc = calculateBookingPrice(timeInput, durationInput);
  priceDiv.style.display = "block";
  rateEl.textContent = `₱${calc.rate}`;
  totalEl.textContent = `₱${calc.total.toLocaleString()}`;

  if (calc.breakdown) {
    noteEl.textContent = `Mixed rate: ${calc.breakdown}`;
  } else {
    noteEl.textContent = calc.rate === MORNING_RATE
      ? "☀️ Day rate (6AM-5PM)"
      : "🌙 Evening rate (5PM-12AM)";
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

// ====================
// CLOSURE FUNCTIONS
// ====================

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
  
  // Open Play starts at 5:00 PM (OPEN_PLAY_START_MIN = 1020)
  // Closure ends at 5:00 PM (CLOSURE_END_HOUR * 60 = 1020)
  const openPlayStart = OPEN_PLAY_START_MIN;
  const closureEnd = CLOSURE_END_HOUR * 60;
  
  // Friday: Open Play at 5PM = closure start, so BLOCKED
  if (day === CLOSURE_DAY_START) {
    return { closed: true, message: "Our facility observes a weekly rest period every Friday from 5:00 PM until Saturday 5:00 PM. Please choose another date." };
  }
  
  // Saturday: Open Play at 5PM onwards is ALLOWED (since closure ends at 5PM)
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

function downloadViaAndroid(url, fileName) {
  if (typeof AndroidDownloader !== "undefined" && AndroidDownloader.downloadFile) {
    try {
      AndroidDownloader.downloadFile(url, fileName);
      return;
    } catch (err) {
      console.error("Android download failed:", err);
    }
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function checkOpenPlayCapacity(playDate) {
  if (!playDate) return null;

  const bookings = await supabaseFetch(
    `/rest/v1/public_bookings?select=court,start_time,duration_hours&booking_date=eq.${encodeURIComponent(playDate)}`
  );

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

  const maxSlots = availableCourts.length * PLAYERS_PER_COURT;

  const registrations = await supabaseFetch(
    `/rest/v1/public_open_play?select=id&play_date=eq.${encodeURIComponent(playDate)}`
  );
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
      infoDiv.innerHTML = `<div style="background:#ffebee;padding:12px;border-radius:8px;border-left:4px solid #ef4444;"><strong>❌ Open Play unavailable on ${formatDate(playDate)}</strong><p style="margin:6px 0 0 0;font-size:0.9em;">Both courts are booked during Open Play hours (5PM-12AM).</p></div>`;
      return;
    }

    const statusColor = cap.isFull ? "#ef4444" : (cap.spotsLeft < 5 ? "#ff9800" : "#4caf50");
    const statusBg = cap.isFull ? "#ffebee" : (cap.spotsLeft < 5 ? "#fff3e0" : "#e8f5e9");
    const courtLabel = cap.availableCourts.length === 2
      ? "🏓 2 Courts (both available)"
      : `🏓 1 Court (Court ${cap.availableCourts[0]})`;

    infoDiv.innerHTML = `<div style="background:${statusBg};padding:12px;border-radius:8px;border-left:4px solid ${statusColor};"><strong>Open Play on ${formatDate(playDate)} (5PM - 12AM)</strong><p style="margin:6px 0;font-size:0.95em;">${courtLabel}</p><p style="margin:6px 0;font-size:0.95em;"><strong>${cap.currentCount}/${cap.maxSlots}</strong> slots taken ${cap.isFull ? "— <strong>FULL</strong>" : `— <strong>${cap.spotsLeft}</strong> slots left`}</p></div>`;
  } catch (error) {
    console.error("Open play info error:", error);
    infoDiv.innerHTML = "";
  }
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

    const existing = await supabaseFetch(
      `/rest/v1/public_bookings?select=start_time,duration_hours,customer_name&booking_date=eq.${encodeURIComponent(bookingDate)}&court=eq.${encodeURIComponent(court)}`
    );

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

// ====================
// LOAD BOOKINGS (WITH PRICE BADGE)
// ====================

async function loadBookings() {
  const container = document.getElementById("bookingsList");
  if (!container) return;

  try {
    const rows = await supabaseFetch("/rest/v1/public_bookings?select=*&order=booking_date.asc,start_time.asc");
    const today = new Date(); today.setHours(0,0,0,0);
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const filtered = (rows || []).filter(r => r.booking_date && r.booking_date >= cutoffStr);

    if (filtered.length === 0) { container.innerHTML = "<p>No court bookings yet.</p>"; return; }

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
              <div style="padding:6px 14px;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;border-radius:20px;font-weight:700;font-size:0.95em;white-space:nowrap;">
                ₱${Number(displayPrice).toLocaleString()}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `).join("");
  } catch (error) {
    console.error("Bookings error:", error);
    container.innerHTML = "<p>Unable to load bookings right now.</p>";
  }
}

// ====================
// LOAD OPEN PLAY (WITH PRICE BADGE)
// ====================

async function loadOpenPlay() {
  const container = document.getElementById("openPlayList");
  if (!container) return;

  try {
    const rows = await supabaseFetch("/rest/v1/public_open_play?select=*&order=play_date.asc,play_time.asc");
    const today = new Date(); today.setHours(0,0,0,0);
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().split("T")[0];
    const filtered = (rows || []).filter(r => r.play_date && r.play_date >= cutoffStr);

    if (filtered.length === 0) { container.innerHTML = "<p>No Open Play registrations yet.</p>"; return; }

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
            <div style="padding:6px 14px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border-radius:20px;font-weight:700;font-size:0.95em;white-space:nowrap;">
              ₱${OPEN_PLAY_FEE}
            </div>
          </div>
        `).join("")}
      </div>
    `;
    }).join("");
  } catch (error) {
    console.error("Open Play error:", error);
    container.innerHTML = "<p>Unable to load Open Play right now.</p>";
  }
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
    const existing = await supabaseFetch(`/rest/v1/public_bookings?select=booking_date,start_time,court,duration_hours,customer_name&booking_date=eq.${encodeURIComponent(bookingDate)}&court=eq.${encodeURIComponent(court)}`);

    const conflictingBooking = (existing || []).find(booking => bookingOverlaps(bookingTime, duration, booking.start_time, booking.duration_hours));

    if (conflictingBooking) {
      const conflictStart = formatTime(conflictingBooking.start_time);
      const conflictEnd = addHoursToTime(conflictingBooking.start_time, conflictingBooking.duration_hours);
      const newEnd = addHoursToTime(bookingTime, duration);
      showResult(result, `❌ BOOKING CONFLICT! Court ${court} on ${formatDate(bookingDate)} is already booked from ${conflictStart} to ${conflictEnd}. Your requested time (${formatTime(bookingTime)} to ${newEnd}) overlaps.`, false);
      alert(`⚠️ BOOKING CONFLICT!\n\nCourt ${court} on ${formatDate(bookingDate)}\n\nAlready reserved: ${conflictStart} - ${conflictEnd}\nYour requested: ${formatTime(bookingTime)} - ${newEnd}\n\nPlease choose a different time or court.`);
      return;
    }

    const priceCalc = calculateBookingPrice(bookingTime, duration);
    const cancellationCode = generateCancelCode();

    await supabaseFetch("/rest/v1/bookings", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        customer_name: name,
        mobile,
        booking_date: bookingDate,
        start_time: bookingTime,
        court,
        duration_hours: duration,
        cancellation_code: cancellationCode,
        price: priceCalc.total,
        hourly_rate: priceCalc.rate
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
      alert(`⚠️ OPEN PLAY UNAVAILABLE\n\n${formatDate(playDate)}\n\nBoth courts are booked during Open Play hours (5PM-12AM).`);
      return;
    }

    if (cap.isFull) {
      showResult(result, `❌ Open Play is FULL on ${formatDate(playDate)}. ${cap.currentCount}/${cap.maxSlots} slots taken.`, false);
      alert(`⚠️ OPEN PLAY FULL\n\n${formatDate(playDate)}\n\n${cap.currentCount}/${cap.maxSlots} slots taken.`);
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
    showResult(result, `✅ Thank you, ${name}! Open Play confirmed for ${formatDate(playDate)} (5PM-12AM). Fee: ₱${OPEN_PLAY_FEE}. Cancellation code: ${cancellationCode}.\n\n📊 Slots: ${newCount}/${cap.maxSlots} taken.`, true);

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

// END OF PART 1
// ====================
// CLUB CHAT (TEXT + EMOJI ONLY)
// ====================

async function loadChatMessages() {
  const container = document.getElementById("chatMessages");
  if (!container) return;

  try {
    const rows = await supabaseFetch(
      "/rest/v1/chat_messages?select=*&order=created_at.asc&limit=100"
    );

    if (!rows || rows.length === 0) {
      container.innerHTML = "<p style='text-align:center;color:#aaa;'>No messages yet today. Be the first to say hi! 👋</p>";
      return;
    }

    const currentScroll = container.scrollTop + container.clientHeight;
    const wasAtBottom = currentScroll >= container.scrollHeight - 50;

    container.innerHTML = rows.map(msg => {
      const time = new Date(msg.created_at).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit"
      });

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

    if (wasAtBottom) {
      container.scrollTop = container.scrollHeight;
    }
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

  if (!name) {
    alert("Please enter your name first.");
    nameInput?.focus();
    return;
  }

  if (!message) {
    alert("Please type a message.");
    return;
  }

  if (message.length > 500) {
    alert("Message is too long. Maximum is 500 characters.");
    return;
  }

  try {
    localStorage.setItem("zinja_chat_name", name);
  } catch {}

  try {
    const sendBtn = document.getElementById("sendChatBtn");
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = "...";
    }

    await supabaseFetch("/rest/v1/chat_messages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        player_name: name,
        message: message
      })
    });

    messageInput.value = "";
    messageInput.focus();

    await loadChatMessages();

    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send";
    }
  } catch (error) {
    console.error("Send chat error:", error);
    alert("Failed to send message: " + error.message);

    const sendBtn = document.getElementById("sendChatBtn");
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = "Send";
    }
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

  setInterval(loadChatMessages, 5000);
}

// ====================
// MEDIA UPLOAD & GALLERY (IPHONE-STYLE ALBUM)
// ====================

let currentOpenAlbum = null;
let allMediaCache = [];

async function uploadMedia(file, album = "General") {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File is too large (${(file.size/1024/1024).toFixed(1)}MB). Maximum is 50MB.`);
  }
  const ext = file.name.split(".").pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
  const filePath = `uploads/${fileName}`;

  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${MEDIA_BUCKET}/${filePath}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": file.type,
      "x-upsert": "false"
    },
    body: file
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err);
  }

  await supabaseFetch("/rest/v1/media", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      file_name: fileName,
      file_path: filePath,
      file_type: file.type.startsWith("video") ? "video" : "image",
      file_size: file.size,
      album: album
    })
  });

  return filePath;
}

async function loadMedia() {
  const albumGrid = document.getElementById("albumGrid");
  if (!albumGrid) return;

  try {
    const rows = await supabaseFetch("/rest/v1/media?select=*&order=created_at.desc&limit=200");
    allMediaCache = rows || [];
    if (currentOpenAlbum) {
      openAlbum(currentOpenAlbum);
    } else {
      renderAlbumView();
    }
  } catch (error) {
    console.error("Media load error:", error);
    albumGrid.innerHTML = "<p style='grid-column:1/-1;'>Unable to load media.</p>";
  }
}

function renderAlbumView() {
  const albumView = document.getElementById("albumView");
  const albumDetailView = document.getElementById("albumDetailView");
  const albumGrid = document.getElementById("albumGrid");
  if (!albumView || !albumGrid) return;

  currentOpenAlbum = null;
  albumView.style.display = "block";
  if (albumDetailView) albumDetailView.style.display = "none";

  if (!allMediaCache.length) {
    albumGrid.innerHTML = "<p style='grid-column:1/-1;text-align:center;padding:40px;color:#888;'>No photos yet. Be the first to share! 📸</p>";
    return;
  }

  const albums = {};
  allMediaCache.forEach(m => {
    const albumName = m.album || "General";
    if (!albums[albumName]) albums[albumName] = [];
    albums[albumName].push(m);
  });

  const totalCount = allMediaCache.length;
  const totalLabel = `${totalCount} item${totalCount === 1 ? "" : "s"}`;

  let html = "";

  // All Photos card (cover = most recent)
  if (allMediaCache[0]) {
    const cover = allMediaCache[0];
    const coverUrl = `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${cover.file_path}`;
    const coverIsVideo = cover.file_type === "video";
    html += `
      <div class="album-card" onclick="openAlbum('__all__')" style="cursor:pointer;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.08);transition:all 0.2s;">
        <div style="position:relative;aspect-ratio:1;background:#f0f0f0;overflow:hidden;">
          ${coverIsVideo
            ? `<video src="${coverUrl}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video>`
            : `<img src="${coverUrl}" style="width:100%;height:100%;object-fit:cover;">`}
          <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(0,0,0,0.75),transparent);padding:35px 12px 12px;color:#fff;">
            <div style="font-weight:600;font-size:1em;">📷 All Photos</div>
            <div style="font-size:0.8em;opacity:0.9;">${totalLabel}</div>
          </div>
        </div>
      </div>
    `;
  }

  // Album cards
  Object.keys(albums).sort().forEach(name => {
    const items = albums[name];
    const cover = items[0];
    const coverUrl = `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${cover.file_path}`;
    const coverIsVideo = cover.file_type === "video";
    const count = items.length;
    const countLabel = `${count} item${count === 1 ? "" : "s"}`;
    const safeName = name.replace(/'/g, "\\'");

    html += `
      <div class="album-card" onclick="openAlbum('${safeName}')" style="cursor:pointer;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.08);transition:all 0.2s;">
        <div style="position:relative;aspect-ratio:1;background:#f0f0f0;overflow:hidden;">
          ${coverIsVideo
            ? `<video src="${coverUrl}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video>`
            : `<img src="${coverUrl}" style="width:100%;height:100%;object-fit:cover;">`}
          <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,rgba(0,0,0,0.75),transparent);padding:35px 12px 12px;color:#fff;">
            <div style="font-weight:600;font-size:1em;">📁 ${escapeHtml(name)}</div>
            <div style="font-size:0.8em;opacity:0.9;">${countLabel}</div>
          </div>
        </div>
      </div>
    `;
  });

  albumGrid.innerHTML = html;
}

function openAlbum(albumName) {
  const albumView = document.getElementById("albumView");
  const albumDetailView = document.getElementById("albumDetailView");
  const mediaGallery = document.getElementById("mediaGallery");
  const title = document.getElementById("currentAlbumTitle");
  if (!albumView || !mediaGallery) return;

  currentOpenAlbum = albumName;
  albumView.style.display = "none";
  albumDetailView.style.display = "block";

  let items, displayName;
  if (albumName === "__all__") {
    items = allMediaCache;
    displayName = "📷 All Photos";
  } else {
    items = allMediaCache.filter(m => (m.album || "General") === albumName);
    displayName = `📁 ${albumName}`;
  }

  const count = items.length;
  title.textContent = `${displayName} · ${count} item${count === 1 ? "" : "s"}`;

  if (!items.length) {
    mediaGallery.innerHTML = "<p style='grid-column:1/-1;text-align:center;padding:40px;color:#888;'>No media in this album.</p>";
    return;
  }

  mediaGallery.innerHTML = items.map(m => {
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${m.file_path}`;
    const isVideo = m.file_type === "video";
    const sizeMB = (m.file_size / 1024 / 1024).toFixed(1);
    return `<div class="media-card" style="border:1px solid #ddd;border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
      ${isVideo
        ? `<video src="${publicUrl}" controls preload="metadata" style="width:100%;height:200px;object-fit:cover;background:#000;"></video>`
        : `<img src="${publicUrl}" style="width:100%;height:200px;object-fit:cover;" loading="lazy" alt="Highlight">`}
      <div style="padding:10px;">
        <div style="font-size:0.8em;color:#888;margin-bottom:8px;">${isVideo ? "🎥 Video" : "📷 Photo"} · ${sizeMB}MB</div>
        <button onclick="downloadViaAndroid('${publicUrl}', '${m.file_name}')" style="display:inline-block;margin-right:8px;padding:6px 12px;background:#7c3aed;color:white;text-decoration:none;border:none;border-radius:6px;font-size:0.85em;cursor:pointer;">⬇ Download</button>
        <button onclick="deleteMedia('${m.file_path}', ${m.id})" style="padding:6px 12px;background:#ef4444;color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.85em;">🗑 Delete</button>
      </div>
    </div>`;
  }).join("");
}

function showAlbumsView() {
  renderAlbumView();
}

// Legacy compatibility
function filterByAlbum(album) {
  if (album === "all") openAlbum("__all__");
  else openAlbum(album);
}

async function deleteMedia(filePath, id) {
  if (!confirm("Are you sure you want to delete this?")) return;
  try {
    await fetch(`${SUPABASE_URL}/storage/v1/object/${MEDIA_BUCKET}/${filePath}`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    });
    await supabaseFetch(`/rest/v1/media?id=eq.${id}`, { method: "DELETE" });
    await loadMedia();
  } catch (error) {
    alert("Failed to delete: " + error.message);
  }
}

function setupMediaUpload() {
  const uploadBtn = document.getElementById("uploadBtn");
  const fileInput = document.getElementById("mediaUpload");
  const result = document.getElementById("uploadResult");
  if (!uploadBtn || !fileInput) return;

  uploadBtn.addEventListener("click", async () => {
    const files = Array.from(fileInput.files);
    if (!files.length) {
      showResult(result, "Please select at least one file.", false);
      return;
    }

    const album = document.getElementById("mediaAlbum")?.value || "General";
    let successCount = 0;
    let failCount = 0;

    try {
      uploadBtn.disabled = true;
      showResult(result, `⏳ Uploading ${files.length} file(s) to "${album}" album...`, true);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          showResult(result, `⏳ Uploading ${i + 1}/${files.length}: ${file.name} (${(file.size/1024/1024).toFixed(1)}MB)`, true);
          await uploadMedia(file, album);
          successCount++;
        } catch (err) {
          console.error(`Failed to upload ${file.name}:`, err);
          failCount++;
        }
      }

      if (failCount === 0) {
        showResult(result, `✅ Upload successful! ${successCount} file(s) uploaded to "${album}". 🎉`, true);
      } else {
        showResult(result, `⚠️ ${successCount} uploaded, ${failCount} failed.`, false);
      }

      fileInput.value = "";
      await loadMedia();
    } catch (error) {
      console.error("Upload error:", error);
      showResult(result, `Upload failed: ${error.message}`, false);
    } finally {
      uploadBtn.disabled = false;
    }
  });
}

// ====================
// START
// ====================

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
  setupMediaUpload();
  loadMedia();

  updateLiveClosureStatus();
  setInterval(updateLiveClosureStatus, 60000);

  setInterval(() => {
    loadBookings();
    loadOpenPlay();
  }, POLL_MS);
});
