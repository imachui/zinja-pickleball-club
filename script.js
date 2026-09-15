const SUPABASE_URL = "https://kbafnegagyjwiztyfmxpr.supabase.co";
const SUPABASE_KEY = "sb_publishable_djA6ivm66-hfO3WLub527w_AbOa8rvc

const headers = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json"
};

const today = new Date().toISOString().slice(0, 10);

document.querySelectorAll('input[type="date"]').forEach(x => {
  x.min = today;
});

const bookingForm = document.getElementById("bookingForm");
const bookingResult = document.getElementById("bookingResult");

const playForm = document.getElementById("playForm");
const playResult = document.getElementById("playResult");

async function loadBookings() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/public_bookings?select=*&order=booking_date.asc,booking_time.asc`,
      {
        headers: headers
      }
    );

    if (!response.ok) {
      throw new Error("Unable to load bookings");
    }

    const bookings = await response.json();

    let section = document.getElementById("liveBookings");

    if (!section) {
      section = document.createElement("div");
      section.id = "liveBookings";
      section.style.marginTop = "25px";
      bookingForm.parentElement.appendChild(section);
    }

    section.innerHTML = `
      <div style="background:#ffffff;padding:20px;border-radius:18px;">
        <h3>📅 Current Court Bookings</h3>
        ${
          bookings.length === 0
            ? "<p>No court bookings yet.</p>"
            : bookings.map(b => `
              <div style="padding:12px;margin:8px 0;background:#f3f6ff;border-radius:12px;">
                <strong>${escapeHtml(b.name)}</strong><br>
                📅 ${b.booking_date}
                ⏰ ${formatTime(b.booking_time)}<br>
                🏓 ${escapeHtml(b.court)}
                • ${b.duration} hour(s)
              </div>
            `).join("")
        }
      </div>
    `;
  } catch (error) {
    console.error(error);
  }
}

async function loadOpenPlay() {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/public_open_play?select=*&order=play_date.asc,play_time.asc`,
      {
        headers: headers
      }
    );

    if (!response.ok) {
      throw new Error("Unable to load open play");
    }

    const players = await response.json();

    let section = document.getElementById("liveOpenPlay");

    if (!section) {
      section = document.createElement("div");
      section.id = "liveOpenPlay";
      section.style.marginTop = "25px";
      playForm.parentElement.appendChild(section);
    }

    section.innerHTML = `
      <div style="background:#ffffff;padding:20px;border-radius:18px;">
        <h3>🏓 Open Play Players</h3>
        ${
          players.length === 0
            ? "<p>No players registered yet.</p>"
            : players.map(p => `
              <div style="padding:12px;margin:8px 0;background:#f3f6ff;border-radius:12px;">
                <strong>${escapeHtml(p.name)}</strong><br>
                📅 ${p.play_date}
                ⏰ ${formatTime(p.play_time)}<br>
                🎯 ${escapeHtml(p.skill_level)}
                • ₱50
              </div>
            `).join("")
        }
      </div>
    `;
  } catch (error) {
    console.error(error);
  }
}

if (bookingForm) {
  bookingForm.onsubmit = async e => {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const mobile = document.getElementById("mobile").value.trim();
    const bookingDate = document.getElementById("date").value;
    const bookingTime = document.getElementById("time").value;
    const court = document.getElementById("court").value;
    const duration = Number(document.getElementById("duration").value);

    const total = duration * 150;

    const booking = {
      name: name,
      mobile: mobile,
      booking_date: bookingDate,
      booking_time: bookingTime,
      court: court,
      duration: duration
    };

    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/bookings`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Prefer": "return=minimal"
          },
          body: JSON.stringify(booking)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      bookingResult.innerHTML = `
        <b>✅ Booking confirmed!</b><br>
        ${escapeHtml(name)} • ${bookingDate} • ${formatTime(bookingTime)}<br>
        ${escapeHtml(court)} • ${duration} hour(s) • ₱${total}
      `;

      bookingForm.reset();

      await loadBookings();
    } catch (error) {
      console.error(error);

      bookingResult.innerHTML = `
        <b>❌ Booking failed.</b><br>
        Please try again.
      `;
    }
  };
}

if (playForm) {
  playForm.onsubmit = async e => {
    e.preventDefault();

    const name = document.getElementById("player").value.trim();
    const mobile = document.getElementById("playMobile").value.trim();
    const playDate = document.getElementById("playDate").value;
    const playTime = document.getElementById("playTime").value;
    const skillLevel = document.getElementById("level").value;

    const player = {
      name: name,
      mobile: mobile,
      play_date: playDate,
      play_time: playTime,
      skill_level: skillLevel
    };

    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/open_play`,
        {
          method: "POST",
          headers: {
            ...headers,
            "Prefer": "return=minimal"
          },
          body: JSON.stringify(player)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      playResult.innerHTML = `
        <b>✅ Open Play registration confirmed!</b><br>
        ${escapeHtml(name)} • ${playDate} • ${formatTime(playTime)}<br>
        ${escapeHtml(skillLevel)} • ₱50
      `;

      playForm.reset();

      await loadOpenPlay();
    } catch (error) {
      console.error(error);

      playResult.innerHTML = `
        <b>❌ Registration failed.</b><br>
        Please try again.
      `;
    }
  };
}

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

function escapeHtml(value) {
  if (!value) return "";

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadBookings();
loadOpenPlay();

setInterval(() => {
  loadBookings();
  loadOpenPlay();
}, 30000);
