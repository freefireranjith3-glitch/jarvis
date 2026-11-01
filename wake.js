// JARVIS – Hey JARVIS (குரல் மூலம் எழுப்புதல்)
// எப்படி வேலை செய்கிறது: App திறந்து திரையில் இருக்கும்போது, browser-ன் பேச்சு அறிதலை (SpeechRecognition)
// தொடர்ந்து இயக்கி, "Hey JARVIS" என்ற சொல்லைத் தேடுகிறது. கேட்டதும் உங்கள் கட்டளையை Chat-க்கு அனுப்புகிறது.
// வரம்புகள் (web app-க்கு உள்ளவை, மறைக்கப்படவில்லை):
//  - Phone பூட்டியிருந்தால் / app மூடியிருந்தால் / வேறு app முன்னால் இருந்தால் கேட்காது.
//  - Chrome உங்கள் பேச்சை Google சேவையகத்துக்கு அனுப்பி எழுத்தாக்கும். இயக்கத்தில் இருக்கும்போது தொடர்ந்து அனுப்பப்படும்.
//  - Battery அதிகம் செலவாகும். சில phone-ல் மைக் தொடங்கும்போது சிறு ஒலி கேட்கலாம்.
//  - PIN திரை பூட்டியிருந்தால் கட்டளைகளை ஏற்காது.
JARVIS.wake = (function () {
  const S = JARVIS.storage;
  const $ = (id) => document.getElementById(id);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SR;

  let state = "off";   // off | idle (கேட்கிறது) | command (கட்டளைக்காக) | paused (வேறு மைக் பயன்பாடு)
  let rec = null;
  let timer = null;
  let wakeLock = null;
  let lastErr = "";
  let lastStart = 0;
  let fastEnds = 0;

  const isOn = () => S.get("wakeOn", false) === true;
  const wakeLang = () => S.get("wakeLang", "en-IN");
  const keepAwake = () => S.get("wakeKeepAwake", true) !== false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const screenLocked = () => { const l = $("lock"); return !!(l && l.classList && !l.classList.contains("hidden")); };

  /* ---------- Wake phrase ---------- */
  const EN = /(^|[^\p{L}])(hey|hi|ok|okay|hello)[\s,.!?\-]*(jarvis|jarvish|jarves|jervis|garvis|jarvice)(?![\p{L}])/iu;
  const TA = /(^|\s)(ஹே|ஏய்|ஹாய்|ஓகே|ஹலோ)[\s,.!?\-]*(ஜார்விஸ்|ஜார்விஸ|ஜார்வீஸ்|ஜாா்விஸ்)/u;

  // wake சொல் இருந்தால், அதற்குப் பின் வரும் கட்டளையைத் தரும் ("" = கட்டளை இல்லை); இல்லையெனில் null
  function findWake(text) {
    const t = String(text || "");
    for (const re of [EN, TA]) {
      const m = re.exec(t);
      if (m) return t.slice(m.index + m[0].length).replace(/^[\s,.!?:\-]+/, "").trim();
    }
    return null;
  }

  /* ---------- UI ---------- */
  function setStatus(text) {
    const s = $("wake-status");
    if (s) s.textContent = text || "";
    const ind = $("wake-ind");
    if (ind) {
      ind.classList.toggle("hidden", state === "off");
      ind.title = text || "";
    }
  }
  const statusFor = () =>
    state === "off" ? (supported ? "நிறுத்தப்பட்டுள்ளது" : "இந்த browser-ல் இல்லை (Chrome பயன்படுத்துங்கள்)")
    : state === "command" ? "கேட்கிறேன்… கட்டளையைச் சொல்லுங்கள்"
    : state === "paused" ? "இடைநிறுத்தம் (மைக் வேறு பயன்பாட்டில் உள்ளது)"
    : "👂 \"Hey JARVIS\" என்று சொல்லக் காத்திருக்கிறது…";

  function beep() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 0.15);
      setTimeout(() => { try { ac.close(); } catch (e) {} }, 400);
    } catch (e) {}
  }

  /* ---------- Screen wake lock ---------- */
  async function acquireLock() {
    if (!keepAwake()) return;
    try {
      if (navigator.wakeLock && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      }
    } catch (e) {}
  }
  function releaseLock() {
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
  }

  /* ---------- Recognition loop ---------- */
  function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
  function schedule(ms) {
    clearTimer();
    timer = setTimeout(() => { timer = null; startRec(); }, ms);
  }
  function stopRec() {
    clearTimer();
    if (rec) {
      const r = rec;
      rec = null;
      r.onend = null; r.onerror = null; r.onresult = null;
      try { r.abort(); } catch (e) {}
    }
  }

  function fatal(message) {
    S.set("wakeOn", false);
    state = "off";
    stopRec();
    releaseLock();
    const t = $("wake-toggle");
    if (t) t.checked = false;
    setStatus(message);
  }

  function startRec() {
    if (state !== "idle" || rec) return;
    if (document.hidden || screenLocked()) { schedule(1500); return; }
    const V = JARVIS.voice;
    if (V && (V.isListening() || V.isSpeaking())) { schedule(800); return; }

    let triggered = false;
    const r = new SR();
    rec = r;
    r.lang = wakeLang();
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;

    r.onresult = (e) => {
      if (triggered || (JARVIS.voice && JARVIS.voice.isSpeaking())) return; // JARVIS தன் குரலையே கேட்காமல்
      let text = "";
      for (let i = Math.max(0, e.results.length - 2); i < e.results.length; i++) text += e.results[i][0].transcript + " ";
      const cmd = findWake(text);
      if (cmd === null) return;
      triggered = true;
      rec = null;
      r.onend = null; r.onerror = null; r.onresult = null;
      try { r.abort(); } catch (err) {}
      onWake(cmd);
    };
    r.onerror = (e) => {
      lastErr = e.error || "";
      if (lastErr === "not-allowed" || lastErr === "service-not-allowed") {
        fatal("Mic அனுமதி இல்லை. Chrome → ⋮ → Settings → Site settings → Microphone-ல் இந்த site-க்கு அனுமதியுங்கள்.");
      }
    };
    r.onend = () => {
      if (rec === r) rec = null;
      if (triggered || state !== "idle") return;
      const quick = Date.now() - lastStart < 1500;
      fastEnds = quick ? fastEnds + 1 : 0;
      const delay = lastErr === "network" ? 5000 : fastEnds > 6 ? 10000 : 400;
      if (lastErr === "network") setStatus("Internet தேவை (பேச்சை எழுத்தாக்க). மீண்டும் முயல்கிறது…");
      lastErr = "";
      schedule(delay);
    };

    try {
      lastStart = Date.now();
      r.start();
      setStatus(statusFor());
    } catch (e) {
      rec = null;
      schedule(2000);
    }
  }

  function listenOnce() {
    return new Promise((resolve) => {
      JARVIS.voice.listen({
        onResult: (t) => setStatus("கேட்கிறேன்: " + t),
        onEnd: (finalText, err) => resolve(err ? "" : finalText)
      });
    });
  }

  async function onWake(cmd) {
    state = "command";
    setStatus(statusFor());
    beep();
    try {
      if (screenLocked()) return; // PIN திரை பூட்டியிருந்தால் கட்டளை ஏற்கப்படாது
      let text = cmd;
      if (!text) {
        await sleep(350); // மைக் விடுபட
        text = (await listenOnce()).trim();
      }
      if (text && !screenLocked()) {
        if (JARVIS.go) JARVIS.go("chat");
        const reply = await JARVIS.chat.send(text);
        if (reply && !JARVIS.voice.isAutoSpeak()) JARVIS.voice.speak(reply); // Hands-free: பதிலைப் பேசு
      }
    } catch (e) {
      // அமைதியாகத் தொடர்
    } finally {
      state = isOn() ? "idle" : "off";
      setStatus(statusFor());
      if (state === "idle") schedule(1200);
    }
  }

  /* ---------- மற்ற modules-க்கான hooks (voice.js அழைக்கும்) ---------- */
  function yieldMic() {
    if (state !== "idle") return;
    state = "paused";
    stopRec();
    setStatus(statusFor());
  }
  function resumeMic() {
    if (state !== "paused") return;
    state = "idle";
    setStatus(statusFor());
    schedule(1000);
  }

  /* ---------- Enable / Disable ---------- */
  function enable() {
    if (!supported) { fatal("இந்த browser-ல் Hey JARVIS ஆதரவு இல்லை. Chrome பயன்படுத்துங்கள்."); return; }
    S.set("wakeOn", true);
    state = "idle";
    fastEnds = 0;
    acquireLock();
    setStatus(statusFor());
    schedule(0);
  }
  function disable() {
    S.set("wakeOn", false);
    state = "off";
    stopRec();
    releaseLock();
    setStatus(statusFor());
  }

  function init() {
    const t = $("wake-toggle");
    const lang = $("wake-lang");
    const keep = $("wake-keepawake");
    if (!t) return;
    if (!supported) { t.disabled = true; setStatus(statusFor()); return; }

    t.checked = isOn();
    t.addEventListener("change", () => (t.checked ? enable() : disable()));
    lang.value = wakeLang();
    lang.addEventListener("change", () => {
      S.set("wakeLang", lang.value);
      if (state === "idle") { stopRec(); schedule(200); }
    });
    keep.checked = keepAwake();
    keep.addEventListener("change", () => {
      S.set("wakeKeepAwake", keep.checked);
      if (keep.checked && state !== "off") acquireLock(); else releaseLock();
    });

    document.addEventListener("visibilitychange", () => {
      if (state === "off") return;
      if (document.hidden) {
        stopRec();
        releaseLock();
        setStatus("App திரையில் இல்லை – இடைநிறுத்தம்");
      } else {
        acquireLock();
        if (state === "idle") schedule(300);
        setStatus(statusFor());
      }
    });

    if (isOn()) {
      state = "idle";
      acquireLock();
      setStatus(statusFor());
      schedule(500);
      // சில browser-ல் மைக்கைத் தொடங்க முதல் தொடுதல் தேவை
      document.addEventListener("pointerdown", () => { if (state === "idle" && !rec) schedule(0); }, { once: true });
    } else {
      setStatus(statusFor());
    }
  }

  return { init: init, enable: enable, disable: disable, yieldMic: yieldMic, resumeMic: resumeMic, findWake: findWake, supported: supported, _state: () => state };
})();
