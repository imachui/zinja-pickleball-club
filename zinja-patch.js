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
    const c = document.getElementById("matchupsContainer");
    const st = c ? c.scrollTop : 0;
    await _rb();
    if (!window.__zinjaAdmin)
      document.querySelectorAll('#matchupsContainer button[onclick^="reportMatchWin"]').forEach(b => b.parentElement.remove());
    if (c) c.scrollTop = st;
  };
  const _rw = window.reportMatchWin;
  window.reportMatchWin = function (id, team) { if (!window.__zinjaAdmin) return alert("Admin only."); return _rw(id, team); };

  // 7) Admin: show GCash ref + Verify button
  const _rac = window.renderAdminContent;
  window.renderAdminContent = function () {
    if (currentAdminTab === "tournament") return _rac();
    if (currentAdminTab === "openplay") return renderOpenPlayAdmin();
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

  // 9) OPEN PLAY: Solo or Group (one payment, one GCash ref)
  const $ = id => document.getElementById(id);
  let playMode = "solo";
  function parseNames() {
    let names = [($("player")?.value || "").trim()];
    if (playMode === "group") names = names.concat(($("groupNames")?.value || "").split("\n").map(x => x.trim()).filter(Boolean));
    const seen = new Set();
    return names.filter(n => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
  }
  function updateGroupSummary() {
    const el = $("groupSummary"); if (!el) return;
    const n = parseNames().length;
    el.innerHTML = playMode === "group"
      ? `<div class="group-sum">👥 <b>${n}</b> player${n === 1 ? "" : "s"} × ₱${OPEN_PLAY_FEE} = <b>₱${(n * OPEN_PLAY_FEE).toLocaleString()}</b> <small>(one payment only)</small></div>` : "";
  }
  function setMode(m) {
    playMode = m;
    document.querySelectorAll("#playMode .seg-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === m));
    $("groupBox").style.display = m === "group" ? "block" : "none";
    $("player").placeholder = m === "group" ? "Your Name (group leader / contact person)" : "Full Name";
    updateGroupSummary();
  }
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("#playMode .seg-btn").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
    ["groupNames", "player"].forEach(i => $(i)?.addEventListener("input", updateGroupSummary));
  });

  window.handleOpenPlaySubmit = async function (ev) {
    if (ev) ev.preventDefault();
    const res = $("playResult"), mobile = $("playerPhone").value.trim(), playDate = $("playDate").value, lvl = $("level").value;
    const names = parseNames();
    if (!names.length || !mobile || !playDate || !lvl) return showResult(res, "Please complete all Open Play fields.", false);
    if (playMode === "group" && names.length < 2) return showResult(res, "Group mode: add at least one more name, or choose Solo.", false);
    if (names.length > 16) return showResult(res, "Maximum of 16 players per group.", false);
    const cl = checkClosureForOpenPlay(playDate);
    if (cl.closed) return showResult(res, "🚫 Facility Closed — " + cl.message, false);
    try {
      showResult(res, "⏳ Checking Open Play availability...", true);
      const cap = await checkOpenPlayCapacity(playDate);
      if (cap.noCourts) return showResult(res, `❌ Open Play unavailable on ${formatDate(playDate)}. Both courts are booked.`, false);
      if (cap.spotsLeft < names.length) return showResult(res, `❌ Only ${Math.max(cap.spotsLeft, 0)} slot(s) left on ${formatDate(playDate)}, but you are registering ${names.length}.`, false);
      const ex = await supabaseFetch(`/rest/v1/open_play?select=player_name&play_date=eq.${encodeURIComponent(playDate)}`);
      const taken = new Set((ex || []).map(r => String(r.player_name).trim().toLowerCase()));
      const dup = names.filter(n => taken.has(n.toLowerCase()));
      if (dup.length) return showResult(res, `⚠️ Already registered on this date: ${dup.join(", ")}. Add a last initial if it's a different person.`, false);
      res.innerHTML = "";
      openPaymentModal("openplay", { name: names[0], mobile, playDate, skillLevel: lvl, names }, names.length * OPEN_PLAY_FEE);
    } catch (e) { showResult(res, "Something went wrong. " + (e.message || "Please try again."), false); }
  };

  // show "6 players x P50" inside the payment modal
  const _opm = window.openPaymentModal;
  window.openPaymentModal = function (type, data, amount) {
    _opm(type, data, amount);
    const n = type === "openplay" && data.names ? data.names.length : 0;
    $("modalNote").textContent = n > 1 ? `👥 ${n} players × ₱${OPEN_PLAY_FEE}` : "";
  };

  // one payment -> one row per player (same ref + same code)
  window.processOpenPlayWithPayment = async function (data, ref) {
    const code = generateCancelCode();
    const names = data.names && data.names.length ? data.names : [data.name];
    await supabaseFetch("/rest/v1/open_play", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify(names.map(n => ({
        player_name: n, mobile: data.mobile, play_date: data.playDate, play_time: OPEN_PLAY_START_TIME,
        skill_level: data.skillLevel, cancellation_code: code, gcash_ref: ref, payment_status: "Pending Verification"
      })))
    });
    saveCancellation("open_play", { mobile: data.mobile, code });
    showResult($("playResult"), `✅ Thank you, ${data.name}! ${names.length} player${names.length > 1 ? "s" : ""} registered (Total ₱${(names.length * OPEN_PLAY_FEE).toLocaleString()}).\nPlease wait for the admin to verify your GCash payment (Ref: ${ref}).\nCancellation code: ${code}`, true);
    $("playForm").reset(); setMode("solo");
    const info = $("openPlayInfo"); if (info) info.innerHTML = "";
    await loadOpenPlay();
  };

  // admin: one card per group, verify everyone at once
  function renderOpenPlayAdmin() {
    const c = $("adminContent"), rows = adminData.openplay || [];
    if (!rows.length) { c.innerHTML = "<p>No Open Play registrations yet.</p>"; return; }
    const groups = new Map();
    rows.forEach(r => { const k = r.gcash_ref ? r.play_date + "|" + r.gcash_ref : "id" + r.id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
    c.innerHTML = [...groups.values()].map(g => {
      const f = g[0], n = g.length, ok = g.every(r => r.payment_status === "Verified");
      const members = g.map(r => `<li><span>${escapeHtml(r.player_name)}</span><button class="btn danger sm" onclick="deleteOpenPlay('${r.id}')">🗑</button></li>`).join("");
      return `<div class="admin-card">
        <h4>${n > 1 ? "👥 Group of " + n : "🏓 Solo"}</h4>
        <p>📱 ${escapeHtml(f.mobile || "-")} · 📅 ${escapeHtml(f.play_date)} · 🎯 ${escapeHtml(f.skill_level || "-")}</p>
        <p>💰 Total: <b>₱${(n * OPEN_PLAY_FEE).toLocaleString()}</b> · 💳 Ref: <b>${escapeHtml(f.gcash_ref || "—")}</b></p>
        <p style="color:${ok ? "#10b981" : "#f59e0b"};font-weight:700">${ok ? "✅ Verified" : "⏳ " + escapeHtml(f.payment_status || "Pending")}</p>
        <ul class="member-list">${members}</ul>
        ${ok ? "" : `<div class="row-btns"><button class="btn alt sm" data-ref="${escapeHtml(f.gcash_ref || "")}" data-date="${escapeHtml(f.play_date)}" data-id="${f.id}" onclick="verifyOpenPlay(this)">✅ Verify ${n > 1 ? "all " + n : "payment"}</button></div>`}
      </div>`;
    }).join("");
  }
  window.verifyOpenPlay = async function (b) {
    if (!window.__zinjaAdmin) return alert("Admin only.");
    const q = b.dataset.ref ? `gcash_ref=eq.${encodeURIComponent(b.dataset.ref)}&play_date=eq.${encodeURIComponent(b.dataset.date)}` : `id=eq.${b.dataset.id}`;
    try {
      await supabaseFetch(`/rest/v1/open_play?${q}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ payment_status: "Verified" }) });
      await window.loadAdminData();
    } catch (e) { alert("Failed: " + e.message); }
  };

  // 9b) Open Play slot info (fixes "1 slots left" grammar)
  window.updateOpenPlayInfo = async function () {
    const d = $("playDate")?.value, box = $("openPlayInfo");
    if (!box) return;
    if (!d) { box.innerHTML = ""; return; }
    const red = (t, m) => `<div style="background:#ffebee;color:#7f1d1d;padding:12px;border-radius:10px;border-left:4px solid #ef4444"><strong>${t}</strong><p style="margin:6px 0 0;font-size:.9em;color:#7f1d1d">${m}</p></div>`;
    try {
      const cl = checkClosureForOpenPlay(d);
      if (cl.closed) { box.innerHTML = red("🚫 Closed on " + formatDate(d), cl.message); return; }
      box.innerHTML = "<p>⏳ Checking available slots...</p>";
      const cap = await checkOpenPlayCapacity(d);
      if (cap.noCourts) { box.innerHTML = red("❌ Open Play is unavailable on " + formatDate(d), "Both courts are booked during Open Play hours (6 PM – 11 PM)."); return; }
      const left = Math.max(cap.spotsLeft, 0);
      const color = cap.isFull ? "#ef4444" : left < 5 ? "#ff9800" : "#4caf50";
      const bg = cap.isFull ? "#ffebee" : left < 5 ? "#fff3e0" : "#e8f5e9";
      const courts = cap.availableCourts.length === 2 ? "🏓 2 courts available" : `🏓 1 court available (Court ${cap.availableCourts[0]})`;
      box.innerHTML = `<div style="background:${bg};color:#1f2937;padding:12px;border-radius:10px;border-left:4px solid ${color}">
        <strong>Open Play on ${formatDate(d)} (6 PM – 11 PM)</strong>
        <p style="margin:6px 0;font-size:.95em;color:#1f2937">${courts}</p>
        <p style="margin:6px 0;font-size:.95em;color:#1f2937"><strong>${cap.currentCount}/${cap.maxSlots}</strong> spots taken — ${cap.isFull ? "<strong>FULL</strong>" : `<strong>${left}</strong> ${left === 1 ? "spot" : "spots"} left`}</p></div>`;
    } catch (e) { console.error(e); box.innerHTML = ""; }
  };

  // 8) No past dates in the date pickers
  document.addEventListener("DOMContentLoaded", () => {
    const t = getTodayStr();
    ["date", "playDate"].forEach(i => { const e = document.getElementById(i); if (e) e.min = t; });
  });
})();
