// JARVIS – Chat interface
JARVIS.chat = (function () {
  const S = JARVIS.storage;
  let history = S.get("chat", []);
  let busy = false;

  const $ = (id) => document.getElementById(id);

  function addBubble(kind, text) {
    const div = document.createElement("div");
    div.className = "msg " + kind;
    div.textContent = text; // textContent = பாதுகாப்பானது (HTML injection இல்லை)
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
    if (!text || busy) return;
    busy = true;
    $("send-btn").disabled = true;

    history.push({ role: "user", text });
    addBubble("user", text);
    save();

    const wait = addBubble("ai", "");
    wait.innerHTML = '<span class="typing">● ● ●</span>';

    try {
      const reply = await JARVIS.gemini.ask(history);
      history.push({ role: "ai", text: reply });
      save();
      wait.textContent = reply;
    } catch (e) {
      wait.className = "msg err";
      wait.textContent = e.message;
      history.pop(); // தோல்வியான கேள்வியை வரலாற்றிலிருந்து நீக்கு (மீண்டும் முயல)
      save();
    }
    $("messages").scrollTop = $("messages").scrollHeight;
    busy = false;
    $("send-btn").disabled = false;
  }

  function clear() { history = []; S.remove("chat"); render(); }

  function init() {
    render();
    const input = $("chat-input");
    $("chat-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const t = input.value;
      input.value = "";
      input.style.height = "auto";
      send(t);
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });
  }

  return { init, clear };
})();
