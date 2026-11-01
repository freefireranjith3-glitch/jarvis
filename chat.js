// JARVIS – Chat interface (எழுத்து + குரல்)
JARVIS.chat = (function () {
  const S = JARVIS.storage;
  let history = S.get("chat", []);
  let busy = false;

  const $ = (id) => document.getElementById(id);

  // AI பதிலை எழுதி, வாசிக்கும் 🔊 பொத்தானைச் சேர்
  function setAiText(div, text) {
    div.textContent = text; // textContent = பாதுகாப்பானது (HTML injection இல்லை)
    if (text && JARVIS.voice && JARVIS.voice.ttsSupported) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "spk";
      b.textContent = "🔊";
      b.title = "வாசி / நிறுத்து";
      b.addEventListener("click", () => JARVIS.voice.toggleSpeak(text));
      div.appendChild(b);
    }
  }

  function addBubble(kind, text) {
    const div = document.createElement("div");
    div.className = "msg " + kind;
    if (kind === "ai") setAiText(div, text); else div.textContent = text;
    $("messages").appendChild(div);
    $("messages").scrollTop = $("messages").scrollHeight;
    return div;
  }

  function save() {
    history = history.slice(-JARVIS.config.maxHistory);
    S.set("chat", history);
  }

  function render() {
    $("messages").innerHTML = "";
    if (history.length === 0) {
      addBubble("ai", "வணக்கம்! நான் JARVIS. உங்களுக்கு எப்படி உதவலாம்?");
    }
    history.forEach((m) => addBubble(m.role === "user" ? "user" : "ai", m.text));
  }

  async function send(text) {
    text = text.trim();
    if (!text || busy) return null;
    busy = true;
    $("send-btn").disabled = true;

    history.push({ role: "user", text });
    addBubble("user", text);
    save();

    let result = null;
    const wait = addBubble("ai", "");
    wait.innerHTML = '<span class="typing">● ● ●</span>';

    try {
      const reply = await JARVIS.gemini.ask(history);
      history.push({ role: "ai", text: reply });
      result = reply;
      save();
      wait.innerHTML = "";
      setAiText(wait, reply);
      if (JARVIS.voice) JARVIS.voice.speakIfAuto(reply);
    } catch (e) {
      wait.className = "msg err";
      wait.textContent = e.message;
      history.pop(); // தோல்வியான கேள்வியை வரலாற்றிலிருந்து நீக்கு (மீண்டும் முயல)
      save();
    }
    $("messages").scrollTop = $("messages").scrollHeight;
    busy = false;
    $("send-btn").disabled = false;
    return result;
  }

  function clear() { history = []; S.remove("chat"); render(); }

  function initMic(input) {
    const mic = $("mic-btn");
    if (!JARVIS.voice || !JARVIS.voice.sttSupported) { mic.classList.add("hidden"); return; }

    mic.addEventListener("click", () => {
      const V = JARVIS.voice;
      if (V.isListening()) { V.stopListening(); return; }
      mic.classList.add("rec");
      input.placeholder = "கேட்கிறேன்… பேசுங்கள்";
      V.listen({
        onResult: (t) => { input.value = t; },
        onEnd: (finalText, err) => {
          mic.classList.remove("rec");
          input.placeholder = "JARVIS-இடம் கேளுங்கள்…";
          if (err) { addBubble("err", err); return; }
          if (!finalText) return;
          if (V.autoSend()) { input.value = ""; send(finalText); }
          else { input.value = finalText; input.focus(); }
        }
      });
    });
  }

  function init() {
    render();
    const input = $("chat-input");
    $("chat-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const t = input.value;
      input.value = "";
      input.style.height = "auto";
      if (JARVIS.voice) JARVIS.voice.stopSpeak();
      send(t);
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });
    initMic(input);
  }

  return { init, clear, send };
})();
