// site/snippets/app.js

const PRIMARY_URL  = '/snippets/snippets.json';         // falls du später „echt“ nutzt
const FALLBACK_URL = '/snippets/snippets.example.json'; // aktuell: Beispiel

function esc(s){return String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

function fmtDate(s){
  try { return new Date(s).toLocaleString('de-DE'); }
  catch { return s || '—'; }
}

async function fetchSnippets(){
  let r = await fetch(PRIMARY_URL, {cache:'no-store'});
  if(!r.ok) r = await fetch(FALLBACK_URL, {cache:'no-store'});
  if(!r.ok) throw new Error('Konnte Snippets nicht laden');
  const data = await r.json();
  return Array.isArray(data) ? data : (data.items || []);
}

function buildFilters(items){
  const by = (key) => [...new Set(items.map(x => x[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));
  return {
    authors:  by('author'),
    entities: by('entity'),
    protocols: by('protocol')
  };
}

function fillSelect(sel, values){
  for(const v of values){
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  }
}

function cardHtml(x){
  const badges = [
    x.entity   ? `<span class="px-2 py-0.5 rounded-full text-xs border bg-neutral-100 text-neutral-700 border-neutral-300">${esc(x.entity)}</span>` : '',
    x.timepoint? `<span class="px-2 py-0.5 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-200">${esc(x.timepoint)}</span>` : '',
    x.protocol ? `<span class="px-2 py-0.5 rounded-full text-xs border bg-emerald-50 text-emerald-700 border-emerald-200">${esc(x.protocol)}</span>` : ''
  ].filter(Boolean).join(' ');

  const meta = [
    x.author ? `Ersteller: ${esc(x.author)}` : '',
    x.updated ? `Aktualisiert: ${fmtDate(x.updated)}` : (x.created ? `Erstellt: ${fmtDate(x.created)}` : '')
  ].filter(Boolean).join(' · ');

  return `
    <article class="bg-white border rounded-xl p-4 shadow-sm cursor-pointer" data-id="${esc(x.id || '')}">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="font-semibold text-lg leading-snug">${esc(x.title || '')}</h2>
          <p class="text-sm text-neutral-600 mt-1">${meta || '&nbsp;'}</p>
          <div class="mt-2 flex gap-2 flex-wrap">${badges}</div>
        </div>
        <div>
          <button class="text-sm border rounded-lg px-3 py-2" data-copy="${esc(x.body || '')}">Kopieren</button>
        </div>
      </div>

      <!-- versteckter Textblock -->
      <div class="mt-3 hidden" data-body>
        <div class="whitespace-pre-wrap bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-[1rem] leading-7 text-neutral-800">
          ${esc(x.body || '')}
        </div>
      </div>
    </article>
  `;
}

function matches(x, q){
  if(!q) return true;
  const hay = [
    x.title, x.body, x.author, x.entity, x.timepoint, x.protocol, (x.tags||[]).join(' ')
  ].map(v => (v||'').toString().toLowerCase()).join(' ');
  return hay.includes(q);
}

async function load(){
  const items = await fetchSnippets();

  // Sort: neueste zuerst (updated > created)
  items.sort((a,b)=> new Date(b.updated||b.created||0) - new Date(a.updated||a.created||0));

  // Fill selects
  const {authors, entities, protocols} = buildFilters(items);
  fillSelect(document.getElementById('author'), authors);
  fillSelect(document.getElementById('entity'), entities);
  fillSelect(document.getElementById('protocol'), protocols);

  const elQ   = document.getElementById('q');
  const elA   = document.getElementById('author');
  const elE   = document.getElementById('entity');
  const elT   = document.getElementById('timepoint');
  const elP   = document.getElementById('protocol');
  const elL   = document.getElementById('list');
  const elExp = document.getElementById('export');

  function render(){
    const q = (elQ.value||'').toLowerCase().trim();
    const a = elA.value || '';
    const e = elE.value || '';
    const t = elT.value || '';
    const p = elP.value || '';

    const arr = items.filter(x => {
      if(a && x.author   !== a) return false;
      if(e && x.entity   !== e) return false;
      if(t && x.timepoint!== t) return false;
      if(p && x.protocol !== p) return false;
      return matches(x,q);
    });

    elL.innerHTML = arr.map(cardHtml).join('');
  }

  elQ.addEventListener('input', render);
  elA.addEventListener('change', render);
  elE.addEventListener('change', render);
  elT.addEventListener('change', render);
  elP.addEventListener('change', render);

  // Delegierter Click-Handler: Karte toggelt Body, Copy-Button kopiert
  document.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button[data-copy]');
    if(btn){
      const txt = btn.getAttribute('data-copy') || '';
      if (txt) {
        navigator.clipboard.writeText(txt);
        btn.textContent = 'Kopiert!';
        setTimeout(()=>{ btn.textContent = 'Kopieren'; }, 1000);
      }
      return;
    }
    if (ev.target.closest('a')) return; // Links durchlassen (falls später welche hinzukommen)
    const card = ev.target.closest('article[data-id]');
    if(!card) return;
    const body = card.querySelector('[data-body]');
    if(!body) return;
    body.classList.toggle('hidden');
  });

  // Meta-Info
  const metaEl = document.getElementById('meta');
  if (metaEl) metaEl.textContent = `Einträge: ${items.length}`;

  render();

  // CSV-Export (Titel, Autor, Entität, Zeitpunkt, Protokoll, aktualisiert)
  elExp.addEventListener('click', ()=>{
    const head = ["id","title","author","entity","timepoint","protocol","created","updated","body"];
    const arr = [...document.querySelectorAll('#list article')].map((_,i)=>i); // dummy iterate after render
    const rows = [head.join(",")].concat(items.map(x =>
      head.map(k => `"${String(x[k] ?? '').replace(/"/g,'""')}"`).join(",")
    ));
    const blob = new Blob([rows.join("\n")], {type: "text/csv;charset=utf-8;"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `textbausteine_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  });
}

load().catch(()=>{
  const m = document.getElementById('meta');
  if (m) m.textContent = 'Fehler beim Laden der Textbausteine.';
});

