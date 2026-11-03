/* ZINJA PATCH - loads AFTER zinja-app.js. Fixes crashes + bugs. */
(function () {
  // 1) Missing functions that crashed the whole app on load
  window.createCancellationBoxes = function () {};
  window.announceClosureInChat = function () {};
  window.saveCancellation = function (type, o) {
    try {
      const a = JSON.parse(localStorage.getItem("zinja_codes") || "[]");
      a.unshift({ type, mobile: o.mobile, code: o.code, at: Date.now() });
      localStorage.setItem("zinja_codes", JSON.stringify(a.slice(0, 10)));
    } catch (e) {}
  };

  // 2) Save Supabase quota: only fetch recent rows; admin gets payment fields
  const _sf = window.supabaseFetch;
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  window.supabaseFetch = function (path, opt) {
    if (path.startsWith("/rest/v1/bookings?select=customer_name")) path += "&booking_date=gte." + daysAgo(30);
    else if (path.startsWith("/rest/v1/open_play?select=player_name,play_date")) path += "&play_date=gte." + daysAgo(7);
    path = path
      .replace("duration_hours,price,created_at", "duration_hours,price,created_at,gcash_ref,payment_status")
      .replace("select=id,player_name,mobile,play_date,skill_level", "select=id,player_name,mobile,play_date,skill_level,gcash_ref,payment_status");
    return _sf(path, opt);
  };

  // 3) Chat: show LATEST 50 messages since 3:00 AM PHT (old code showed oldest 50)
  window.loadChatMessages = async function () {
    const box = document.getElementById("chatMessages");
    if (!box || document.visibilityState !== "visible") return;
    try {
      const p = getPHTNow();
      const day = p.getHours() < 3 ? p.getDate() - 1 : p.getDate();
      const since = new Date(Date.UTC(p.getFullYear(), p.getMonth(), day, 3 - PHT_OFFSET_HOURS)).toISOString();
      let rows = await supabaseFetch("/rest/v1/chat_messages?select=player_name,message,created_at&created_at=gte." + encodeURIComponent(since) + "&order=created_at.desc&limit=50");
      rows = (rows || []).reverse();
      if (!rows.length) { box.innerHTML = "<p style='text-align:center;color:#9d174d'>No messages yet today. Be the first to say hi! 👋</p>"; return; }
      const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 50;
      box.innerHTML = rows.map(m => `
        <div style="margin-bottom:10px;padding:10px;background:rgba(42,42,74,.92);border-radius:12px;border-left:3px solid #7c3aed">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <strong style="color:#a78bfa">${escapeHtml(m.player_name)}</strong>
            <small style="color:#aaa">${formatClockTime(m.created_at)}</small></div>
          <div style="word-wrap:break-word;color:#fff">${escapeHtml(m.message)}</div></div>`).join("");
      if (atBottom) box.scrollTop = box.scrollHeight;
    } catch (e) { console.error(e); box.innerHTML = "<p style='text-align:center;color:#ef4444'>Unable to load chat. Please refresh.</p>"; }
  };

  // 4) Availability: Friday used to show "Closed" for the WHOLE day
  window.checkAvailability = async function () {
    const date = document.getElementById("date")?.value;
    const court = Number(document.getElementById("court")?.value);
    const box = document.getElementById("availabilityInfo");
    if (!box) return;
    if (!date || !court) { box.innerHTML = ""; return; }
    try {
      const day = new Date(date + "T00:00:00").getDay();
      let note = "";
      if (day === 5) note = "<p style='margin:6px 0 0'>ℹ️ Friday: open only until 5:00 PM.</p>";
      if (day === 6) note = "<p style='margin:6px 0 0'>ℹ️ Saturday: opens at 5:00 PM.</p>";
      const ex = await supabaseFetch(`/rest/v1/public_bookings?select=start_time,duration_hours&booking_date=eq.${encodeURIComponent(date)}&court=eq.${court}`)
        .catch(() => supabaseFetch(`/rest/v1/bookings?select=start_time,duration_hours&booking_date=eq.${encodeURIComponent(date)}&court=eq.${court}`));
      if (!ex || !ex.length) {
        box.innerHTML = `<div style="background:#e8f5e9;color:#1b5e20;padding:10px;border-radius:10px;border-left:4px solid #4caf50">✅ Court ${court} is fully available on ${formatDate(date)}!${note}</div>`;
        return;
      }
      const li = ex.map(b => `<li><strong>${formatTime(b.start_time)} - ${addHoursToTime(b.start_time, b.duration_hours)}</strong></li>`).join("");
      box.innerHTML = `<div style="background:#fff3e0;color:#7c2d12;padding:10px;border-radius:10px;border-left:4px solid #ff9800"><strong>⚠️ Court ${court} partially booked on ${formatDate(date)}:</strong><ul style="margin:8px 0 0 20px">${li}</ul>${note}</div>`;
    } catch (e) { console.error(e); }
  };

  // 5) Booking: must be within 5:00 AM - 11:00 PM
  const _hb = window.handleBookingSubmit;
  window.handleBookingSubmit = async function (ev) {
    const t = document.getElementById("time")?.value, d = Number(document.getElementById("duration")?.value);
    if (t && d) {
      const s = timeToMinutes(t);
      if (s < MORNING_START_MIN || s + d * 60 > OPEN_PLAY_END_MIN) {
        if (ev) ev.preventDefault();
        showResult(document.getElementById("bookingResult"), "Bookings must be between 5:00 AM and 11:00 PM.", false);
        return;
      }
    }
    return _hb(ev);
  };

  // 6) Admin: only admin can declare winners on the public live board
  window.__zinjaAdmin = false;
  const _la = window.loadAdminData;
  window.loadAdminData = async function () {
    window.__zinjaAdmin = document.getElementById("adminPassword")?.value === ADMIN_PASSWORD;
    await _la();
    if (window.__zinjaAdmin) renderLiveBoard();
  };
  const _rb = window.renderLiveBoard;
  window.renderLiveBoard = async function () {
    await _rb();
    if (!window.__zinjaAdmin)
      document.querySelectorAll('#matchupsContainer button[onclick^="reportMatchWin"]').forEach(b => b.parentElement.remove());
  };
  const _rw = window.reportMatchWin;
  window.reportMatchWin = function (id, team) { if (!window.__zinjaAdmin) return alert("Admin only."); return _rw(id, team); };

  // 7) Admin: show GCash ref + Verify button
  const _rac = window.renderAdminContent;
  window.renderAdminContent = function () {
    if (currentAdminTab === "tournament") return _rac();
    const c = document.getElementById("adminContent");
    const isB = currentAdminTab === "bookings";
    const rows = isB ? adminData.bookings : adminData.openplay;
    if (!rows.length) { c.innerHTML = "<p>No records yet.</p>"; return; }
    c.innerHTML = rows.map(r => {
      const ok = r.payment_status === "Verified";
      return `<div class="admin-card">
        <h4>🏓 ${escapeHtml(isB ? r.customer_name : r.player_name)}</h4>
        <p>📱 ${escapeHtml(r.mobile || "-")}</p>
        <p>📅 ${escapeHtml(isB ? r.booking_date + " " + r.start_time : r.play_date)}</p>
        ${isB ? `<p>🏟️ Court ${escapeHtml(r.court)} · ${escapeHtml(r.duration_hours)}h · ₱${Number(r.price || 0).toLocaleString()}</p>` : `<p>🎯 ${escapeHtml(r.skill_level || "-")}</p>`}
        <p>💳 Ref: <b>${escapeHtml(r.gcash_ref || "—")}</b> · <span style="color:${ok ? "#10b981" : "#f59e0b"}">${ok ? "✅ Verified" : "⏳ " + escapeHtml(r.payment_status || "Pending")}</span></p>
        <div class="row-btns">
          ${ok ? "" : `<button class="btn alt sm" onclick="verifyPayment('${isB ? "bookings" : "open_play"}','${r.id}')">✅ Verify</button>`}
          <button class="btn danger sm" onclick="${isB ? "deleteBooking" : "deleteOpenPlay"}('${r.id}')">🗑 Delete</button>
        </div></div>`;
    }).join("");
  };
  window.verifyPayment = async function (table, id) {
    if (!window.__zinjaAdmin) return alert("Admin only.");
    try {
      await supabaseFetch(`/rest/v1/${table}?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ payment_status: "Verified" }) });
      await window.loadAdminData();
    } catch (e) { alert("Failed: " + e.message); }
  };

  // 8) No past dates in the date pickers
  document.addEventListener("DOMContentLoaded", () => {
    const t = getTodayStr();
    ["date", "playDate"].forEach(i => { const e = document.getElementById(i); if (e) e.min = t; });
  });
})();
