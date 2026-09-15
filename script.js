const SUPABASE_URL = "https://kbafnegagyjwiztyfmxpr.supabase.co";

// IMPORTANT:
// Ilagay dito ang SUPABASE PUBLISHABLE KEY mo.
// HUWAG gamitin ang sb_secret_ key.
const SUPABASE_KEY = "sb_publishable_djA6ivm66-hfO3WLub527w_AbOa8rvc";

const headers = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json"
};// ===============================
// BASIC SETUP
// ===============================

const today = new Date().toISOString().slice(0, 10);

document.querySelectorAll('input[type="date"]').forEach(input => {
  input.min = today;
});

const bookingForm = document.getElementById("bookingForm");
const bookingResult = document.getElementById("bookingResult");

const playForm = document.getElementById("playForm");
const playResult = document.getElementById("playResult");


// ===============================
// GENERATE CANCELLATION CODE
// ===============================

function generateCancelCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}


// ===============================
// FORMAT TIME
// ===============================

function formatTime(time) {
  if (!time) return "";

  const parts = time.split(":");
  let hour = Number(parts[0]);
  const minute = parts[1];

  const ampm = hour >= 12 ? "PM" : "AM";

  hour = hour % 12;
  if (hour === 0) hour = 12;

  return `${hour}:${minute} ${ampm}`;
}


// ===============================
// ESCAPE HTML
// ===============================

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


// ===============================
// LIVE BOOKINGS
// ===============================

async function loadBookings() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/public_bookings?select=*&order=booking_date.asc,booking_time.asc`,
      { headers }
    );

    if (!response.ok) {
      throw new Error("Unable to load bookings.");
    }

    const bookings = await response.json();

    let container = document.getElementById("liveBookings");

    if (!container) {
      container = document.createElement("div");
      container.id = "liveBookings";
      bookingForm.parentElement.appendChild(container);
    }

    if (!bookings.length) {
      container.innerHTML = `
        <div class="card">
          <h3>📅 Current Bookings</h3>
          <p>No bookings yet.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="card">
        <h3>📅 Current Court Bookings</h3>

        ${bookings.map(b => `
          <div class="live-entry">
            <strong>${escapeHtml(b.name)}</strong><br>
            📅 ${escapeHtml(b.booking_date)}<br>
            🕐 ${formatTime(b.booking_time)}<br>
            🎾 Court ${escapeHtml(b.court)}<br>
            ⏱️ ${escapeHtml(b.duration)} hour(s)
          </div>
        `).join("")}
      </div>
    `;

  } catch (error) {
    console.error("Bookings error:", error);
  }
}


// ===============================
// LIVE OPEN PLAY
// ===============================

async function loadOpenPlay() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/public_open_play?select=*&order=play_date.asc,play_time.asc`,
      { headers }
    );

    if (!response.ok) {
      throw new Error("Unable to load Open Play.");
    }

    const players = await response.json();

    let container = document.getElementById("liveOpenPlay");

    if (!container) {
      container = document.createElement("div");
      container.id = "liveOpenPlay";
      playForm.parentElement.appendChild(container);
    }

    if (!players.length) {
      container.innerHTML = `
        <div class="card">
          <h3>🏓 Open Play Players</h3>
          <p>No players registered yet.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="card">
        <h3>🏓 Open Play Players</h3>

        ${players.map(p => `
          <div class="live-entry">
            <strong>${escapeHtml(p.name)}</strong><br>
            📅 ${escapeHtml(p.play_date)}<br>
            🕐 ${formatTime(p.play_time)}<br>
            🎯 ${escapeHtml(p.skill_level)}
          </div>
        `).join("")}
      </div>
    `;

  } catch (error) {
    console.error("Open Play error:", error);
  }
}


// ===============================
// BOOK A COURT
// ===============================

bookingForm.onsubmit = async function(e) {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const mobile = document.getElementById("phone").value.trim();
  const bookingDate = document.getElementById("date").value;
  const bookingTime = document.getElementById("time").value;
  const court = Number(document.getElementById("court").value);
  const duration = Number(document.getElementById("duration").value);

  const cancellationCode = generateCancelCode();

  bookingResult.innerHTML = "⏳ Saving your booking...";

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/bookings`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Prefer": "return=representation"
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

    const result = await response.json();

    if (!response.ok) {
      console.error(result);

      bookingResult.innerHTML = `
        <div class="error">
          ❌ Booking failed.<br><br>
          The selected court and time may already be booked.
        </div>
      `;

      return;
    }

    bookingResult.innerHTML = `
      <div class="success">
        <h3>✅ Booking Confirmed!</h3>

        <p>
          Thank you, <strong>${escapeHtml(name)}</strong>!
        </p>

        <p>
          🎾 Court ${court}<br>
          📅 ${escapeHtml(bookingDate)}<br>
          🕐 ${formatTime(bookingTime)}<br>
          ⏱️ ${duration} hour(s)
        </p>

        <hr>

        <p>🔐 <strong>Your Cancellation Code:</strong></p>

        <h2>${cancellationCode}</h2>

        <p>
          ⚠️ Save this code. You will need your mobile number
          and this code if you want to cancel your booking.
        </p>
      </div>
    `;

    bookingForm.reset();

    document.querySelectorAll('input[type="date"]').forEach(input => {
      input.min = today;
    });

    loadBookings();

  } catch (error) {
    console.error(error);

    bookingResult.innerHTML = `
      <div class="error">
        ❌ Something went wrong. Please try again.
      </div>
    `;
  }
};


// ===============================
// JOIN OPEN PLAY
// ===============================

playForm.onsubmit = async function(e) {
  e.preventDefault();

  const name = document.getElementById("player").value.trim();
  const mobile = document.getElementById("playerPhone").value.trim();
  const playDate = document.getElementById("playDate").value;
  const playTime = document.getElementById("playTime").value;
  const skillLevel = document.getElementById("level").value;

  const cancellationCode = generateCancelCode();

  playResult.innerHTML = "⏳ Registering you...";

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/open_play`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Prefer": "return=representation"
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

    const result = await response.json();

    if (!response.ok) {
      console.error(result);

      playResult.innerHTML = `
        <div class="error">
          ❌ Open Play registration failed.
          Please try again.
        </div>
      `;

      return;
    }

    playResult.innerHTML = `
      <div class="success">
        <h3>✅ Open Play Registration Confirmed!</h3>

        <p>
          Welcome, <strong>${escapeHtml(name)}</strong>!
        </p>

        <p>
          📅 ${escapeHtml(playDate)}<br>
          🕐 ${formatTime(playTime)}<br>
          🎯 ${escapeHtml(skillLevel)}
        </p>

        <hr>

        <p>🔐 <strong>Your Cancellation Code:</strong></p>

        <h2>${cancellationCode}</h2>

        <p>
          ⚠️ Save this code. You will need your mobile number
          and this code if you want to cancel your registration.
        </p>
      </div>
    `;

    playForm.reset();

    document.querySelectorAll('input[type="date"]').forEach(input => {
      input.min = today;
    });

    loadOpenPlay();

  } catch (error) {
    console.error(error);

    playResult.innerHTML = `
      <div class="error">
        ❌ Something went wrong. Please try again.
      </div>
    `;
  }
};


// ===============================
// CANCELLATION BOXES
// ===============================

function createCancellationBoxes() {

  if (!document.getElementById("cancelBookingBox")) {

    const box = document.createElement("div");

    box.id = "cancelBookingBox";

    box.innerHTML = `
      <div class="card">
        <h3>❌ Cancel My Court Booking</h3>

        <p>
          Enter the same mobile number and cancellation code
          you received when you booked.
        </p>

        <input
          id="cancelBookingMobile"
          type="text"
          placeholder="Mobile Number"
        >

        <input
          id="cancelBookingCode"
          type="text"
          placeholder="Cancellation Code"
          maxlength="6"
        >

        <button class="btn" id="cancelBookingBtn">
          Cancel My Booking
        </button>

        <div id="cancelBookingResult"></div>
      </div>
    `;

    bookingForm.parentElement.appendChild(box);

    document.getElementById("cancelBookingBtn").onclick =
      cancelBooking;
  }

  if (!document.getElementById("cancelOpenPlayBox")) {

    const box = document.createElement("div");

    box.id = "cancelOpenPlayBox";

    box.innerHTML = `
      <div class="card">
        <h3>❌ Cancel My Open Play Registration</h3>

        <p>
          Enter the same mobile number and cancellation code
          you received when you registered.
        </p>

        <input
          id="cancelOpenPlayMobile"
          type="text"
          placeholder="Mobile Number"
        >

        <input
          id="cancelOpenPlayCode"
          type="text"
          placeholder="Cancellation Code"
          maxlength="6"
        >

        <button class="btn" id="cancelOpenPlayBtn">
          Cancel My Registration
        </button>

        <div id="cancelOpenPlayResult"></div>
      </div>
    `;

    playForm.parentElement.appendChild(box);

    document.getElementById("cancelOpenPlayBtn").onclick =
      cancelOpenPlay;
  }
}


// ===============================
// CANCEL BOOKING
// ===============================

async function cancelBooking() {

  const mobile =
    document.getElementById("cancelBookingMobile").value.trim();

  const code =
    document.getElementById("cancelBookingCode").value.trim().toUpperCase();

  const resultBox =
    document.getElementById("cancelBookingResult");

  if (!mobile || !code) {
    resultBox.innerHTML =
      "⚠️ Please enter your mobile number and cancellation code.";
    return;
  }

  resultBox.innerHTML = "⏳ Cancelling...";

  try {

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/cancel_booking`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_mobile: mobile,
          p_code: code
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error(result);

      resultBox.innerHTML =
        "❌ Unable to cancel booking.";
      return;
    }

    if (result === true) {

      resultBox.innerHTML =
        "✅ Your booking has been cancelled successfully.";

      document.getElementById("cancelBookingMobile").value = "";
      document.getElementById("cancelBookingCode").value = "";

      loadBookings();

    } else {

      resultBox.innerHTML =
        "❌ Booking not found. Check your mobile number and cancellation code.";
    }

  } catch (error) {

    console.error(error);

    resultBox.innerHTML =
      "❌ Something went wrong. Please try again.";
  }
}


// ===============================
// CANCEL OPEN PLAY
// ===============================

async function cancelOpenPlay() {

  const mobile =
    document.getElementById("cancelOpenPlayMobile").value.trim();

  const code =
    document.getElementById("cancelOpenPlayCode").value.trim().toUpperCase();

  const resultBox =
    document.getElementById("cancelOpenPlayResult");

  if (!mobile || !code) {
    resultBox.innerHTML =
      "⚠️ Please enter your mobile number and cancellation code.";
    return;
  }

  resultBox.innerHTML = "⏳ Cancelling...";

  try {

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/cancel_open_play`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_mobile: mobile,
          p_code: code
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error(result);

      resultBox.innerHTML =
        "❌ Unable to cancel registration.";
      return;
    }

    if (result === true) {

      resultBox.innerHTML =
        "✅ Your Open Play registration has been cancelled.";

      document.getElementById("cancelOpenPlayMobile").value = "";
      document.getElementById("cancelOpenPlayCode").value = "";

      loadOpenPlay();

    } else {

      resultBox.innerHTML =
        "❌ Registration not found. Check your mobile number and cancellation code.";
    }

  } catch (error) {

    console.error(error);

    resultBox.innerHTML =
      "❌ Something went wrong. Please try again.";
  }
}


// ===============================
// START
// ===============================

createCancellationBoxes();

loadBookings();
loadOpenPlay();


// Refresh live lists every 30 seconds

setInterval(() => {
  loadBookings();
  loadOpenPlay();
}, 30000);
