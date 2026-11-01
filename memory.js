// JARVIS – Memory module (தனிப்பட்ட நினைவுகள்)
// சேமிக்கும் இடம்: உங்கள் phone-ன் browser storage (JARVIS.storage வழியாக). இன்னும் குறியாக்கம் (encryption) இல்லை.
// Chat-ல் பயன்படுத்தும் switch ON ஆக இருந்தால் மட்டுமே, கேள்விக்குப் பொருத்தமான நினைவுகள் Gemini-க்கு அனுப்பப்படும்.
JARVIS.memory = (function () {
  const S = JARVIS.storage;
  const $ = (id) => document.getElementById(id);
  const KEY = "memories";
  const MAX_TITLE = 100;
  const MAX_TEXT = 5000;
  const DEFAULT_CATS = ["தனிப்பட்ட", "குடும்பம்", "வேலை", "நிதி", "ஆரோக்கியம்", "யோசனை"];

  let items = S.get(KEY, []);
  if (!Array.isArray(items)) items = [];
  let activeCat = "";
  let editingId = null;

  const persist = () => S.set(KEY, items);
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const lower = (s) => String(s || "").toLowerCase();
  const hay = (m) => lower(m.title + " " + m.text + " " + m.category);
  const wordsOf = (s) => lower(s).match(/[\p{L}\p{M}\p{N}]+/gu) || [];

  function useInChat() { return S.get("memUseInChat", false) === true; }

  /* ---------- Data functions (பிற modules-ம் பயன்படுத்தலாம்) ---------- */
  function add(title, text, category) {
    text = String(text || "").trim().slice(0, MAX_TEXT);
    if (!text) return null;
    title = String(title || "").trim().slice(0, MAX_TITLE) || text.slice(0, 30);
    const now = Date.now();
    const m = { id: newId(), title: title, text: text, category: String(category || "").trim().slice(0, 40), created: now, updated: now };
    items.unshift(m);
    persist();
    return m;
  }

  function update(id, title, text, category) {
    const m = items.find((x) => x.id === id);
    if (!m) return null;
    text = String(text || "").trim().slice(0, MAX_TEXT);
    if (!text) return null;
    m.text = text;
    m.title = String(title || "").trim().slice(0, MAX_TITLE) || text.slice(0, 30);
    m.category = String(category || "").trim().slice(0, 40);
    m.updated = Date.now();
    persist();
    return m;
  }

  function remove(id) {
    items = items.filter((x) => x.id !== id);
    persist();
  }

  function search(q, cat) {
    const parts = lower(q).trim().split(/\s+/).filter(Boolean);
    return items
      .filter((m) => (!cat || m.category === cat) && parts.every((p) => hay(m).includes(p)))
      .sort((a, b) => b.updated - a.updated);
  }

  // Gemini-க்கு அனுப்பும் கூடுதல் தகவல் (switch OFF என்றால் எதுவும் அனுப்பப்படாது)
  function contextFor(query) {
    if (!useInChat() || items.length === 0) return "";
    const qw = wordsOf(query).filter((w) => w.length >= 2);
    if (!qw.length) return "";
    const scored = items
      .map((m) => {
        const h = hay(m);
        let s = 0;
        qw.forEach((w) => { if (h.includes(w)) s++; });
        return { m: m, s: s };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8);
    if (!scored.length) return "";
    const lines = scored.map((x) =>
      "- " + (x.m.category ? "[" + x.m.category + "] " : "") + x.m.title + ": " + x.m.text.slice(0, 500));
    return "\n\nThe owner's saved personal notes (use only if relevant to the question; do not repeat them unless asked):\n" + lines.join("\n");
  }

  /* ---------- Screen ---------- */
  function renderCats() {
    const cats = Array.from(new Set(items.map((m) => m.category).filter(Boolean))).sort();
    if (activeCat && cats.indexOf(activeCat) === -1) activeCat = "";

    const box = $("mem-cats");
    box.innerHTML = "";
    const mk = (label, val) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (activeCat === val ? " on" : "");
      b.textContent = label;
      b.addEventListener("click", () => { activeCat = val; render(); });
      box.appendChild(b);
    };
    mk("எல்லாம்", "");
    cats.forEach((c) => mk(c, c));

    const dl = $("mem-cat-list");
    dl.innerHTML = "";
    Array.from(new Set(DEFAULT_CATS.concat(cats))).forEach((c) => {
      const o = document.createElement("option");
      o.value = c;
      dl.appendChild(o);
    });
  }

  function renderList() {
    const list = $("mem-list");
    list.innerHTML = "";
    const found = search($("mem-search").value, activeCat);
    $("mem-count").textContent = found.length + " / " + items.length + " நினைவுகள்";

    if (found.length === 0) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = items.length === 0
        ? "இன்னும் எதுவும் இல்லை. \"＋ புதியது\" அழுத்தி முதல் நினைவைச் சேமியுங்கள்."
        : "பொருந்தும் நினைவு இல்லை.";
      list.appendChild(p);
      return;
    }

    found.forEach((m) => {
      const card = document.createElement("div");
      card.className = "card mem-item";

      const head = document.createElement("div");
      head.className = "mem-head";
      const t = document.createElement("div");
      t.className = "mem-title";
      t.textContent = m.title;
      head.appendChild(t);
      if (m.category) {
        const tag = document.createElement("span");
        tag.className = "mem-tag";
        tag.textContent = m.category;
        head.appendChild(tag);
      }

      const body = document.createElement("div");
      body.className = "mem-text";
      body.textContent = m.text;

      const meta = document.createElement("div");
      meta.className = "mem-meta";
      meta.textContent = new Date(m.updated).toLocaleDateString("ta-IN", { day: "numeric", month: "short", year: "numeric" });

      const act = document.createElement("div");
      act.className = "mem-actions";
      const eb = document.createElement("button");
      eb.type = "button";
      eb.className = "btn ghost small";
      eb.textContent = "திருத்து";
      eb.addEventListener("click", () => openForm(m));
      const db = document.createElement("button");
      db.type = "button";
      db.className = "btn ghost danger small";
      db.textContent = "அழி";
      db.addEventListener("click", () => {
        if (confirm("இந்த நினைவை அழிக்கவா?")) { remove(m.id); render(); }
      });
      act.appendChild(eb);
      act.appendChild(db);

      card.appendChild(head);
      card.appendChild(body);
      card.appendChild(meta);
      card.appendChild(act);
      list.appendChild(card);
    });
  }

  function render() { renderCats(); renderList(); }

  function openForm(m) {
    editingId = m ? m.id : null;
    $("mem-title").value = m ? m.title : "";
    $("mem-text").value = m ? m.text : "";
    $("mem-cat").value = m ? m.category : "";
    $("mem-form-title").textContent = m ? "நினைவைத் திருத்து" : "புதிய நினைவு";
    $("mem-form").classList.remove("hidden");
    $("mem-text").focus();
    $("mem-form").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeForm() {
    editingId = null;
    $("mem-form").classList.add("hidden");
  }

  /* ---------- Backup / Restore ---------- */
  function exportBackup() {
    if (items.length === 0) { alert("Backup எடுக்க நினைவுகள் இல்லை."); return; }
    const data = { app: "jarvis", type: "memory-backup", version: 1, items: items };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "jarvis-memory-backup.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const list = data && data.type === "memory-backup" && Array.isArray(data.items) ? data.items : null;
        if (!list) throw new Error("bad");
        const have = new Set(items.map((m) => m.id));
        let added = 0;
        list.forEach((m) => {
          if (!m || typeof m.text !== "string" || !m.text.trim()) return;
          const id = typeof m.id === "string" && m.id ? m.id : newId();
          if (have.has(id)) return;
          const now = Date.now();
          items.push({
            id: id,
            title: String(m.title || m.text).slice(0, MAX_TITLE),
            text: m.text.slice(0, MAX_TEXT),
            category: String(m.category || "").slice(0, 40),
            created: Number(m.created) || now,
            updated: Number(m.updated) || now
          });
          have.add(id);
          added++;
        });
        persist();
        render();
        alert(added + " நினைவுகள் சேர்க்கப்பட்டன.");
      } catch (e) {
        alert("இது சரியான JARVIS Backup file அல்ல.");
      }
    };
    reader.readAsText(file);
  }

  /* ---------- Start ---------- */
  function init() {
    $("mem-search").addEventListener("input", renderList);
    $("mem-add-btn").addEventListener("click", () => openForm(null));
    $("mem-cancel").addEventListener("click", closeForm);
    $("mem-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const title = $("mem-title").value, text = $("mem-text").value, cat = $("mem-cat").value;
      if (!text.trim()) { $("mem-text").focus(); return; }
      if (editingId) update(editingId, title, text, cat); else add(title, text, cat);
      closeForm();
      render();
    });
    $("mem-export").addEventListener("click", exportBackup);
    $("mem-import-btn").addEventListener("click", () => $("mem-import").click());
    $("mem-import").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importBackup(f);
      e.target.value = "";
    });
    const toggle = $("mem-use-chat");
    toggle.checked = useInChat();
    toggle.addEventListener("change", () => S.set("memUseInChat", toggle.checked));
    render();
  }

  return { init: init, add: add, update: update, remove: remove, search: search, contextFor: contextFor };
})();
