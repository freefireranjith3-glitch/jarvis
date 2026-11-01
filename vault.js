// JARVIS – File Vault (பாதுகாப்பான ஆவணக் களஞ்சியம்)
// உண்மையான குறியாக்கம்:
//  - Vault கடவுச்சொல் -> PBKDF2 (SHA-256, 600,000 சுற்றுகள், தனி random salt) -> AES-256-GCM சாவி
//  - ஒவ்வொரு file-ம், அதன் பெயர்/வகை/அளவு விவரமும் தனித்தனியாக, random IV-உடன் குறியாக்கம் செய்யப்படும்
//  - சாவி நினைவகத்தில் (memory) மட்டும் இருக்கும்; எங்கும் சேமிக்கப்படாது. Lock செய்தால் அழிந்துவிடும்.
//  - சேமிக்கும் இடம்: உங்கள் phone-ன் IndexedDB. எங்கும் upload ஆகாது.
// எச்சரிக்கை: Vault கடவுச்சொல்லை மறந்தால் மீட்க வழியே இல்லை (எங்களிடமும் சாவி இல்லை).
JARVIS.vault = (function () {
  const $ = (id) => document.getElementById(id);
  const DB_NAME = "jarvis-vault";
  const ITER = 600000;
  const MIN_PASS = 8;
  const MAX_FILE = 30 * 1024 * 1024; // 30 MB (memory வரம்பு)
  const CHECK_TEXT = "JARVIS-VAULT-OK";

  let key = null;        // CryptoKey (memory-ல் மட்டும்)
  let entries = [];      // குறியாக்கம் நீக்கிய file விவரங்கள் (unlock ஆனபோது மட்டும்)
  let busy = false;
  let dbPromise = null;

  const enc = (s) => new TextEncoder().encode(s);
  const dec = (b) => new TextDecoder().decode(b);

  /* ---------- IndexedDB ---------- */
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          d.createObjectStore("config", { keyPath: "k" });
          d.createObjectStore("fmeta", { keyPath: "id" });
          d.createObjectStore("fdata", { keyPath: "id" });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }
  // request-ன் முடிவைப் பெற
  function getReq(stores, mode, fn) {
    return db().then((d) => new Promise((resolve, reject) => {
      const tx = d.transaction(stores, mode);
      const req = fn(tx);
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }
  const idbGet = (store, k) => getReq([store], "readonly", (tx) => tx.objectStore(store).get(k));
  const idbAll = (store) => getReq([store], "readonly", (tx) => tx.objectStore(store).getAll());
  const idbPut = (store, v) => getReq([store], "readwrite", (tx) => tx.objectStore(store).put(v));
  const idbDel = (store, k) => getReq([store], "readwrite", (tx) => tx.objectStore(store).delete(k));

  /* ---------- Crypto ---------- */
  async function deriveKey(pass, salt, iter) {
    const base = await crypto.subtle.importKey("raw", enc(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  // வெளியீடு: IV (12 bytes) + ciphertext
  async function encrypt(k, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, k, bytes));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv, 0);
    out.set(ct, 12);
    return out.buffer;
  }
  async function decrypt(k, buf) {
    const b = new Uint8Array(buf);
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: b.slice(0, 12) }, k, b.slice(12));
  }

  /* ---------- Vault செயல்கள் (DOM தேவையில்லை) ---------- */
  async function exists() { return !!(await idbGet("config", "main")); }
  function isUnlocked() { return key !== null; }

  async function setup(pass) {
    if (typeof pass !== "string" || pass.length < MIN_PASS) throw new Error("short");
    if (await exists()) throw new Error("exists");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const k = await deriveKey(pass, salt, ITER);
    const check = await encrypt(k, enc(CHECK_TEXT));
    await idbPut("config", { k: "main", salt: salt.buffer, iter: ITER, check: check });
    key = k;
    entries = [];
    return true;
  }

  async function unlock(pass) {
    const cfg = await idbGet("config", "main");
    if (!cfg) throw new Error("novault");
    const k = await deriveKey(pass, new Uint8Array(cfg.salt), cfg.iter);
    let ok = false;
    try { ok = dec(await decrypt(k, cfg.check)) === CHECK_TEXT; } catch (e) { ok = false; }
    if (!ok) throw new Error("wrong");
    key = k;
    await loadEntries();
    return true;
  }

  function lock() {
    key = null;
    entries = [];
  }

  async function loadEntries() {
    const metas = await idbAll("fmeta");
    const out = [];
    for (const m of metas) {
      try {
        const info = JSON.parse(dec(await decrypt(key, m.meta)));
        out.push({ id: m.id, name: info.name, type: info.type, size: info.size, added: info.added });
      } catch (e) {
        out.push({ id: m.id, name: "(படிக்க முடியவில்லை)", type: "", size: 0, added: 0, broken: true });
      }
    }
    out.sort((a, b) => b.added - a.added);
    entries = out;
  }

  async function addFile(name, type, bytes) {
    if (!key) throw new Error("locked");
    if (bytes.byteLength > MAX_FILE) throw new Error("toobig");
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const info = { name: String(name || "file"), type: String(type || ""), size: bytes.byteLength, added: Date.now() };
    const meta = await encrypt(key, enc(JSON.stringify(info)));
    const data = await encrypt(key, bytes);
    // தரவு முதலில், விவரம் பின்னர் (பாதியில் நின்றால் பட்டியலில் வராது)
    await idbPut("fdata", { id: id, data: data });
    await idbPut("fmeta", { id: id, meta: meta });
    entries.unshift({ id: id, name: info.name, type: info.type, size: info.size, added: info.added });
    return id;
  }

  async function getFile(id) {
    if (!key) throw new Error("locked");
    const e = entries.find((x) => x.id === id);
    const rec = await idbGet("fdata", id);
    if (!e || !rec) throw new Error("missing");
    const bytes = await decrypt(key, rec.data);
    return { name: e.name, type: e.type || "application/octet-stream", bytes: bytes };
  }

  async function removeFile(id) {
    await idbDel("fmeta", id);
    await idbDel("fdata", id);
    entries = entries.filter((x) => x.id !== id);
  }

  async function destroy() {
    lock();
    await getReq(["config", "fmeta", "fdata"], "readwrite", (tx) => {
      tx.objectStore("config").clear();
      tx.objectStore("fmeta").clear();
      return tx.objectStore("fdata").clear();
    });
  }

  /* ---------- Screen ---------- */
  const fmtSize = (n) => n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB";
  const msg = (t, bad) => { const m = $("vault-msg"); m.textContent = t || ""; m.className = bad ? "error" : "muted"; };
  function setBusy(b) {
    busy = b;
    ["vault-setup-btn", "vault-unlock-btn", "vault-add-btn", "vault-lock-btn"].forEach((id) => { $(id).disabled = b; });
  }

  async function refresh() {
    let has = false;
    try { has = await exists(); } catch (e) {
      $("vault-setup").classList.add("hidden");
      $("vault-locked").classList.add("hidden");
      $("vault-open").classList.add("hidden");
      msg("இந்த browser-ல் Vault சேமிப்பு கிடைக்கவில்லை (private mode-ஆ?).", true);
      return;
    }
    $("vault-setup").classList.toggle("hidden", has);
    $("vault-locked").classList.toggle("hidden", !has || isUnlocked());
    $("vault-open").classList.toggle("hidden", !isUnlocked());
    if (isUnlocked()) renderList();
  }

  function renderList() {
    const list = $("vault-list");
    list.innerHTML = "";
    const total = entries.reduce((s, e) => s + (e.size || 0), 0);
    $("vault-count").textContent = entries.length + " file – மொத்தம் " + fmtSize(total);
    if (entries.length === 0) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "Vault காலியாக உள்ளது. \"＋ File சேர்\" அழுத்துங்கள்.";
      list.appendChild(p);
      return;
    }
    entries.forEach((e) => {
      const card = document.createElement("div");
      card.className = "card mem-item";
      const t = document.createElement("div");
      t.className = "mem-title";
      t.textContent = "📄 " + e.name;
      const meta = document.createElement("div");
      meta.className = "mem-meta";
      meta.textContent = fmtSize(e.size) + " · " + new Date(e.added).toLocaleDateString("ta-IN", { day: "numeric", month: "short", year: "numeric" });
      const act = document.createElement("div");
      act.className = "mem-actions";
      if (!e.broken) {
        const dl = document.createElement("button");
        dl.type = "button";
        dl.className = "btn ghost small";
        dl.textContent = "பதிவிறக்கு";
        dl.addEventListener("click", () => download(e.id));
        act.appendChild(dl);
      }
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "btn ghost danger small";
      rm.textContent = "அழி";
      rm.addEventListener("click", async () => {
        if (!confirm("\"" + e.name + "\" நிரந்தரமாக அழிக்கப்படும். தொடரவா?")) return;
        await removeFile(e.id);
        renderList();
      });
      act.appendChild(rm);
      card.appendChild(t);
      card.appendChild(meta);
      card.appendChild(act);
      list.appendChild(card);
    });
  }

  async function download(id) {
    if (busy) return;
    setBusy(true);
    msg("குறியாக்கம் நீக்குகிறது…");
    try {
      const f = await getFile(id);
      const url = URL.createObjectURL(new Blob([f.bytes], { type: f.type }));
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      msg("பதிவிறக்கப்பட்டது. ⚠ பதிவிறக்கிய நகல் குறியாக்கம் இல்லாதது – தேவை முடிந்ததும் அழித்துவிடுங்கள்.");
    } catch (e) {
      msg("பிழை: file-ஐத் திறக்க முடியவில்லை.", true);
    }
    setBusy(false);
  }

  async function onSetup() {
    const p1 = $("vault-pass1").value, p2 = $("vault-pass2").value;
    if (p1.length < MIN_PASS) return msg("கடவுச்சொல் குறைந்தது " + MIN_PASS + " எழுத்துகள் இருக்க வேண்டும்.", true);
    if (p1 !== p2) return msg("இரண்டு கடவுச்சொல்லும் பொருந்தவில்லை.", true);
    if (!$("vault-ack").checked) return msg("கடவுச்சொல்லை மறந்தால் மீட்க முடியாது என்பதை ஏற்றுக்கொள்ளுங்கள்.", true);
    setBusy(true);
    msg("சாவி உருவாக்குகிறது… (சில விநாடி ஆகலாம்)");
    try {
      await setup(p1);
      $("vault-pass1").value = "";
      $("vault-pass2").value = "";
      $("vault-ack").checked = false;
      if (navigator.storage && navigator.storage.persist) { try { await navigator.storage.persist(); } catch (e) {} }
      msg("Vault உருவாக்கப்பட்டது ✔");
    } catch (e) {
      msg("Vault உருவாக்க முடியவில்லை.", true);
    }
    setBusy(false);
    refresh();
  }

  async function onUnlock() {
    const p = $("vault-pass").value;
    if (!p) return;
    setBusy(true);
    msg("திறக்கிறது…");
    try {
      await unlock(p);
      $("vault-pass").value = "";
      msg("");
    } catch (e) {
      msg(e.message === "wrong" ? "தவறான கடவுச்சொல்." : "திறக்க முடியவில்லை.", true);
    }
    setBusy(false);
    refresh();
  }

  async function onFiles(files) {
    if (!files || !files.length) return;
    setBusy(true);
    let ok = 0, skipped = 0;
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE) { skipped++; continue; }
      msg("குறியாக்கம் செய்கிறது: " + f.name);
      try { await addFile(f.name, f.type, await f.arrayBuffer()); ok++; } catch (e) { skipped++; }
    }
    msg(ok + " file சேர்க்கப்பட்டது." + (skipped ? " " + skipped + " தவிர்க்கப்பட்டது (30 MB-க்கு மேல் அல்லது பிழை)." : ""), skipped > 0 && ok === 0);
    setBusy(false);
    renderList();
  }

  function lockNow() { lock(); msg(""); refresh(); }

  function init() {
    $("vault-setup-btn").addEventListener("click", onSetup);
    $("vault-unlock-btn").addEventListener("click", onUnlock);
    $("vault-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") onUnlock(); });
    $("vault-lock-btn").addEventListener("click", lockNow);
    $("vault-add-btn").addEventListener("click", () => $("vault-file").click());
    $("vault-file").addEventListener("change", (e) => { onFiles(e.target.files); e.target.value = ""; });
    $("vault-destroy").addEventListener("click", async () => {
      if (!confirm("Vault-ல் உள்ள எல்லா file-களும் நிரந்தரமாக அழியும். கடவுச்சொல் மறந்தவர்களுக்கு மட்டுமே இது. தொடரவா?")) return;
      if (!confirm("உறுதியாகவா? இதைத் திரும்பப் பெற முடியாது.")) return;
      try { await destroy(); msg("Vault அழிக்கப்பட்டது."); } catch (e) { msg("அழிக்க முடியவில்லை.", true); }
      refresh();
    });

    // App background-ல் சென்றால் Vault-ஐப் பூட்டு
    let hiddenAt = 0;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      if (isUnlocked() && hiddenAt && Date.now() - hiddenAt > JARVIS.config.autoLockSeconds * 1000) lockNow();
    });
    refresh();
  }

  return {
    init: init, refresh: refresh, lock: lockNow, isUnlocked: isUnlocked,
    // சோதனை / எதிர்கால modules-க்கு
    api: { exists: exists, setup: setup, unlock: unlock, lock: lock, addFile: addFile, getFile: getFile, removeFile: removeFile, destroy: destroy, list: () => entries.slice(), deriveKey: deriveKey, encrypt: encrypt, decrypt: decrypt }
  };
})();
