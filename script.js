const SUPABASE_URL = "https://kbafnegagyiwztyfmxpr.supabase.co";
const SUPABASE_KEY = "sb_publishable_djA6ivm66-hfO3WLub527w_AbOa8rvc";

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json"
};

const POLL_MS = 30000;

// ====================
// HELPERS
// ====================

function generateCancelCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
    headers: {
      ...headers,
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const detail =
      typeof data === "string"
        ? data
        : data?.message ||
          data?.hint ||
          data?.details ||
          `HTTP ${response.status}`;

    throw new Error(detail);
  }

  return data;
}

function timeToMinutes(time) {
  if (!time) return 0;

  const parts = String(time).split(":");
  const hour = Number(parts[0]) || 0;
  const minute = Number(parts[1]) || 0;

  return hour * 60 + minute;
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
    const key =
      type === "booking"
        ? "zinja_last_booking"
        : "zinja_last_open_play";

    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.warn("Could not save cancellation info:", error);
  }
}

function getSavedCancellation(type) {
  try {
    const key =
      type === "booking"
        ? "zinja_last_booking"
        : "zinja_last_open_play";

    const value = localStorage.getItem(key);

    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

// ====================
// LOAD BOOKINGS
// ====================

async function loadBookings() {
  const container =
    document.getElementById("bookingsList") ||
    document.getElementById("bookingList") ||
    document.querySelector("[data-bookings-list]");

  if (!container) return;

  try {
    const rows = await supabaseFetch(
      "/rest/v1/public_bookings?select=*&order=booking_date.asc,booking_time.asc"
    );

    if (!rows || rows.length === 0) {
      container.innerHTML = "<p>No court bookings yet.</p>";
      return;
    }

    container.innerHTML = rows
      .map(
        (booking) => `
      <div class="booking-item">
        <strong>${escapeHtml(booking.name)}</strong>
        <div>
          ${escapeHtml(booking.booking_date)}
          · ${formatTime(booking.booking_time)}
          · Court ${escapeHtml(booking.court)}
          · ${escapeHtml(booking.duration)} hour(s)
        </div>
      </div>
    `
      )
      .join("");
  } catch (error) {
    console.error("Bookings error:", error);

    container.innerHTML =
      "<p>Unable to load bookings right now. Please try again later.</p>";
  }
}

// ====================
// LOAD OPEN PLAY
// ====================

async function loadOpenPlay() {
  const container =
    document.getElementById("openPlayList") ||
    document.getElementById("playList") ||
    document.querySelector("[data-open-play-list]");

  if (!container) return;

  try {
    const rows = await supabaseFetch(
      "/rest/v1/public_open_play?select=*&order=play_date.asc,play_time.asc"
    );

    if (!rows || rows.length === 0) {
      container.innerHTML =
        "<p>No Open Play registrations yet.</p>";

      return;
    }

    container.innerHTML = rows
      .map(
        (player) => `
      <div class="open-play-item">
        <strong>${escapeHtml(player.name)}</strong>
        <div>
          ${escapeHtml(player.play_date)}
          · ${formatTime(player.play_time)}
          · ${escapeHtml(player.skill_level || "Not specified")}
        </div>
      </div>
    `
      )
      .join("");
  } catch (error) {
    console.error("Open Play error:", error);

    container.innerHTML =
      "<p>Unable to load Open Play registrations right now.</p>";
  }
}

// ====================
// COURT BOOKING
// ====================

async function handleBookingSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const result = document.getElementById("bookingResult");

  const name =
    document.getElementById("name")?.value.trim();

  const mobile =
    document.getElementById("phone")?.value.trim();

  const bookingDate =
    document.getElementById("date")?.value;

  const bookingTime =
    document.getElementById("time")?.value;

  const court =
    Number(document.getElementById("court")?.value);

  const duration =
    Number(document.getElementById("duration")?.value);

  if (
    !name ||
    !mobile ||
    !bookingDate ||
    !bookingTime ||
    !court ||
    !duration
  ) {
    showResult(
      result,
      "Please complete all booking fields.",
      false
    );

    return;
  }

  if (![1, 2].includes(court)) {
    showResult(
      result,
      "Please select Court 1 or Court 2.",
      false
    );

    return;
  }

  if (![1, 2].includes(duration)) {
    showResult(
      result,
      "Please select a valid duration.",
      false
    );

    return;
  }

  try {
    showResult(
      result,
      "Checking court availability...",
      true
    );

    const existing = await supabaseFetch(
      `/rest/v1/public_bookings?select=booking_date,booking_time,court,duration&booking_date=eq.${encodeURIComponent(
        bookingDate
      )}&court=eq.${encodeURIComponent(court)}`
    );

    const conflict = (existing || []).some((booking) =>
      bookingOverlaps(
        bookingTime,
        duration,
        booking.booking_time,
        booking.duration
      )
    );

    if (conflict) {
      showResult(
        result,
        "Sorry, that court and time are already booked. Please choose another time or court.",
        false
      );

      return;
    }

    const cancellationCode =
      generateCancelCode();

    await supabaseFetch(
      "/rest/v1/bookings",
      {
        method: "POST",

        headers: {
          Prefer: "return=representation"
        },

        body: JSON.stringify({
          customer_name: name,
          mobile: mobile,
          booking_date: bookingDate,
          start_time: bookingTime,
          court: court,
          duration_hours: duration,
          cancellation_code: cancellationCode
        })
      }
    );

    saveCancellation(
      "booking",
      {
        mobile,
        code: cancellationCode
      }
    );

    showResult(
      result,
      `Booking confirmed! Court ${court}, ${bookingDate} at ${formatTime(
        bookingTime
      )}. Cancellation code: ${cancellationCode}. Please save this code.`,
      true
    );

    form.reset();

    await loadBookings();

  } catch (error) {
    console.error(
      "Booking error:",
      error
    );

    showResult(
      result,
      `Something went wrong. ${
        error.message || "Please try again."
      }`,
      false
    );
  }
}

// ====================
// OPEN PLAY
// ====================

async function handleOpenPlaySubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const result =
    document.getElementById("playResult");

  const name =
    document.getElementById("player")?.value.trim();

  const mobile =
    document.getElementById("playerPhone")?.value.trim();

  const playDate =
    document.getElementById("playDate")?.value;

  const playTime =
    document.getElementById("playTime")?.value;

  const skillLevel =
    document.getElementById("level")?.value;

  if (
    !name ||
    !mobile ||
    !playDate ||
    !playTime ||
    !skillLevel
  ) {
    showResult(
      result,
      "Please complete all Open Play fields.",
      false
    );

    return;
  }

  try {
    showResult(
      result,
      "Submitting your Open Play registration...",
      true
    );

    const cancellationCode =
      generateCancelCode();

    await supabaseFetch(
      "/rest/v1/open_play",
      {
        method: "POST",

        headers: {
          Prefer: "return=representation"
        },

        body: JSON.stringify({
          player_name: name,
          mobile: mobile,
          play_date: playDate,
          play_time: playTime,
          skill_level: skillLevel,
          cancellation_code: cancellationCode
        })
      }
    );

    saveCancellation(
      "open_play",
      {
        mobile,
        code: cancellationCode
      }
    );

    showResult(
      result,
      `Open Play registration confirmed! ${playDate} at ${formatTime(
        playTime
      )}. Cancellation code: ${cancellationCode}. Please save this code.`,
      true
    );

    form.reset();

    await loadOpenPlay();

  } catch (error) {
    console.error(
      "Open Play error:",
      error
    );

    showResult(
      result,
      `Something went wrong. ${
        error.message || "Please try again."
      }`,
      false
    );
  }
}

// ====================
// CANCELLATION BOXES
// ====================

function createCancellationBoxes() {
  const bookingForm =
    document.getElementById("bookingForm");

  const playForm =
    document.getElementById("playForm");

  if (
    bookingForm &&
    !document.getElementById("cancelBookingBox")
  ) {
    bookingForm.insertAdjacentHTML(
      "afterend",
      `
      <div
        id="cancelBookingBox"
        class="cancellation-box"
        style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:12px;"
      >
        <h3>Cancel My Court Booking</h3>

        <p>
          Enter the mobile number and cancellation code
          you received when booking.
        </p>

        <input
          id="cancelBookingMobile"
          type="tel"
          placeholder="Mobile number"
          style="display:block;width:100%;margin:8px 0;padding:10px;"
        >

        <input
          id="cancelBookingCode"
          type="text"
          placeholder="Cancellation code"
          maxlength="8"
          style="display:block;width:100%;margin:8px 0;padding:10px;text-transform:uppercase;"
        >

        <button
          type="button"
          id="cancelBookingButton"
        >
          Cancel Booking
        </button>

        <div id="cancelBookingResult"></div>
      </div>
      `
    );

    document
      .getElementById(
        "cancelBookingButton"
      )
      ?.addEventListener(
        "click",
        cancelBooking
      );

    const saved =
      getSavedCancellation("booking");

    if (saved) {
      const mobileInput =
        document.getElementById(
          "cancelBookingMobile"
        );

      const codeInput =
        document.getElementById(
          "cancelBookingCode"
        );

      if (mobileInput)
        mobileInput.value =
          saved.mobile || "";

      if (codeInput)
        codeInput.value =
          saved.code || "";
    }
  }

  if (
    playForm &&
    !document.getElementById("cancelOpenPlayBox")
  ) {
    playForm.insertAdjacentHTML(
      "afterend",
      `
      <div
        id="cancelOpenPlayBox"
        class="cancellation-box"
        style="margin-top:20px;padding:16px;border:1px solid #ddd;border-radius:12px;"
      >
        <h3>Cancel My Open Play Registration</h3>

        <p>
          Enter the mobile number and cancellation code
          you received when joining.
        </p>

        <input
          id="cancelOpenPlayMobile"
          type="tel"
          placeholder="Mobile number"
          style="display:block;width:100%;margin:8px 0;padding:10px;"
        >

        <input
          id="cancelOpenPlayCode"
          type="text"
          placeholder="Cancellation code"
          maxlength="8"
          style="display:block;width:100%;margin:8px 0;padding:10px;text-transform:uppercase;"
        >

        <button
          type="button"
          id="cancelOpenPlayButton"
        >
          Cancel Registration
        </button>

        <div id="cancelOpenPlayResult"></div>
      </div>
      `
    );

    document
      .getElementById(
        "cancelOpenPlayButton"
      )
      ?.addEventListener(
        "click",
        cancelOpenPlay
      );

    const saved =
      getSavedCancellation("open_play");

    if (saved) {
      const mobileInput =
        document.getElementById(
          "cancelOpenPlayMobile"
        );

      const codeInput =
        document.getElementById(
          "cancelOpenPlayCode"
        );

      if (mobileInput)
        mobileInput.value =
          saved.mobile || "";

      if (codeInput)
        codeInput.value =
          saved.code || "";
    }
  }
}

// ====================
// CANCEL BOOKING
// ====================

async function cancelBooking() {
  const mobile =
    document
      .getElementById(
        "cancelBookingMobile"
      )
      ?.value.trim();

  const code =
    document
      .getElementById(
        "cancelBookingCode"
      )
      ?.value.trim()
      .toUpperCase();

  const result =
    document.getElementById(
      "cancelBookingResult"
    );

  if (!mobile || !code) {
    showResult(
      result,
      "Please enter your mobile number and cancellation code.",
      false
    );

    return;
  }

  try {
    showResult(
      result,
      "Cancelling booking...",
      true
    );

    const data =
      await supabaseFetch(
        "/rest/v1/rpc/cancel_booking",
        {
          method: "POST",

          body: JSON.stringify({
            p_mobile: mobile,
            p_code: code
          })
        }
      );

    if (data === true) {
      try {
        localStorage.removeItem(
          "zinja_last_booking"
        );
      } catch {}

      showResult(
        result,
        "Your court booking has been cancelled.",
        true
      );

      await loadBookings();

    } else {
      showResult(
        result,
        "No matching booking was found. Please check your mobile number and cancellation code.",
        false
      );
    }

  } catch (error) {
    console.error(
      "Cancel booking error:",
      error
    );

    showResult(
      result,
      `Cancellation failed. ${
        error.message || "Please try again."
      }`,
      false
    );
  }
}

// ====================
// CANCEL OPEN PLAY
// ====================

async function cancelOpenPlay() {
  const mobile =
    document
      .getElementById(
        "cancelOpenPlayMobile"
      )
      ?.value.trim();

  const code =
    document
      .getElementById(
        "cancelOpenPlayCode"
      )
      ?.value.trim()
      .toUpperCase();

  const result =
    document.getElementById(
      "cancelOpenPlayResult"
    );

  if (!mobile || !code) {
    showResult(
      result,
      "Please enter your mobile number and cancellation code.",
      false
    );

    return;
  }

  try {
    showResult(
      result,
      "Cancelling registration...",
      true
    );

    const data =
      await supabaseFetch(
        "/rest/v1/rpc/cancel_open_play",
        {
          method: "POST",

          body: JSON.stringify({
            p_mobile: mobile,
            p_code: code
          })
        }
      );

    if (data === true) {
      try {
        localStorage.removeItem(
          "zinja_last_open_play"
        );
      } catch {}

      showResult(
        result,
        "Your Open Play registration has been cancelled.",
        true
      );

      await loadOpenPlay();

    } else {
      showResult(
        result,
        "No matching Open Play registration was found. Please check your mobile number and cancellation code.",
        false
      );
    }

  } catch (error) {
    console.error(
      "Cancel Open Play error:",
      error
    );

    showResult(
      result,
      `Cancellation failed. ${
        error.message || "Please try again."
      }`,
      false
    );
  }
}

// ====================
// START
// ====================

document.addEventListener(
  "DOMContentLoaded",
  () => {
    const bookingForm =
      document.getElementById(
        "bookingForm"
      );

    const playForm =
      document.getElementById(
        "playForm"
      );

    if (bookingForm) {
      bookingForm.addEventListener(
        "submit",
        handleBookingSubmit
      );
    }

    if (playForm) {
      playForm.addEventListener(
        "submit",
        handleOpenPlaySubmit
      );
    }

    createCancellationBoxes();

    loadBookings();

    loadOpenPlay();

    setInterval(() => {
      loadBookings();
      loadOpenPlay();
    }, POLL_MS);
  }
);
