// site/docs/app.js

const PRIMARY_URL  = '/docs/docs.json';          // echte Daten (optional)
const FALLBACK_URL = '/docs/docs.example.json';  // Beispiel/Fallback

function esc(s){return String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

function fmtDate(s){
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString('de-DE');
}

async function fetchDocs(){
  let r = await fetch(PRIMARY_URL, {cache:'no-store'});
  if(!r.ok) r = await fetch(FALLBACK_URL, {cache:'no-store'});
  if(!r.ok) throw new Error('Konnte Dokumentdaten nicht laden');
  const data = await r.json();
  return Array.isArray(data) ? data : (data.items || []);
}

function buildFilters(items){
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));
  return {
    categories: uniq(items.map(x=>x.category)),
    types:      uniq(items.map(x=>x.type)),
    sources:    uniq(items.map(x=>x.source)),
  };
}

function fillSelect(sel, values){
  for(const v of values){
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  }
}

function iconFor(x){
  // rein kosmetisch
  const url = (x.url || '').toLowerCase();
  if (url.endsWith('.pdf') || x.mime === 'application/pdf') return '📄';
  if (url.includes('patholog')) return '🧪';
  if (x.type === 'Dokument') return '📘';
  return '🔗';
}

function cardHtml(x){
  const badges = [
    x.category ? `<span class="px-2 py-0.5 rounded-full text-xs border bg-neutral-100 text-neutral-700 border-neutral-300">${esc(x.category)}</span>` : '',
    x.type     ? `<span class="px-2 py-0.5 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-200">${esc(x.type)}</span>` : '',
    x.source   ? `<span class="px-2 py-0.5 rounded-full text-xs border bg-emerald-50 text-emerald-700 border-emerald-200">${esc(x.source)}</span>` : ''
  ].filter(Boolean).join(' ');

  const meta = [
    x.owner ? `Verantwortlich: ${esc(x.owner)}` : '',
    x.updated ? `Aktualisiert: ${fmtDate(x.updated)}` : (x.created ? `Erstellt: ${fmtDate(x.created)}` : '')
  ].filter(Boolean).join(' · ');

  const href = x.url || '#';
  const icon = iconFor(x);

  return `
    <article class="bg-white border rounded-xl p-4 shadow-sm cursor-pointer" data-id="${esc(x.id||'')}">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="font-semibold text-lg leading-snug">${icon} ${esc(x.title||'')}</h2>
          <p class="text-sm text-neutral-600 mt-1">${meta || '&nbsp;'}</p>
          <div class="mt-2 flex gap-2 flex-wrap">${badges}</div>
        </div>
        <div class="flex gap-2">
          <a class="text-sm border rounded-lg px-3 py-2 inline-flex items-center justify-center"
             href="${esc(href)}" target="_blank" rel="noopener">Öffnen</a>
          <button class="text-sm border rounded-lg px-3 py-2" data-copy="${esc(href)}">Link kopieren</button>
        </div>
      </div>

      <div class="mt-3 hidden" data-body>
        <div class="whitespace-pre-wrap bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-[1rem] leading-7 text-neutral-800">
          ${esc(x.description || '')}
          ${x.tags && x.tags.length ? `<div class="mt-2 text-xs text-neutral-600">Tags: ${x.tags.map(esc).join(', ')}</div>` : ''}
        </div>
      </div>
    </article>
  `;
}

function matches(x, q){
  if(!q) return true;
  const hay = [
    x.title, x.description, x.category, x.type, x.source, x.owner,
    (x.tags||[]).join(' ')
  ].map(v => (v||'').toString().toLowerCase()).join(' ');
  return hay.includes(q);
}

async function load(){
  const items = await fetchDocs();

  // neueste zuerst
  items.sort((a,b)=> new Date(b.updated||b.created||0) - new Date(a.updated||a.created||0));

  const {categories, types, sources} = buildFilters(items);
  const elQ = document.getElementById('q');
  const elC = document.getElementById('category'); fillSelect(elC, categories);
  const elT = document.getElementById('dtype');    // Typ (Dokument/Link)
  const elS = document.getElementById('source');   fillSelect(elS, sources);
  const elL = document.getElementById('list');
  const elE = document.getElementById('export');

  function render(){
    const q = (elQ.value||'').toLowerCase().trim();
    const c = elC.value || '';
    const t = elT.value || '';
    const s = elS.value || '';

    const arr = items.filter(x=>{
      if (c && x.category !== c) return false;
      if (t && x.type     !== t) return false;
      if (s && x.source   !== s) return false;
      return matches(x,q);
    });

    elL.innerHTML = arr.map(cardHtml).join('');
  }

  elQ.addEventListener('input', render);
  elC.addEventListener('change', render);
  elT.addEventListener('change', render);
  elS.addEventListener('change', render);

  // Toggle Beschreibung + Link kopieren
  document.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button[data-copy]');
    if (btn){
      const url = btn.getAttribute('data-copy') || '';
      if (url) {
        navigator.clipboard.writeText(url);
        btn.textContent = 'Kopiert!';
        setTimeout(()=> btn.textContent = 'Link kopieren', 900);
      }
      return;
    }
    if (ev.target.closest('a')) return; // echte Links nicht abfangen
    const card = ev.target.closest('article[data-id]');
    if (!card) return;
    const body = card.querySelector('[data-body]');
    if (!body) return;
    body.classList.toggle('hidden');
  });

  const meta = document.getElementById('meta');
  if (meta) meta.textContent = `Einträge: ${items.length}`;
  render();

  // Export CSV
  elE.addEventListener('click', ()=>{
    const head = ["id","title","category","type","source","owner","created","updated","url","tags","description"];
    const rows = [head.join(",")].concat(items.map(x =>
      head.map(k => {
        const v = k === 'tags' ? (x.tags||[]).join('|') : (x[k] ?? '');
        return `"${String(v).replace(/"/g,'""')}"`;
      }).join(",")
    ));
    const blob = new Blob([rows.join("\n")], {type: "text/csv;charset=utf-8;"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `docs_links_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  });
}

load().catch(()=>{
  const m = document.getElementById('meta');
  if (m) m.textContent = 'Fehler beim Laden.';
});

