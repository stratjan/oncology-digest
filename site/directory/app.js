// =====================
// Einstellungen
// =====================

// Wenn dein Publish-Root "site/" ist, liegt contacts.example.json unter /directory/… (ohne /site Präfix)
const CONTACTS_URL = "/directory/contacts.example.json";

// Felder, die durchsucht werden
const SEARCH_FIELDS = [
  "salutation", "firstName", "lastName", "fullName",
  "department1", "department2", "position",
  "phoneWork", "phoneWork2", "mobile", "fax", "phoneOther", "pager",
  "emailDisplay"
];

let CONTACTS = [];
let FILTERED = [];

// =====================
// Utilities
// =====================

const norm = (v) => (v ?? "").toString().trim().toLowerCase();

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, m => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[m]));
}

function telHref(val) {
  return `tel:${(val || "").toString().replace(/[^+\d]/g, "")}`;
}

function debounce(fn, delay = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), delay);
  };
}

// =====================
// Laden & Initialisieren
// =====================

async function loadContacts() {
  // Robust: mehrere Kandidatenpfade testen (optional)
  const candidates = [
    new URL(CONTACTS_URL, window.location.origin).toString(),
    new URL("/site/directory/contacts.example.json", window.location.origin).toString()
  ];

  let data = null, usedUrl = null;
  for (const u of candidates) {
    try {
      const res = await fetch(u, { cache: "no-store" });
      if (res.ok) {
        data = await res.json();
        usedUrl = u;
        console.info("[contacts] geladen von:", usedUrl);
        break;
      }
    } catch (e) {
      // next
    }
  }

  if (!data) {
    const container = document.querySelector("#contactsList");
    if (container) {
      container.innerHTML = `<div class="p-4 error-hint">Fehler beim Laden der Kontakte. Geprüfte Pfade:<br>${candidates.map(c => `<code>${escapeHtml(c)}</code>`).join("<br>")}</div>`;
    }
    throw new Error("Konnte keine contacts.example.json laden.");
  }

  // Defensive Normalisierung
  CONTACTS = (Array.isArray(data) ? data : []).map((r) => {
    const row = {};
    for (const key of SEARCH_FIELDS) row[key] = (r?.[key] ?? "").toString();
    if (!row.fullName) {
      const fn = (row.firstName || "").trim();
      const ln = (row.lastName || "").trim();
      row.fullName = [fn, ln].filter(Boolean).join(" ").trim();
    }
    return row;
  });

  // Sortierung
  CONTACTS.sort((a, b) => norm(a.fullName).localeCompare(norm(b.fullName)));

  // Team-Filter befüllen
  fillTeamFilter(CONTACTS);

  // Initial render
  FILTERED = CONTACTS.slice();
  renderList(FILTERED);
  wireUI();
}

// =====================
// UI Verdrahtung
// =====================

function wireUI() {
  const searchAll = document.querySelector("#searchAll");
  const teamFilter = document.querySelector("#teamFilter");
  const copyAllBtn = document.querySelector("#copyAllBtn");

  if (searchAll) searchAll.addEventListener("input", debounce(applySearch, 120));
  if (teamFilter) teamFilter.addEventListener("change", applySearch);
  if (copyAllBtn) copyAllBtn.addEventListener("click", copyAllNumbers);
}

function fillTeamFilter(rows) {
  const select = document.querySelector("#teamFilter");
  if (!select) return;
  // Teams aus department1 sammeln
  const set = new Set();
  rows.forEach(r => {
    const d = (r.department1 || "").trim();
    if (d) set.add(d);
  });
  const teams = Array.from(set).sort((a,b)=>a.localeCompare(b, "de"));
  // Bestehende Optionen (Alle Teams) lassen, Rest auffüllen
  for (const t of teams) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  }
}

// =====================
// Suche & Filter
// =====================

function applySearch() {
  const q = norm(document.querySelector("#searchAll")?.value || "");
  const team = norm(document.querySelector("#teamFilter")?.value || "");

  FILTERED = CONTACTS.filter((row) => {
    const matchesText = !q || SEARCH_FIELDS.some((f) => norm(row[f]).includes(q));
    const matchesTeam = !team || norm(row.department1) === team;
    return matchesText && matchesTeam;
  });

  // Treffer, die mit Suchstring beginnen, nach vorne
  if (q) {
    const starts = [], rest = [];
    for (const r of FILTERED) {
      (norm(r.fullName).startsWith(q) ? starts : rest).push(r);
    }
    FILTERED = [...starts, ...rest];
  }

  renderList(FILTERED);
}

// =====================
// Rendering (Listenlayout)
// =====================

function renderList(list) {
  const container = document.querySelector("#contactsList");
  const countEl = document.querySelector("#resultCount");
  if (countEl) countEl.textContent = String(list?.length ?? 0);

  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = `<div class="p-4 text-red-500">Keine Treffer.</div>`;
    return;
  }

  container.innerHTML = list.map(renderRow).join("");
}

function renderRow(r) {
  const name = escapeHtml(r.fullName || `${r.firstName || ""} ${r.lastName || ""}`.trim()) || "—";
  const pos  = r.position ? `<span class="text-gray-500"> · ${escapeHtml(r.position)}</span>` : "";

  const d1 = r.department1 ? `<span class="badge">${escapeHtml(r.department1)}</span>` : "";
  const d2 = r.department2 ? `<span class="badge">${escapeHtml(r.department2)}</span>` : "";
  const depts = (d1 || d2) ? `<div class="flex flex-wrap gap-2 mt-1">${d1}${d2}</div>` : "";

  const right = [
    linePhone("Tel", r.phoneWork),
    linePhone("Tel2", r.phoneWork2),
    linePhone("Mobil", r.mobile),
    linePhone("Fax", r.fax),
    linePhone("Weitere Nr.", r.phoneOther),
    linePhone("Pager", r.pager),
    lineMail("E-Mail", r.emailDisplay),
  ].filter(Boolean).join("");

  return `
    <div class="contact-row flex items-start justify-between gap-4 p-3">
      <div class="min-w-0">
        <div class="font-medium truncate">${name}${pos}</div>
        ${depts}
        ${r.salutation ? `<div class="text-sm text-gray-500 mt-1">${escapeHtml(r.salutation)}</div>` : ""}
      </div>
      <div class="text-sm text-gray-700 flex flex-col gap-1 text-right">
        ${right || `<span class="text-gray-400">—</span>`}
      </div>
    </div>
  `;
}

function linePhone(label, value) {
  if (!value) return "";
  const valEsc = escapeHtml(value);
  return `<div><span class="text-gray-500">${label}:</span> <a class="underline" href="${telHref(value)}">${valEsc}</a></div>`;
}

function lineMail(label, value) {
  if (!value) return "";
  const valEsc = escapeHtml(value);
  return `<div><span class="text-gray-500">${label}:</span> <a class="underline" href="mailto:${valEsc}">${valEsc}</a></div>`;
}

// =====================
// Extra: Alle Nummern kopieren
// =====================

async function copyAllNumbers() {
  const btn = document.querySelector("#copyAllBtn");
  try {
    // Sammle primär die "phoneWork" der gefilterten Liste
    const nums = FILTERED
      .map(r => (r.phoneWork || "").trim())
      .filter(Boolean);

    const text = nums.join(", ");
    await navigator.clipboard.writeText(text);

    if (btn) {
      const old = btn.textContent;
      btn.textContent = "Kopiert!";
      setTimeout(() => (btn.textContent = old || "Alle Nummern kopieren"), 1200);
    }
  } catch (e) {
    console.error("Clipboard-Fehler:", e);
    if (btn) btn.textContent = "Kopieren fehlgeschlagen";
  }
}
  // --- NEU: Eintragen-Panel toggeln
  const elAdd   = document.getElementById('addEntry');
  const elPanel = document.getElementById('addPanel');
  const elCancel= document.getElementById('cancelAdd');
  const form    = document.forms['phone-entry'];

  function togglePanel(show) {
    if (!elPanel) return;
    elPanel.classList[show ? 'remove' : 'add']('hidden');
  }

  if (elAdd)    elAdd.addEventListener('click', ()=> togglePanel(true));
  if (elCancel) elCancel.addEventListener('click', ()=> togglePanel(false));

  // Netlify-Form via AJAX einsenden (bleibt auf der Seite)
  function encode(data) {
    return Object.keys(data)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(data[k] ?? ''))
      .join('&');
  }

  if (form) form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    // Pflichtfelder (minimal)
    if (!(fd.get('name') && fd.get('phone'))) {
      alert('Bitte mindestens Name und Telefonnummer ausfüllen.');
      return;
    }

    // Payload inkl. Netlify Form-Name
    const payload = {
      'form-name': 'phone-entry',
      name:   fd.get('name'),
      role:   fd.get('role'),
      team:   fd.get('team'),
      room:   fd.get('room'),
      phone:  fd.get('phone'),
      email:  fd.get('email'),
      comment:fd.get('comment'),
    };

    try {
      const r = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encode(payload)
      });
      if (!r.ok) throw new Error('Submit failed: ' + r.status);

      // Erfolg: Formular zurücksetzen und Panel schließen
      form.reset();
      togglePanel(false);
      alert('Danke! Die Telefonnummer wurde übermittelt.');
    } catch (e) {
      console.error(e);
      alert('Übermittlung fehlgeschlagen. Bitte später erneut versuchen.');
    }
  });


// =====================
// Start
// =====================

document.addEventListener("DOMContentLoaded", () => {
  loadContacts().catch(err => {
    console.error(err);
    const container = document.querySelector("#contactsList");
    if (container) {
      container.innerHTML = `<div class="p-4 error-hint">Fehler beim Laden der Kontakte. Bitte Pfad prüfen: <code>${escapeHtml(CONTACTS_URL)}</code></div>`;
    }
  });
});
