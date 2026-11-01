// JARVIS – Voice AI (பேச்சு)
// பேசுவது: browser-ன் speechSynthesis (phone-ல் உள்ள குரல்கள், இலவசம்).
// கேட்பது: browser-ன் SpeechRecognition. குறிப்பு: Chrome இதற்கு உங்கள் பேச்சை Google சேவையகத்துக்கு அனுப்பி எழுத்தாக்கும் (internet தேவை).
// பெண் குரல்: browser குரலின் பாலினத்தைச் சொல்வதில்லை, அதனால் நீங்களே கேட்டுத் தேர்ந்தெடுக்க வேண்டும்.
JARVIS.voice = (function () {
  const S = JARVIS.storage;
  const $ = (id) => document.getElementById(id);

  const synth = window.speechSynthesis;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const ttsSupported = !!(synth && window.SpeechSynthesisUtterance);
  const sttSupported = !!SR;

  let voices = [];
  let rec = null;
  let listening = false;

  /* ---------- Settings ---------- */
  const autoSpeak = () => S.get("voiceAuto", false) === true;
  const autoSend = () => S.get("voiceAutoSend", true) !== false;
  const micLang = () => S.get("voiceMicLang", "ta-IN");
  const rate = () => Number(S.get("voiceRate", 1)) || 1;
  const savedVoice = (lang) => S.get(lang === "ta" ? "voiceTa" : "voiceEn", "");

  const normLang = (l) => String(l || "").toLowerCase().replace("_", "-");
  const isTamil = (t) => /[஀-௿]/.test(t);

  /* ---------- Text preparation ---------- */
  // வாசிக்கும்போது markdown குறியீடுகள், link-கள் தேவையில்லை
  function cleanForSpeech(text) {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[*_#>~|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // நீண்ட உரையைச் சிறு துண்டுகளாகப் பிரி (Android-ல் நீண்டவை நின்றுவிடலாம்)
  function chunkText(text, max) {
    max = max || 180;
    const parts = text.split(/(?<=[.!?।])\s+/);
    const out = [];
    let cur = "";
    parts.forEach((p) => {
      while (p.length > max) {
        let cut = p.lastIndexOf(" ", max);
        if (cut < 20) cut = max;
        if (cur) { out.push(cur); cur = ""; }
        out.push(p.slice(0, cut).trim());
        p = p.slice(cut).trim();
      }
      // தமிழ் / English வாக்கியங்களைத் தனித்தனியாகப் பிரி (ஒவ்வொன்றுக்கும் சரியான குரல்)
      if (cur && (isTamil(cur) !== isTamil(p) || (cur + " " + p).trim().length > max)) { out.push(cur); cur = p; }
      else cur = (cur + " " + p).trim();
    });
    if (cur) out.push(cur);
    return out.filter(Boolean);
  }

  /* ---------- Speaking ---------- */
  function pickVoice(langKey) {
    if (voices.length === 0 && ttsSupported) voices = synth.getVoices() || [];
    const want = langKey === "ta" ? "ta" : "en";
    const saved = savedVoice(want);
    if (saved) {
      const v = voices.find((x) => x.voiceURI === saved);
      if (v) return v;
    }
    const pool = voices.filter((v) => normLang(v.lang).startsWith(want));
    const pref = want === "ta" ? "ta-in" : "en-in";
    return pool.find((v) => normLang(v.lang) === pref) || pool[0] || null;
  }

  function stopSpeak() { if (ttsSupported) synth.cancel(); }
  function isSpeaking() { return ttsSupported && (synth.speaking || synth.pending); }

  function speak(text) {
    if (!ttsSupported) return false;
    const clean = cleanForSpeech(text);
    if (!clean) return false;
    synth.cancel();
    chunkText(clean).forEach((c) => {
      const key = isTamil(c) ? "ta" : "en";
      const u = new SpeechSynthesisUtterance(c);
      u.lang = key === "ta" ? "ta-IN" : "en-IN";
      const v = pickVoice(key);
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = rate();
      synth.speak(u);
    });
    return true;
  }

  function toggleSpeak(text) { if (isSpeaking()) stopSpeak(); else speak(text); }
  function speakIfAuto(text) { if (autoSpeak()) speak(text); }

  /* ---------- Listening (mic) ---------- */
  const ERRORS = {
    "not-allowed": "Mic அனுமதி இல்லை. Chrome → ⋮ → Settings → Site settings → Microphone-ல் இந்த site-க்கு அனுமதியுங்கள்.",
    "service-not-allowed": "Mic அனுமதி இல்லை. Chrome → ⋮ → Settings → Site settings → Microphone-ல் இந்த site-க்கு அனுமதியுங்கள்.",
    "no-speech": "எதுவும் கேட்கவில்லை. மீண்டும் முயலுங்கள்.",
    "audio-capture": "Mic கிடைக்கவில்லை. வேறு app mic-ஐப் பயன்படுத்தலாம்.",
    "network": "Internet தேவை (பேச்சை எழுத்தாக்க Chrome Google சேவையைப் பயன்படுத்துகிறது).",
    "language-not-supported": "இந்த மொழி இந்த phone-ல் ஆதரிக்கப்படவில்லை. Voice screen-ல் வேறு மொழியைத் தேர்ந்தெடுங்கள்."
  };

  function isListening() { return listening; }

  function stopListening() { if (rec) { try { rec.stop(); } catch (e) {} } }

  // opts: { onResult(text), onEnd(finalText, errorMessage|null) }
  function listen(opts) {
    if (!sttSupported) { opts.onEnd("", "இந்த browser-ல் மைக் பேச்சு ஆதரவு இல்லை. Chrome பயன்படுத்துங்கள்."); return; }
    stopSpeak();
    if (JARVIS.wake) JARVIS.wake.yieldMic(); // Hey JARVIS மைக்கை விட்டுக்கொடுக்கும்
    let finalText = "";
    let lastText = "";
    let errMsg = null;

    rec = new SR();
    rec.lang = micLang();
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      lastText = (finalText + interim).trim();
      if (opts.onResult) opts.onResult(lastText);
    };
    rec.onerror = (e) => { errMsg = ERRORS[e.error] || ("மைக் பிழை: " + e.error); };
    rec.onend = () => {
      listening = false;
      rec = null;
      if (JARVIS.wake) JARVIS.wake.resumeMic();
      opts.onEnd((finalText || lastText).trim(), errMsg);
    };

    try {
      rec.start();
      listening = true;
    } catch (e) {
      listening = false;
      rec = null;
      if (JARVIS.wake) JARVIS.wake.resumeMic();
      opts.onEnd("", "மைக்கைத் தொடங்க முடியவில்லை. மீண்டும் முயலுங்கள்.");
    }
  }

  /* ---------- Voice screen ---------- */
  function fillSelect(sel, want) {
    const saved = savedVoice(want);
    sel.innerHTML = "";
    const auto = document.createElement("option");
    auto.value = "";
    auto.textContent = "(இயல்பு – தானாகத் தேர்வு)";
    sel.appendChild(auto);
    const pool = voices.filter((v) => normLang(v.lang).startsWith(want));
    pool.forEach((v) => {
      const o = document.createElement("option");
      o.value = v.voiceURI;
      o.textContent = v.name + " (" + v.lang + ")";
      sel.appendChild(o);
    });
    sel.value = pool.some((v) => v.voiceURI === saved) ? saved : "";
    return pool.length;
  }

  function refreshVoices() {
    if (!ttsSupported) return;
    voices = synth.getVoices() || [];
    const nTa = fillSelect($("voice-ta"), "ta");
    const nEn = fillSelect($("voice-en"), "en");
    $("voice-count").textContent = "கிடைக்கும் குரல்கள் – தமிழ்: " + nTa + ", English: " + nEn;
    $("voice-ta-hint").classList.toggle("hidden", nTa > 0);
  }

  function init() {
    const sup = [];
    sup.push(ttsSupported ? "பேசுதல் ✔" : "பேசுதல் ✖ (இந்த browser-ல் இல்லை)");
    sup.push(sttSupported ? "மைக் கேட்டல் ✔" : "மைக் கேட்டல் ✖ (Chrome பயன்படுத்துங்கள்)");
    $("voice-support").textContent = sup.join("  |  ");

    const a = $("voice-auto"); a.checked = autoSpeak();
    a.addEventListener("change", () => S.set("voiceAuto", a.checked));
    const b = $("voice-autosend"); b.checked = autoSend();
    b.addEventListener("change", () => S.set("voiceAutoSend", b.checked));

    const ml = $("voice-mic-lang"); ml.value = micLang();
    ml.addEventListener("change", () => S.set("voiceMicLang", ml.value));

    $("voice-ta").addEventListener("change", (e) => S.set("voiceTa", e.target.value));
    $("voice-en").addEventListener("change", (e) => S.set("voiceEn", e.target.value));

    const r = $("voice-rate");
    r.value = rate();
    $("voice-rate-val").textContent = rate().toFixed(1) + "x";
    r.addEventListener("input", () => {
      S.set("voiceRate", Number(r.value));
      $("voice-rate-val").textContent = Number(r.value).toFixed(1) + "x";
    });

    $("voice-test-ta").addEventListener("click", () => speak("வணக்கம், நான் ஜார்விஸ். உங்களுக்கு எப்படி உதவலாம்?"));
    $("voice-test-en").addEventListener("click", () => speak("Hello, I am JARVIS. How can I help you?"));
    $("voice-stop").addEventListener("click", stopSpeak);

    if (ttsSupported) {
      refreshVoices();
      synth.addEventListener("voiceschanged", refreshVoices);
      setTimeout(refreshVoices, 1000); // சில phone-ல் குரல்கள் தாமதமாக வரும்
    }
  }

  return {
    init: init, speak: speak, stopSpeak: stopSpeak, toggleSpeak: toggleSpeak, speakIfAuto: speakIfAuto,
    listen: listen, stopListening: stopListening, isListening: isListening, autoSend: autoSend,
    isSpeaking: isSpeaking, isAutoSpeak: autoSpeak,
    ttsSupported: ttsSupported, sttSupported: sttSupported,
    cleanForSpeech: cleanForSpeech, chunkText: chunkText
  };
})();
