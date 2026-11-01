// JARVIS – Main controller: navigation, lock screen, settings
(function () {
  const $ = (id) => document.getElementById(id);
  const S = JARVIS.storage;
  const Sec = JARVIS.security;

  /* ---------- Navigation ---------- */
  function go(view) {
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    $("view-" + view).classList.add("active");
    document.querySelectorAll(".bottom button").forEach((b) => b.classList.toggle("active", b.dataset.go === view));
    if (view === "home") JARVIS.dashboard.refreshStatus();
  }

  function openModule(m) {
    if (m.view) return go(m.view);
    $("module-title").textContent = m.icon + " " + m.name;
    $("module-desc").textContent = m.desc;
    go("module");
  }

  document.querySelectorAll("[data-go]").forEach((el) =>
    el.addEventListener("click", () => go(el.dataset.go)));

  /* ---------- Lock screen ---------- */
  let lockMode = "unlock"; // "unlock" | "setup"

  function showLock(mode) {
    lockMode = mode;
    $("lock").classList.remove("hidden");
    $("lock-input").value = "";
    $("lock-input2").value = "";
    $("lock-msg").textContent = "";
    const setup = mode === "setup";
    $("lock-input2").classList.toggle("hidden", !setup);
    $("lock-skip").classList.toggle("hidden", !setup);
    $("lock-title").textContent = setup ? "புதிய PIN அமைக்கவும்" : "PIN உள்ளிடவும்";
    $("lock-sub").textContent = setup ? "4 முதல் 8 எண்கள்" : "JARVIS பூட்டப்பட்டுள்ளது";
    $("lock-btn").textContent = setup ? "PIN சேமி" : "திற";
    setTimeout(() => $("lock-input").focus(), 50);
  }
  function hideLock() { $("lock").classList.add("hidden"); JARVIS.dashboard.refreshStatus(); }

  async function submitLock() {
    const pin = $("lock-input").value;
    const msg = $("lock-msg");
    if (!/^\d{4,8}$/.test(pin)) { msg.textContent = "PIN 4 முதல் 8 எண்களாக இருக்க வேண்டும்."; return; }

    if (lockMode === "setup") {
      if (pin !== $("lock-input2").value) { msg.textContent = "இரண்டு PIN-ம் பொருந்தவில்லை."; return; }
      await Sec.setPin(pin);
      hideLock();
      return;
    }
    const r = await Sec.verifyPin(pin);
    if (r.ok) hideLock();
    else {
      $("lock-input").value = "";
      msg.textContent = r.wait ? r.wait + " விநாடி காத்திருக்கவும்." : "தவறான PIN.";
    }
  }
  $("lock-btn").addEventListener("click", submitLock);
  $("lock-input").addEventListener("keydown", (e) => { if (e.key === "Enter" && lockMode === "unlock") submitLock(); });
  $("lock-skip").addEventListener("click", hideLock);

  // App background-ல் சென்று திரும்பினால் தானாகப் பூட்டு
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (Sec.hasPin() && hiddenAt && Date.now() - hiddenAt > JARVIS.config.autoLockSeconds * 1000) showLock("unlock");
  });

  /* ---------- Settings ---------- */
  function loadSettings() {
    $("api-key").value = JARVIS.gemini.getKey();
    $("model-name").value = JARVIS.gemini.getModel();
  }
  const note = (t) => ($("settings-msg").textContent = t);

  $("save-settings").addEventListener("click", () => {
    JARVIS.gemini.setKey($("api-key").value.trim());
    JARVIS.gemini.setModel($("model-name").value.trim() || JARVIS.config.defaultModel);
    JARVIS.dashboard.refreshStatus();
    note("சேமிக்கப்பட்டது ✔");
  });

  $("test-key").addEventListener("click", async () => {
    JARVIS.gemini.setKey($("api-key").value.trim());
    JARVIS.gemini.setModel($("model-name").value.trim() || JARVIS.config.defaultModel);
    note("சோதிக்கிறது…");
    try {
      await JARVIS.gemini.ask([{ role: "user", text: "Reply with one word: OK" }], { noMemory: true });
      note("Key சரியாக வேலை செய்கிறது ✔");
    } catch (e) { note("✖ " + e.message); }
    JARVIS.dashboard.refreshStatus();
  });

  $("clear-key").addEventListener("click", () => {
    if (!confirm("API key-ஐ அழிக்கவா?")) return;
    JARVIS.gemini.clearKey(); $("api-key").value = ""; JARVIS.dashboard.refreshStatus(); note("Key அழிக்கப்பட்டது.");
  });
  $("clear-chat").addEventListener("click", () => {
    if (confirm("Chat வரலாற்றை அழிக்கவா?")) { JARVIS.chat.clear(); note("Chat அழிக்கப்பட்டது."); }
  });
  $("pin-set").addEventListener("click", () => showLock("setup"));
  $("pin-remove").addEventListener("click", () => {
    if (!Sec.hasPin()) return note("PIN அமைக்கப்படவில்லை.");
    if (confirm("PIN-ஐ நீக்கவா?")) { Sec.removePin(); JARVIS.dashboard.refreshStatus(); note("PIN நீக்கப்பட்டது."); }
  });

  /* ---------- Start ---------- */
  JARVIS.dashboard.init(openModule);
  JARVIS.chat.init();
  JARVIS.memory.init();
  JARVIS.voice.init();
  loadSettings();
  if (Sec.hasPin()) showLock("unlock");

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
