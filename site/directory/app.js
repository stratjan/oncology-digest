async function load() {
  // Später: ersetze contacts.example.json durch contacts.json (gleiche Struktur)
  const res = await fetch('/directory/contacts.example.json', { cache: 'no-store' });
  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.items || []);

  const elQ = document.getElementById('q');
  const elT = document.getElementById('team');
  const elL = document.getElementById('list');
  const elC = document.getElementById('copyAll');

  // Teams für Filter
  const teams = [...new Set(items.map(x => x.team).filter(Boolean))].sort();
  for (const t of teams) {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    elT.appendChild(opt);
  }

  function render() {
    const q = (elQ.value || '').toLowerCase().trim();
    const t = elT.value || '';

    const arr = items.filter(x => {
      if (t && x.team !== t) return false;
      if (!q) return true;
      const hay = [
        x.name, x.role, x.team,
        x.phone, x.mobile, x.pager, x.email
      ].map(v => (v || '').toString().toLowerCase()).join(' ');
      return hay.includes(q);
    });

    elL.innerHTML = arr.map(card).join('');
  }

  function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

  function card(x) {
    return `
      <article class="bg-white border rounded-xl p-4 shadow-sm">
        <div class="flex justify-between gap-3">
          <div>
            <h2 class="font-semibold">${esc(x.name || '')}</h2>
            <p class="text-sm text-neutral-600">
              ${esc(x.role || '')}${x.team ? ` · ${esc(x.team)}` : ''}
            </p>
            <div class="mt-2 text-sm flex flex-wrap gap-3">
              ${x.phone  ? `<span>☎️ <a class="underline" href="tel:${esc(x.phone)}">${esc(x.phone)}</a></span>` : ''}
              ${x.mobile ? `<span>📱 <a class="underline" href="tel:${esc(x.mobile)}">${esc(x.mobile)}</a></span>` : ''}
              ${x.pager  ? `<span>📟 ${esc(x.pager)}</span>` : ''}
              ${x.email  ? `<span>✉️ <a class="underline" href="mailto:${esc(x.email)}">${esc(x.email)}</a></span>` : ''}
            </div>
          </div>
          <button class="text-sm border rounded-lg px-3 py-2 self-start" data-copy="${esc(x.phone || x.mobile || '')}">Nummer kopieren</button>
        </div>
      </article>
    `;
  }
// === 1) Datenquelle festlegen ===
// Pfad ggf. anpassen: liegt contacts.json im Webroot => "/contacts.json"
// oder z.B. unter /data => "/data/contacts.json"
const CONTACTS_URL = "/contacts.json";

let CONTACTS = [];
let FILTERED = [];

// === 2) Helper für sichere Stringsuche ===
const norm = (v) => (v || "").toString().trim().toLowerCase();

// Felder, die durchsucht werden sollen (alle gewünschten Spalten + fullName)
const SEARCH_FIELDS = [
  "salutation",      // Anrede
  "firstName",       // Vorname
  "lastName",        // Nachname
  "fullName",        // Vorname + Nachname (zusätzlich generiert)
  "department1",     // Abteilung 1
  "department2",     // Abteilung 2
  "position",        // Position
  "phoneWork",       // Telefon geschäftlich
  "phoneWork2",      // Telefon geschäftlich 2
  "mobile",          // Mobiltelefon
  "fax",             // Fax
  "phoneOther",      // Weiteres Telefon
  "pager",           // Pager
  "emailDisplay"     // E-Mail: Angezeigter Name
];

// === 3) Laden & Initialisieren ===
async function loadContacts() {
  const res = await fetch(CONTACTS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Konnte ${CONTACTS_URL} nicht laden`);
  const data = await res.json();

  // defensive: fehlende keys als leere Strings
  CONTACTS = data.map((r) => {
    const obj = {};
    for (const key of SEARCH_FIELDS) obj[key] = (r[key] ?? "").toString();
    // fullName fallback, falls in der JSON leer
    if (!obj.fullName) {
      obj.fullName = `${obj.firstName} ${obj.lastName}`.trim();
    }
    return obj;
  });

  FILTERED = CONTACTS.slice();
  renderList(FILTERED);
  wireSearch(); // Suchmaske aktivieren
}

// === 4) Suche (Freitext über alle Felder) ===
// Falls du separate Felder hast (z.B. Abteilung-Select, Positions-Input, etc.),
// kannst du diese hier zusätzlich berücksichtigen.
function applySearch() {
  const q = norm(document.querySelector("#searchAll")?.value || "");
  // Beispiel: zusätzliche Filter (optional)
  const dep1 = norm(document.querySelector("#filterDepartment1")?.value || "");
  const dep2 = norm(document.querySelector("#filterDepartment2")?.value || "");
  const pos  = norm(document.querySelector("#filterPosition")?.value || "");

  FILTERED = CONTACTS.filter((row) => {
    // Volltext über alle Felder
    const matchesText = !q || SEARCH_FIELDS.some((f) => norm(row[f]).includes(q));
    // Optionale strukturierte Filter (wenn leer, ignorieren)
    const matchesDep1 = !dep1 || norm(row.department1).includes(dep1);
    const matchesDep2 = !dep2 || norm(row.department2).includes(dep2);
    const matchesPos  = !pos  || norm(row.position).includes(pos);

    return matchesText && matchesDep1 && matchesDep2 && matchesPos;
  });

  renderList(FILTERED);
}

function wireSearch() {
  // 1) Ein Freitextfeld mit id="searchAll" (empfohlen)
  const searchAll = document.querySelector("#searchAll");
  if (searchAll) {
    searchAll.addEventListener("input", applySearch);
  }

  // 2) Optionale strukturierte Felder (falls vorhanden)
  ["#filterDepartment1", "#filterDepartment2", "#filterPosition"].forEach((sel) => {
    const el = document.querySelector(sel);
    if (el) el.addEventListener("input", applySearch);
  });
}

// === 5) Rendering (einfaches Beispiel) ===
// Passe das an deine bestehende Karten-/Tabellen-Darstellung an.
function renderList(list) {
  const container = document.querySelector("#contactsList");
  if (!container) return;

  container.innerHTML = list.map((r) => `
    <article class="contact-card">
      <header class="contact-header">
        <strong>${escapeHtml(r.fullName || `${r.firstName} ${r.lastName}`)}</strong>
        ${r.position ? `<div class="position">${escapeHtml(r.position)}</div>` : ""}
      </header>
      <div class="meta">
        ${r.department1 ? `<div>${escapeHtml(r.department1)}</div>` : ""}
        ${r.department2 ? `<div>${escapeHtml(r.department2)}</div>` : ""}
      </div>
      <ul class="contact-fields">
        ${fieldRow("Anrede", r.salutation)}
        ${fieldRow("Telefon geschäftlich", r.phoneWork)}
        ${fieldRow("Telefon geschäftlich 2", r.phoneWork2)}
        ${fieldRow("Mobil", r.mobile)}
        ${fieldRow("Fax", r.fax)}
        ${fieldRow("Weiteres Telefon", r.phoneOther)}
        ${fieldRow("Pager", r.pager)}
        ${fieldRow("E-Mail", r.emailDisplay)}
      </ul>
    </article>
  `).join("");
}

// kleine Helper für Rendering
function fieldRow(label, value) {
  if (!value) return "";
  const isMail = label.toLowerCase().includes("mail");
  const isPhone = /telefon|mobil|fax|pager/i.test(label);
  const valEsc = escapeHtml(value);

  if (isMail) return `<li><span>${label}:</span> <a href="mailto:${valEsc}">${valEsc}</a></li>`;
  if (isPhone) return `<li><span>${label}:</span> <a href="tel:${valEsc.replace(/[^+\d]/g,"")}">${valEsc}</a></li>`;
  return `<li><span>${label}:</span> ${valEsc}</li>`;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, m => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[m]));
}

// === 6) Start ===
document.addEventListener("DOMContentLoaded", loadContacts);

  // Events
  elQ.addEventListener('input', render);
  elT.addEventListener('change', render);

  // Delegiertes Copy-Handling
  document.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button[data-copy]');
    if (!btn) return;
    const num = btn.getAttribute('data-copy');
    if (num) navigator.clipboard.writeText(num);
  });

  elC.addEventListener('click', ()=>{
    const nums = items.map(x => x.phone || x.mobile).filter(Boolean);
    if (nums.length) navigator.clipboard.writeText(nums.join('\n'));
  });

  render();
}
load().catch(() => {
  document.getElementById('list').innerHTML =
    '<div class="text-sm text-neutral-600">Konnte Verzeichnis nicht laden.</div>';
});

