/* JARVIS Voice Control - browser-based starter module
 * Supports Tamil + English speech recognition where the browser provides
 * the Web Speech API. This is NOT guaranteed to listen while the app is
 * backgrounded or the phone is locked.
 */
(function () {
  "use strict";

  window.JARVIS = window.JARVIS || {};

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  let recognition = null;
  let listening = false;
  let wakePhraseRequired = true;
  let currentLanguage = "ta-IN";

  function emit(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function normalize(text) {
    return String(text || "").trim().toLowerCase();
  }

  function extractCommand(transcript) {
    const original = String(transcript || "").trim();
    const lower = normalize(original);
    const wakePhrases = [
      "hey jarvis", "ok jarvis", "ஏய் ஜார்விஸ்", "ஹே ஜார்விஸ்",
      "ஜார்விஸ்"
    ];

    for (const phrase of wakePhrases) {
      const index = lower.indexOf(phrase.toLowerCase());
      if (index !== -1) {
        return original.slice(index + phrase.length).replace(/^[\s,.:;!-]+/, "").trim();
      }
    }
    return wakePhraseRequired ? null : original;
  }

  function createRecognition() {
    if (!SpeechRecognition) {
      emit("jarvis:voice-error", {
        message: "இந்த browser-ல் Speech Recognition ஆதரவு இல்லை."
      });
      return null;
    }

    const rec = new SpeechRecognition();
    rec.lang = currentLanguage;
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = function () {
      listening = true;
      emit("jarvis:voice-start");
    };

    rec.onresult = function (event) {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) continue;
        const transcript = event.results[i][0].transcript || "";
        const command = extractCommand(transcript);

        emit("jarvis:voice-transcript", {
          transcript: transcript,
          command: command
        });

        if (command) {
          emit("jarvis:voice-command", {
            command: command,
            transcript: transcript,
            language: currentLanguage
          });
        }
      }
    };

    rec.onerror = function (event) {
      emit("jarvis:voice-error", {
        message: event.error || "Voice recognition error"
      });
    };

    rec.onend = function () {
      listening = false;
      emit("jarvis:voice-stop");
      // Do not automatically restart. User must tap Start again.
    };

    return rec;
  }

  function start(options) {
    options = options || {};
    if (!SpeechRecognition) {
      emit("jarvis:voice-error", {
        message: "Chrome போன்ற ஆதரவு உள்ள browser-ல் முயற்சி செய்யவும்."
      });
      return false;
    }
    if (listening) return true;

    currentLanguage = options.language || currentLanguage;
    wakePhraseRequired = options.wakePhraseRequired !== false;

    try {
      recognition = createRecognition();
      if (!recognition) return false;
      recognition.lang = currentLanguage;
      recognition.start();
      return true;
    } catch (error) {
      emit("jarvis:voice-error", { message: error.message });
      return false;
    }
  }

  function stop() {
    if (recognition) {
      try { recognition.stop(); } catch (_) {}
    }
    listening = false;
  }

  function setLanguage(language) {
    if (language !== "ta-IN" && language !== "en-IN" && language !== "en-US") {
      throw new Error("Supported languages: ta-IN, en-IN, en-US");
    }
    currentLanguage = language;
    if (listening) {
      stop();
      start({ language: currentLanguage, wakePhraseRequired: wakePhraseRequired });
    }
  }

  function speak(text, options) {
    if (!("speechSynthesis" in window)) {
      emit("jarvis:voice-error", { message: "Text-to-Speech ஆதரவு இல்லை." });
      return false;
    }
    const utterance = new SpeechSynthesisUtterance(String(text || ""));
    utterance.lang = (options && options.language) || "ta-IN";
    utterance.rate = (options && options.rate) || 1;
    utterance.pitch = (options && options.pitch) || 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.lang.toLowerCase() === utterance.lang.toLowerCase() &&
      /female|zira|samantha|heera/i.test(v.name)
    );
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return true;
  }

  window.JARVIS.voice = {
    supported: !!SpeechRecognition,
    start: start,
    stop: stop,
    speak: speak,
    setLanguage: setLanguage,
    isListening: function () { return listening; }
  };
})();
