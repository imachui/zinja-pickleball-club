/* ZINJA FAQ Bot - English / Tagalog / Cebuano. Loads after zinja-app.js */
(function () {
  let lang = "en";
  try { const s = localStorage.getItem("zinja_bot_lang"); if (s === "en" || s === "tl" || s === "ceb") lang = s; } catch (e) {}

  const gcNum = () => (typeof GCASH_NUMBER !== "undefined" ? GCASH_NUMBER : "");
  const gcName = () => (typeof GCASH_NAME !== "undefined" ? GCASH_NAME : "ZINJA Pickleball Club");

  /* ---------- UI text ---------- */
  const UI = {
    en: { title: "ZINJA Assistant", sub: "Ask me about the club", ph: "Type your question...", send: "Send",
      hello: "Hi! 👋 I'm the ZINJA assistant. Ask me about rates, schedule, booking, Open Play, or payment. You can type in English, Tagalog, or Cebuano.",
      thanks: "You're welcome! 🏓 See you on the court!",
      sorry: "Sorry, I don't have an answer for that yet. 🙏" },
    tl: { title: "ZINJA Assistant", sub: "Magtanong tungkol sa club", ph: "I-type ang tanong mo...", send: "Ipadala",
      hello: "Kumusta! 👋 Ako ang ZINJA assistant. Magtanong tungkol sa rate, iskedyul, booking, Open Play, o bayad. Puwede kang mag-type sa English, Tagalog, o Cebuano.",
      thanks: "Walang anuman! 🏓 Kita-kita sa court!",
      sorry: "Pasensya na, wala pa akong sagot diyan. 🙏" },
    ceb: { title: "ZINJA Assistant", sub: "Pangutana mahitungod sa club", ph: "I-type ang imong pangutana...", send: "Ipadala",
      hello: "Kumusta! 👋 Ako ang ZINJA assistant. Pangutana mahitungod sa rate, iskedyul, booking, Open Play, o bayad. Mahimo ka mag-type sa English, Tagalog, o Cebuano.",
      thanks: "Walay sapayan! 🏓 Kita ta sa court!",
      sorry: "Pasensya, wala pa koy tubag niana. 🙏" }
  };

  const CHIPS = ["rates", "hours", "status", "booking", "openplay", "group", "payment", "location"];
  const CHIP_LABEL = {
    en: { rates: "💵 Rates", hours: "🕐 Schedule", status: "🟢 Open now?", booking: "📅 Book a court", openplay: "🎯 Open Play", group: "👥 Group payment", payment: "💳 How to pay", location: "📍 Location" },
    tl: { rates: "💵 Mga rate", hours: "🕐 Iskedyul", status: "🟢 Bukas ba ngayon?", booking: "📅 Mag-book ng court", openplay: "🎯 Open Play", group: "👥 Isang bayad para sa group", payment: "💳 Paano magbayad", location: "📍 Lokasyon" },
    ceb: { rates: "💵 Mga rate", hours: "🕐 Iskedyul", status: "🟢 Abli ba karon?", booking: "📅 Mag-book og court", openplay: "🎯 Open Play", group: "👥 Usa ka bayad para sa group", payment: "💳 Unsaon pagbayad", location: "📍 Lokasyon" }
  };

  /* ---------- live open/closed status ---------- */
  function statusText(l) {
    const T = {
      en: { open: "🟢 We are open right now! You can book a court or join Open Play.", week: "🔴 We are closed right now for the weekly rest period. We reopen on Saturday at 5 PM.", night: "🔴 We are closed for now. Court hours are 5 AM to 11 PM." },
      tl: { open: "🟢 Bukas kami ngayon! Puwede kang mag-book ng court o sumali sa Open Play.", week: "🔴 Sarado kami ngayon dahil sa lingguhang pahinga. Magbubukas ulit kami sa Sabado ng 5 PM.", night: "🔴 Sarado kami sa ngayon. Ang oras ng court ay 5 AM hanggang 11 PM." },
      ceb: { open: "🟢 Abli mi karon! Puwede ka mag-book og court o moapil sa Open Play.", week: "🔴 Sirado mi karon tungod sa weekly rest period. Mo-abli mi pag-usab sa Sabado sa 5 PM.", night: "🔴 Sirado mi karon. Ang oras sa court kay 5 AM hangtod 11 PM." }
    };
    let weekly = false, hour = 12;
    try { weekly = getCurrentClosureStatus(); hour = getPHTNow().getHours(); } catch (e) {}
    return weekly ? T[l].week : (hour < 5 || hour >= 23) ? T[l].night : T[l].open;
  }

  /* ---------- topics: keywords (all 3 languages) + answers ---------- */
  // "=word" means whole word only. Longer keywords score higher.
  const TOPICS = {
    rates: { w: 1, k: ["rate", "price", "how much", "magkano", "magkano ang", "pila ang", "pila ang bayad", "presyo", "pila", "tag-pila", "tagpila", "cost", "fee", "hourly", "per hour", "kada oras", "matag oras"],
      a: {
        en: "Court rental rates:\n☀️ ₱100 per hour from 5 AM to 4 PM\n🌙 ₱150 per hour from 5 PM to 11 PM\nThe booking page shows the exact total before you pay.\n\nOpen Play is ₱50 per player.",
        tl: "Mga rate ng court:\n☀️ ₱100 kada oras mula 5 AM hanggang 4 PM\n🌙 ₱150 kada oras mula 5 PM hanggang 11 PM\nSa pahina ng booking makikita ang eksaktong kabuuan bago ka magbayad.\n\nAng Open Play ay ₱50 kada manlalaro.",
        ceb: "Mga rate sa court:\n☀️ ₱100 matag oras gikan 5 AM hangtod 4 PM\n🌙 ₱150 matag oras gikan 5 PM hangtod 11 PM\nMakita nimo ang eksaktong total sa booking page sa dili pa ka mobayad.\n\nAng Open Play kay ₱50 matag magdudula." } },
    hours: { w: 1, k: ["hours", "schedule", "iskedyul", "oras", "kanus-a", "kanusa", "kanus a", "kailan", "closed", "close", "sarado", "sirado", "friday", "saturday", "biyernes", "sabado", "weekly", "rest", "what time", "anong oras", "unsang oras", "unsa nga oras"],
      a: {
        en: "We are open daily from 5 AM to 11 PM, except for the weekly rest period: we are closed every Friday from 5 PM until Saturday at 5 PM (Philippine Time). Open Play runs from 6 PM to 11 PM.",
        tl: "Bukas kami araw-araw mula 5 AM hanggang 11 PM, maliban sa lingguhang pahinga: sarado kami tuwing Biyernes mula 5 PM hanggang Sabado ng 5 PM (oras sa Pilipinas). Ang Open Play ay mula 6 PM hanggang 11 PM.",
        ceb: "Abli mi matag adlaw gikan 5 AM hangtod 11 PM, gawas sa weekly rest period: sirado mi matag Biyernes gikan 5 PM hangtod Sabado sa 5 PM (oras sa Pilipinas). Ang Open Play kay gikan 6 PM hangtod 11 PM." } },
    status: { w: 1.5, k: ["open now", "open ba", "bukas ba", "abli ba", "open today", "bukas ngayon", "abli karon", "open pa ba", "bukas pa ba", "abli pa ba", "is it open", "open na"],
      a: { en: () => statusText("en"), tl: () => statusText("tl"), ceb: () => statusText("ceb") } },
    openplay: { w: 1, k: ["open play", "openplay", "join", "sali", "sumali", "apil", "moapil", "mo-apil", "maglaro", "play", "dula", "mudula", "modula"],
      a: {
        en: "Open Play is ₱50 per player, every day from 6 PM to 11 PM (except Fridays). Tap 'Join Open Play' on the home page, fill in your details, and pay through GCash. The admin picks the teams each night, and walk-ins are welcome on-site.",
        tl: "Ang Open Play ay ₱50 kada manlalaro, araw-araw mula 6 PM hanggang 11 PM (maliban sa Biyernes). Pindutin ang 'Join Open Play' sa home page, punan ang iyong detalye, at magbayad gamit ang GCash. Ang admin ang pipili ng mga team tuwing gabi, at puwede rin ang walk-in sa mismong lugar.",
        ceb: "Ang Open Play kay ₱50 matag magdudula, adlaw-adlaw gikan 6 PM hangtod 11 PM (gawas sa Biyernes). I-tap ang 'Join Open Play' sa home page, pun-a ang imong detalye, ug mobayad pinaagi sa GCash. Ang admin ang mopili sa mga team matag gabii, ug welcome ang walk-in sa mismong lugar." } },
    group: { w: 2, k: ["group", "grupo", "barkada", "isahin", "isahon", "one payment", "isang bayad", "usa ka bayad", "sabay-sabay", "magkakasama", "magkauban", "kauban", "kasama", "tingub", "together", "sama-sama", "pay for everyone", "pay for all", "usa ra", "isa lang"],
      a: {
        en: "Yes! In Join Open Play, choose 'Group (one payment)'. Enter your name, then list your teammates (one name per line). You pay once for everyone (₱50 × number of players) and enter one GCash reference number. The maximum is 16 players per group. Playing alone? Just choose 'Solo'.",
        tl: "Oo! Sa Join Open Play, piliin ang 'Group (one payment)'. Ilagay ang iyong pangalan, tapos ilista ang mga kasama mo (isang pangalan bawat linya). Isang beses lang kayo magbabayad para sa lahat (₱50 × bilang ng manlalaro) at isang GCash reference number lang ang ilalagay. Hanggang 16 na manlalaro kada group. Mag-isa ka lang? Piliin ang 'Solo'.",
        ceb: "Oo! Sa Join Open Play, pilia ang 'Group (one payment)'. Ibutang ang imong ngalan, dayon ilista ang imong mga kauban (usa ka ngalan kada linya). Usa ra ka bayad para sa tanan (₱50 × gidaghanon sa magdudula) ug usa ra ka GCash reference number ang isulat. Hangtod 16 ka magdudula kada group. Mag-inusara ka? Pilia ang 'Solo'." } },
    booking: { w: 1, k: ["book", "reserve", "reservation", "=rent", "renta", "reserba", "pag-book", "pa-book", "mag-book", "magbook", "court", "duration"],
      a: {
        en: "To book a court: open 'Book a Court', enter your name and mobile number, then pick the date, start time, court (1 or 2), and duration (1 to 10 hours). The total price appears automatically. Tap 'Tap to Proceed to Payment', pay through GCash, and enter your reference number. The admin will verify your payment. Bookings must be between 5 AM and 11 PM.",
        tl: "Para mag-book ng court: buksan ang 'Book a Court', ilagay ang pangalan at mobile number, tapos piliin ang petsa, oras ng simula, court (1 o 2), at tagal (1 hanggang 10 oras). Lalabas nang kusa ang kabuuang presyo. Pindutin ang 'Tap to Proceed to Payment', magbayad sa GCash, at ilagay ang reference number. Beberipikahin ng admin ang bayad mo. Ang booking ay dapat nasa pagitan ng 5 AM at 11 PM.",
        ceb: "Aron mag-book og court: ablihi ang 'Book a Court', isulat ang imong ngalan ug mobile number, dayon pilia ang petsa, oras sa pagsugod, court (1 o 2), ug gidugayon (1 hangtod 10 ka oras). Awtomatikong mogawas ang kinatibuk-ang presyo. I-tap ang 'Tap to Proceed to Payment', mobayad pinaagi sa GCash, ug isulat ang reference number. Susihon sa admin ang imong bayad. Ang booking kinahanglan tali sa 5 AM ug 11 PM." } },
    payment: { w: 1, k: ["gcash", "g-cash", "pay", "payment", "bayad", "bayaran", "bayran", "magbayad", "pagbayad", "mobayad", "mubayad", "reference", "paano magbayad", "unsaon pagbayad", "unsaon pag-bayad", "how to pay", "send money"],
      a: {
        en: () => `We accept GCash.\nNumber: ${gcNum()}\nAccount name: ${gcName()}\n\nAfter paying, enter your GCash reference number in the payment window and tap 'I Have Paid'. The admin will verify your payment.`,
        tl: () => `Tumatanggap kami ng GCash.\nNumero: ${gcNum()}\nPangalan ng account: ${gcName()}\n\nPagkatapos magbayad, ilagay ang GCash reference number sa payment window at pindutin ang 'I Have Paid'. Beberipikahin ng admin ang bayad mo.`,
        ceb: () => `Modawat mi og GCash.\nNumero: ${gcNum()}\nNgalan sa account: ${gcName()}\n\nPagkahuman og bayad, isulat ang GCash reference number sa payment window ug i-tap ang 'I Have Paid'. Susihon sa admin ang imong bayad.` } },
    refund: { w: 1.5, k: ["refund", "cancel", "cancellation", "kansela", "magkansela", "i-cancel", "ibalik", "pabalik", "balik", "ulan", "rain", "weather", "panahon", "uwan", "emergency"],
      a: {
        en: "Full refunds are only processed if a game is cancelled because of bad weather or a valid emergency. To cancel, contact the admin and give your cancellation code (it is shown after you book or register).",
        tl: "Ang buong refund ay ibinibigay lamang kung makansela ang laro dahil sa masamang panahon o tunay na emergency. Para magkansela, makipag-ugnayan sa admin at ibigay ang iyong cancellation code (lumalabas ito pagkatapos mong mag-book o magparehistro).",
        ceb: "Ang bug-os nga refund gihatag lamang kung makansela ang dula tungod sa dautang panahon o tinuod nga emergency. Aron mo-cancel, kontaka ang admin ug ihatag ang imong cancellation code (mogawas kini human nimo mag-book o mag-register)." } },
    location: { w: 1, k: ["where", "location", "address", "=saan", "=asa", "=diin", "directions", "direction", "map", "malusay", "guihulngan", "lugar", "located", "unsa nga lugar", "paano pumunta"],
      a: {
        en: "📍 ZINJA Pickleball Club is in Malusay, Guihulngan City, Negros Oriental.",
        tl: "📍 Ang ZINJA Pickleball Club ay nasa Malusay, Guihulngan City, Negros Oriental.",
        ceb: "📍 Ang ZINJA Pickleball Club naa sa Malusay, Guihulngan City, Negros Oriental." } },
    skill: { w: 1, k: ["beginner", "skill", "level", "newbie", "baguhan", "bag-o pa", "bago pa", "first time", "nagsisimula", "sinugdan", "advanced", "intermediate"],
      a: {
        en: "Everyone is welcome, from beginners to advanced players! When you join Open Play, just choose your skill level: Beginner, Intermediate, Advanced, or Any level.",
        tl: "Welcome ang lahat, mula sa mga baguhan hanggang sa advanced! Sa pagsali sa Open Play, piliin lang ang iyong antas: Beginner, Intermediate, Advanced, o Any level.",
        ceb: "Welcome ang tanan, gikan sa mga bag-o pa hangtod sa advanced! Sa pag-apil sa Open Play, pilia lang ang imong lebel: Beginner, Intermediate, Advanced, o Any level." } },
    courts: { w: 1.5, k: ["how many courts", "ilang court", "pila ka court", "number of courts", "facility", "pasilidad", "pila ang court"],
      a: {
        en: "We have 2 clean and well-maintained pickleball courts: Court 1 and Court 2.",
        tl: "Mayroon kaming 2 pickleball court na malinis at maayos ang pangangalaga: Court 1 at Court 2.",
        ceb: "Naa mi og 2 ka pickleball court nga limpyo ug maayo ang pagkabantay: Court 1 ug Court 2." } },
    equipment: { w: 1.5, k: ["paddle", "equipment", "raket", "racket", "gamit"],
      a: {
        en: "I don't have information about paddle or equipment rental. Please ask the admin on-site.",
        tl: "Wala akong impormasyon tungkol sa paddle o pagrenta ng gamit. Magtanong sa admin sa mismong lugar.",
        ceb: "Wala koy impormasyon mahitungod sa paddle o pag-abang og gamit. Pangutana sa admin sa mismong lugar." } },
    app: { w: 1, k: ["=app", "=apk", "download", "install", "android", "mag-download", "i-download"],
      a: {
        en: "You can install the free ZINJA app on Android 7.0 or higher. Open 'Get the App' in the menu and tap 'Download APK'. Then allow installs from unknown sources and open the downloaded file.",
        tl: "Puwede mong i-install ang libreng ZINJA app sa Android 7.0 pataas. Buksan ang 'Get the App' sa menu at pindutin ang 'Download APK'. Pagkatapos, payagan ang pag-install mula sa unknown sources at buksan ang na-download na file.",
        ceb: "Mahimo nimo i-install ang libre nga ZINJA app sa Android 7.0 pataas. Ablihi ang 'Get the App' sa menu ug i-tap ang 'Download APK'. Unya tugoti ang pag-install gikan sa unknown sources ug ablihi ang na-download nga file." } },
    chat: { w: 1, k: ["club chat", "chat", "makipag-usap", "makig-istorya", "istorya"],
      a: {
        en: "Use the Club Chat from the menu to talk with other players. Messages reset every day at 3 AM.",
        tl: "Gamitin ang Club Chat sa menu para makipag-usap sa ibang manlalaro. Nare-reset ang mga mensahe araw-araw ng 3 AM.",
        ceb: "Gamita ang Club Chat sa menu aron makig-istorya sa ubang magdudula. Mo-reset ang mga mensahe matag adlaw sa 3 AM." } },
    contact: { w: 1, k: ["contact", "admin", "owner", "call", "tawag", "kontak", "kontakon", "phone"],
      a: {
        en: "For questions I cannot answer, please ask the admin on-site or post in the Club Chat from the menu.",
        tl: "Para sa mga tanong na hindi ko masagot, magtanong sa admin sa mismong lugar o mag-post sa Club Chat sa menu.",
        ceb: "Para sa mga pangutana nga dili nako matubag, pangutana sa admin sa mismong lugar o mag-post sa Club Chat sa menu." } },
    thanks: { w: 1, k: ["thank", "=thanks", "=ty", "salamat", "daghang salamat", "maraming salamat"] },
    greet: { w: 1, k: ["=hi", "=hello", "=hey", "=yo", "kumusta", "kamusta", "musta", "good morning", "good afternoon", "good evening", "maayong", "magandang"] }
  };

  /* ---------- matching ---------- */
  const norm = t => " " + String(t).toLowerCase().replace(/[^a-z0-9\-'\s]/g, " ") + " ";
  function has(text, k) {
    const whole = k[0] === "=", w = whole ? k.slice(1) : k;
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(whole ? `[^a-z0-9]${esc}[^a-z0-9]` : `[^a-z0-9]${esc}`).test(text);
  }
  function score(id, text) {
    const t = TOPICS[id]; let s = 0;
    t.k.forEach(k => { if (has(text, k)) s += (k[0] === "=" ? k.length - 1 : k.length); });
    return s * (t.w || 1);
  }
  function pick(raw) {
    const text = norm(raw);
    let best = null, top = 0;
    Object.keys(TOPICS).forEach(id => {
      if (id === "thanks" || id === "greet") return;
      const s = score(id, text);
      if (s > top) { top = s; best = id; }
    });
    if (best) return best;
    if (score("thanks", text) > 0) return "thanks";
    if (score("greet", text) > 0) return "greet";
    return null;
  }

  const MARK = {
    en: ["how", "what", "where", "when", "can", "does", "much", "hello", "thanks", "thank", "please", "you", "your", "is", "are", "there", "any", "the"],
    tl: ["magkano", "saan", "kailan", "paano", "puwede", "pwede", "mayroon", "ano", "bakit", "po", "kamusta", "bukas", "sarado", "ngayon", "maraming", "magbayad", "gusto", "paki", "ilang"],
    ceb: ["unsa", "asa", "kanus-a", "kanusa", "pila", "mahimo", "palihug", "ngano", "unsaon", "naa", "diin", "abli", "sirado", "makasulod", "mobayad", "mubayad", "nako", "imong", "daghang"]
  };
  function detect(raw) {
    const words = new Set(norm(raw).trim().split(/\s+/));
    const c = {};
    Object.keys(MARK).forEach(l => { c[l] = MARK[l].filter(w => words.has(w)).length; });
    const max = Math.max(c.en, c.tl, c.ceb);
    if (max === 0) return null;
    const lead = Object.keys(c).filter(l => c[l] === max);
    return lead.length === 1 ? lead[0] : null;
  }

  function answer(id, l) {
    if (id === "thanks") return UI[l].thanks;
    if (id === "greet") return UI[l].hello;
    if (!id) return UI[l].sorry + "\n\n" + TOPICS.contact.a[l];
    const a = TOPICS[id].a[l];
    return typeof a === "function" ? a() : a;
  }

  if (typeof module !== "undefined") module.exports = { pick, detect, answer, TOPICS };
  if (typeof document === "undefined") return;

  /* ---------- UI ---------- */
  const root = document.createElement("div");
  root.innerHTML = `
    <button type="button" class="zbot-launch" id="zbotLaunch" aria-label="Open chat assistant">💬</button>
    <div class="zbot-panel" id="zbotPanel" hidden role="dialog" aria-label="ZINJA Assistant">
      <div class="zbot-head">
        <div class="t"><strong id="zbotTitle"></strong><small id="zbotSub"></small></div>
        <div class="zbot-lang" id="zbotLang">
          <button type="button" data-l="en">EN</button><button type="button" data-l="tl">TL</button><button type="button" data-l="ceb">CEB</button>
        </div>
        <button type="button" class="zbot-x" id="zbotClose" aria-label="Close">✕</button>
      </div>
      <div class="zbot-msgs" id="zbotMsgs"></div>
      <div class="zbot-chips" id="zbotChips"></div>
      <form class="zbot-form" id="zbotForm" autocomplete="off">
        <input id="zbotInput" maxlength="200" aria-label="Your question">
        <button type="submit" class="btn" id="zbotSend"></button>
      </form>
    </div>`;
  document.body.appendChild(root);

  const $ = id => document.getElementById(id);
  const msgs = $("zbotMsgs");
  let started = false;

  function add(text, who) {
    const d = document.createElement("div");
    d.className = "zbot-msg " + who;
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function paintLang() {
    $("zbotTitle").textContent = UI[lang].title;
    $("zbotSub").textContent = UI[lang].sub;
    $("zbotInput").placeholder = UI[lang].ph;
    $("zbotSend").textContent = UI[lang].send;
    document.querySelectorAll("#zbotLang button").forEach(b => b.classList.toggle("on", b.dataset.l === lang));
    $("zbotChips").innerHTML = "";
    CHIPS.forEach(id => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = CHIP_LABEL[lang][id];
      b.addEventListener("click", () => { add(CHIP_LABEL[lang][id], "me"); reply(id); });
      $("zbotChips").appendChild(b);
    });
  }
  function setLang(l, announce) {
    lang = l;
    try { localStorage.setItem("zinja_bot_lang", l); } catch (e) {}
    paintLang();
    if (announce) add(UI[lang].hello, "bot");
  }
  function reply(id) { setTimeout(() => add(answer(id, lang), "bot"), 350); }

  $("zbotLaunch").addEventListener("click", () => {
    const p = $("zbotPanel");
    p.hidden = !p.hidden;
    if (!p.hidden) {
      if (!started) { started = true; add(UI[lang].hello, "bot"); }
      setTimeout(() => $("zbotInput").focus(), 50);
    }
  });
  $("zbotClose").addEventListener("click", () => { $("zbotPanel").hidden = true; });
  document.querySelectorAll("#zbotLang button").forEach(b => b.addEventListener("click", () => setLang(b.dataset.l, true)));
  $("zbotForm").addEventListener("submit", e => {
    e.preventDefault();
    const text = $("zbotInput").value.trim();
    if (!text) return;
    $("zbotInput").value = "";
    add(text, "me");
    const d = detect(text);
    if (d && d !== lang) setLang(d, false);
    reply(pick(text));
  });
  paintLang();
})();
