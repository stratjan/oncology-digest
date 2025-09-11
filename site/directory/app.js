// app.js

// === 0) Einstellungen ===
const CONTACTS_URL = "/directory/contacts.example.json"; // Pfad ggf. anpassen
const SEARCH_FIELDS = [
  "salutation",      // Anrede
  "firstName",       // Vorname
  "lastName",        // Nachname
  "fullName",        // Vorname + Nachname
  "department1",     // Abteilung 1
  "department2",     // Abteilung 2
  "position",        // Position
  "phoneWork",       // Telefon geschäftlich
  "phoneWork2",      // Telefon geschäftlich 2
  "mobile",          // Mobiltelefon
  "fax",             // Fax
  "phoneOther",      // Weiteres Telefon
  "pager",           // Pager
  "emailDisplay"     // E-Mail (Angezeigter Name)
];

let CONTACTS = [];
let FILTERED = [];

// === 1) Utilities ===
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

// === 2) Laden & Normalisieren ===
async function loadContacts() {
  const res = await fetch(CONTACTS_URL, { cache: "no-store" });
  if (!res.ok) {
    console.error(`Konnte ${CONTACTS_URL} nicht laden`, res.status, await res.text().catch(()=>"" ));
    throw new Error(`Laden fehlgeschlagen: ${CONTACTS_URL}`);
  }
  const data = await res.json();

  // Defensive Normalisierung aller erwarteten Keys
  CONTACTS = (Array.isArray(data) ? data : []).map((r) => {
    const row = {};
    for (const key of SEARCH_FIELDS) row[key] = (r?.[key] ?? "").toString();
    // fullName-Fallback, falls leer
    if (!row.fullName) {
      const fn = (row.firstName || "").trim();
      const ln = (row.lastName || "").trim();
      row.fullName = [fn, ln].filter(Boolean).join(" ").trim();
    }
    return row;
  });

  // Initial: sortiere nach Name
  CONTACTS.sort((a, b) => norm(a.fullName).localeCompare(norm(b.fullName)));
  FILTERED = CONTACTS.slice();
  renderList(FILTERED);
  wireSearch();
}

// === 3) Suche & Filter ===
function applySearch() {
  const q = norm(document.querySelector("#searchAll")?.value || "");
  const dep1 = norm(document.querySelector("#filterDepartment1")?.value || "");
  const dep2 = norm(document.querySelector("#filterDepartment2")?.value || "");
  const pos  = norm(document.querySelector("#filterPosition")?.value || "");

  FILTERED = CONTACTS.filter((row) => {
    const matchesText = !q || SEARCH_FIELDS.some((f) => norm(row[f]).includes(q));
    const matchesDep1 = !dep1 || norm(row.department1).includes(dep1);
    const matchesDep2 = !dep2 || norm(row.department2).includes(dep2);
    const matchesPos  = !pos  || norm(row.position).includes(pos);
    return matchesText && matchesDep1 && matchesDep2 && matchesPos;
  });

  // Optionale Sortierung: Treffer mit Anfangs-Übereinstimmung nach vorn
  const qLen = q.length;
  if (qLen > 0) {
    const startsWith = [];
    const contains = [];
    for (const r of FILTERED) {
      const name = norm(r.fullName);
      if (name.startsWith(q)) startsWith.push(r); else contains.push(r);
    }
    FILTERED = [...startsWith, ...contains];
  }

  renderList(FILTERED);
}

const debouncedSearch = debounce(applySearch, 120);

function wireSearch() {
  const searchAll = document.querySelector("#searchAll");
  if (searchAll) {
    searchAll.addEventListener("input", debouncedSearch);
  }
  ["#filterDepartment1", "#filterDepartment2", "#filterPosition"].forEach((sel) => {
    const el = document.querySelector(sel);
    if (el) el.addEventListener("input", debouncedSearch);
  });
}

// === 4) Rendering ===
function renderList(list) {
  const container = document.querySelector("#contactsList");
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = `<div class="p-4 text-red-500">Keine Treffer.</div>`;
    return;
  }

  container.innerHTML = list.map(renderRow).join("");
}

// Kompakte Listen-Zeile
function renderRow(r) {
  const name = escapeHtml(r.fullName || `${r.firstName || ""} ${r.lastName || ""}`.trim()) || "—";
  const pos  = r.position ? `<span class="text-gray-500"> · ${escapeHtml(r.position)}</span>` : "";

  // Abteilungen als „Badges“
  const d1 = r.department1 ? `<span class="badge">${escapeHtml(r.department1)}</span>` : "";
  const d2 = r.department2 ? `<span class="badge">${escapeHtml(r.department2)}</span>` : "";
  const depts = (d1 || d2) ? `<div class="flex flex-wrap gap-2 mt-1">${d1}${d2}</div>` : "";

  // Kontaktfelder rechts in eine kompakte Spalte
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


  // Zeilen bauen – nur befüllt anzeigen
  const rows = [
    rowLine("Anrede", r.salutation),
    rowLine("Telefon geschäftlich", r.phoneWork, "phone"),
    rowLine("Telefon geschäftlich 2", r.phoneWork2, "phone"),
    rowLine("Mobil", r.mobile, "phone"),
    rowLine("Fax", r.fax, "phone"),
    rowLine("Weiteres Telefon", r.phoneOther, "phone"),
    rowLine("Pager", r.pager, "phone"),
    rowLine("E-Mail", r.emailDisplay, "mail"),
  ].filter(Boolean).join("");

  return `
    <article class="contact-card">
      <header class="contact-header">
        <strong class="name">${name}</strong>
        ${pos}
      </header>
      <div class="meta">
        ${d1}${d2}
      </div>
      <ul class="contact-fields">
        ${rows}
      </ul>
    </article>
  `;
}

function rowLine(label, value, type = "text") {
  if (!value) return "";
  const valEsc = escapeHtml(value);
  if (type === "mail") {
    return `<li><span class="lbl">${label}:</span> <a href="mailto:${valEsc}">${valEsc}</a></li>`;
  }
  if (type === "phone") {
    return `<li><span class="lbl">${label}:</span> <a href="${telHref(value)}">${valEsc}</a></li>`;
  }
  return `<li><span class="lbl">${label}:</span> ${valEsc}</li>`;
}

// === 5) Boot ===
document.addEventListener("DOMContentLoaded", () => {
  loadContacts().catch(err => {
    console.error(err);
    const container = document.querySelector("#contactsList");
    if (container) {
      container.innerHTML = `<div class="error-hint">Fehler beim Laden der Kontakte. Bitte Pfad prüfen: <code>${escapeHtml(CONTACTS_URL)}</code></div>`;
    }
  });
});
