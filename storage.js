// JARVIS – Local storage helper. எல்லா data-வும் உங்கள் phone-லேயே இருக்கும்.
// எதிர்காலத்தில் Memory/Vault modules இதே இடத்தைப் பயன்படுத்தும்.
JARVIS.storage = (function () {
  const PREFIX = "jarvis.";

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
  function remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) {}
  }

  return { get, set, remove };
})();
