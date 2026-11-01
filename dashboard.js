// JARVIS – Home dashboard
JARVIS.dashboard = (function () {
  const $ = (id) => document.getElementById(id);

  function greeting() {
    const h = new Date().getHours();
    const part = h < 12 ? "காலை வணக்கம்" : h < 17 ? "மதிய வணக்கம்" : h < 21 ? "மாலை வணக்கம்" : "இனிய இரவு வணக்கம்";
    return part + ". JARVIS தயார்.";
  }

  function tickClock() {
    const d = new Date();
    $("clock").textContent = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
    $("date").textContent = d.toLocaleDateString("ta-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  function refreshStatus() {
    const online = navigator.onLine;
    $("st-ai").textContent = JARVIS.gemini.getKey() ? "தயார் ✔" : "Key தேவை";
    $("st-net").textContent = online ? "Online" : "Offline";
    $("st-pin").textContent = JARVIS.security.hasPin() ? "ON 🔒" : "OFF";
    $("st-model").textContent = JARVIS.gemini.getModel();
    $("net-dot").classList.toggle("on", online);
    $("greeting").textContent = greeting();
  }

  function renderModules(onOpen) {
    const box = $("modules");
    box.innerHTML = "";
    JARVIS.modules.forEach((m) => {
      const b = document.createElement("button");
      b.className = "card module " + (m.status === "live" ? "live" : "");
      b.innerHTML = '<div class="ic"></div><div class="nm"></div><div class="tag"></div>';
      b.querySelector(".ic").textContent = m.icon;
      b.querySelector(".nm").textContent = m.name;
      b.querySelector(".tag").textContent = m.status === "live" ? "● செயலில்" : "○ விரைவில்";
      b.addEventListener("click", () => onOpen(m));
      box.appendChild(b);
    });
  }

  function init(onOpen) {
    renderModules(onOpen);
    tickClock();
    refreshStatus();
    setInterval(tickClock, 1000);
    window.addEventListener("online", refreshStatus);
    window.addEventListener("offline", refreshStatus);
  }

  return { init, refreshStatus };
})();
