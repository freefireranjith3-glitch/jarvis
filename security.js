// JARVIS – PIN Lock (உண்மையான hashing)
// PIN-ஐ நேரடியாகச் சேமிப்பதில்லை. PBKDF2 (Web Crypto) மூலம் salt சேர்த்து hash மட்டுமே சேமிக்கப்படும்.
// குறிப்பு: இது app-ன் திரையைப் பூட்டுகிறது. Data encryption (Vault) அடுத்த கட்டத்தில் வரும்.
// Biometric (fingerprint) அடுத்த கட்டத்தில் WebAuthn மூலம் சேர்க்கப்படும்.
JARVIS.security = (function () {
  const S = JARVIS.storage;
  const ITER = 200000;

  const enc = (s) => new TextEncoder().encode(s);
  const toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const fromHex = (hex) => new Uint8Array(hex.match(/.{2}/g).map((h) => parseInt(h, 16)));

  async function hashPin(pin, saltBytes) {
    const key = await crypto.subtle.importKey("raw", enc(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: saltBytes, iterations: ITER, hash: "SHA-256" }, key, 256);
    return toHex(bits);
  }

  function hasPin() { return !!S.get("pin", null); }

  async function setPin(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await hashPin(pin, salt);
    S.set("pin", { salt: toHex(salt), hash: hash });
    S.remove("pinFails");
  }

  function removePin() { S.remove("pin"); S.remove("pinFails"); }

  // தவறான முயற்சிகள்: 5-க்குப் பின் 30 விநாடி காத்திருப்பு
  function lockedOutSeconds() {
    const f = S.get("pinFails", { count: 0, until: 0 });
    const left = Math.ceil((f.until - Date.now()) / 1000);
    return left > 0 ? left : 0;
  }

  async function verifyPin(pin) {
    const wait = lockedOutSeconds();
    if (wait > 0) return { ok: false, wait };
    const rec = S.get("pin", null);
    if (!rec) return { ok: true };
    const hash = await hashPin(pin, fromHex(rec.salt));
    if (hash === rec.hash) {
      S.remove("pinFails");
      return { ok: true };
    }
    const f = S.get("pinFails", { count: 0, until: 0 });
    f.count += 1;
    if (f.count >= 5) { f.until = Date.now() + 30000; f.count = 0; }
    S.set("pinFails", f);
    return { ok: false, wait: lockedOutSeconds() };
  }

  return { hasPin, setPin, removePin, verifyPin, lockedOutSeconds };
})();
