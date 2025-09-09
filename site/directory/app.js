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

