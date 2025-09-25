// site/directory/app.js

// --- Datenquellen (Primär + Fallback) ---------------------------------------
const PRIMARY_URL  = '/directory/contacts.json';
const FALLBACK_URL = '/directory/contacts.example.json';

// --- Utilities ---------------------------------------------------------------
function esc(s){
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

async function fetchContacts() {
  let res = await fetch(PRIMARY_URL, { cache: 'no-store' });
  if (!res.ok) res = await fetch(FALLBACK_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Konnte contacts.json nicht laden');
  const data = await res.json();
  return Array.isArray(data) ? data : (data.items || []);
}

// --- Rendering ---------------------------------------------------------------
function card(x) {
  return `
    <article class="bg-white border rounded-xl p-4 shadow-sm">
      <div class="flex justify-between gap-3">
        <div>
          <h2 class="font-semibold">${esc(x.name || '')}</h2>
          <p class="text-sm text-neutral-600">
            ${esc(x.role || '')}${x.team ? ` · ${esc(x.team)}` : ''}${x.room ? ` · Raum ${esc(x.room)}` : ''}
          </p>
          <div class="mt-2 text-sm flex flex-wrap gap-3">
            ${x.phone  ? `<span>☎️ <a class="underline" href="tel:${esc(x.phone)}">${esc(x.phone)}</a></span>` : ''}
            ${x.mobile ? `<span>📱 <a class="underline" href="tel:${esc(x.mobile)}">${esc(x.mobile)}</a></span>` : ''}
            ${x.pager  ? `<span>📟 ${esc(x.pager)}</span>` : ''}
            ${x.email  ? `<span>✉️ <a class="underline" href="mailto:${esc(x.email)}">${esc(x.email)}</a></span>` : ''}
          </div>
        </div>
        <button class="text-sm border rounded-lg px-3 py-2 self-start"
                data-copy="${esc(x.phone || x.mobile || '')}">
          Nummer kopieren
        </button>
      </div>
    </article>
  `;
}

// --- Hauptlogik --------------------------------------------------------------
async function load() {
  // DOM
  const elQ = document.getElementById('q');
  const elT = document.getElementById('team');
  const elL = document.getElementById('list');
  const elC = document.getElementById('copyAll');

  // Daten
  const items = await fetchContacts();

  // Teams in Dropdown füllen
  const teams = [...new Set(items.map(x => x.team).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));
  for (const t of teams) {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    elT.appendChild(opt);
  }

  function getFiltered() {
    const q = (elQ.value || '').toLowerCase().trim();
    const t = elT.value || '';

    return items.filter(x => {
      if (t && (x.team || '') !== t) return false;
      if (!q) return true;
      const hay = [
        x.name, x.role, x.team, x.room, x.phone, x.mobile, x.pager, x.email
      ].map(v => (v || '').toString().toLowerCase()).join(' ');
      return hay.includes(q);
    });
  }

  function render() {
    const arr = getFiltered();
    elL.innerHTML = arr.map(card).join('');
  }

  // Suche / Filter
  elQ.addEventListener('input', render);
  elT.addEventListener('change', render);

  // „Alle Nummern kopieren“ (aus dem aktuell gefilterten Set)
  if (elC) elC.addEventListener('click', ()=>{
    const nums = getFiltered().map(x => x.phone || x.mobile).filter(Boolean);
    if (nums.length) navigator.clipboard.writeText(nums.join('\n'));
  });

  // Delegiertes Copy-Handling pro Karte (nur 1x binden)
  if (!window.__dirCopyBound) {
    document.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('button[data-copy]');
      if (!btn) return;
      const num = btn.getAttribute('data-copy');
      if (num) {
        navigator.clipboard.writeText(num);
        btn.textContent = 'Kopiert!';
        setTimeout(()=>{ btn.textContent = 'Nummer kopieren'; }, 900);
      }
    });
    window.__dirCopyBound = true;
  }

  // ---- NEU: Eintragen-Panel + Netlify-Forms --------------------------------
  const elAdd    = document.getElementById('addEntry');
  const elPanel  = document.getElementById('addPanel');
  const elCancel = document.getElementById('cancelAdd');
  const form     = document.forms['phone-entry'];

  function togglePanel(show) {
    if (!elPanel) return;
    elPanel.classList[show ? 'remove' : 'add']('hidden');
  }

  if (elAdd)    elAdd.addEventListener('click', ()=> togglePanel(true));
  if (elCancel) elCancel.addEventListener('click', ()=> togglePanel(false));

  // Hilfsfunktion für x-www-form-urlencoded
  function encode(data) {
    return Object.keys(data)
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(data[k] ?? ''))
      .join('&');
  }

  if (form) form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);

    if (!(fd.get('name') && fd.get('phone'))) {
      alert('Bitte mindestens Name und Telefonnummer ausfüllen.');
      return;
    }

    const payload = {
      'form-name': 'phone-entry',
      name:    fd.get('name'),
      role:    fd.get('role'),
      team:    fd.get('team'),
      room:    fd.get('room'),
      phone:   fd.get('phone'),
      email:   fd.get('email'),
      comment: fd.get('comment'),
    };

    try {
      const r = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encode(payload)
      });
      if (!r.ok) throw new Error('Submit failed: ' + r.status);

      form.reset();
      togglePanel(false);
      alert('Danke! Die Telefonnummer wurde übermittelt.');
    } catch (e) {
      console.error(e);
      alert('Übermittlung fehlgeschlagen. Bitte später erneut versuchen.');
    }
  });

  // Initial render
  render();
}

// Start
load().catch((err) => {
  console.error(err);
  const elL = document.getElementById('list');
  if (elL) elL.innerHTML = '<div class="text-sm text-neutral-600">Konnte Verzeichnis nicht laden.</div>';
});
