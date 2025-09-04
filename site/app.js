async function load() {
  try {
    const res = await fetch('./data.json', { cache: 'no-store' });
    const data = await res.json();
    document.getElementById('generated').textContent =
      `Aktualisiert: ${new Date(data.generated).toLocaleString('de-DE')}`;
    const items = data.items || [];
    const state = { items, q:'', type:'', sort:'metric' };

    const elQ = document.getElementById('q');
    const elT = document.getElementById('type');
    const elS = document.getElementById('sort');
    elQ.addEventListener('input', ()=>{ state.q = elQ.value.toLowerCase(); render(); });
    elT.addEventListener('change', ()=>{ state.type = elT.value; render(); });
    elS.addEventListener('change', ()=>{ state.sort = elS.value; render(); });

    function render() {
      let arr = state.items.slice();
      if (state.q) {
        arr = arr.filter(x =>
          (x.title||'').toLowerCase().includes(state.q) ||
          (x.journal||'').toLowerCase().includes(state.q)
        );
      }
      if (state.type) {
        arr = arr.filter(x => (x.pubtypes||[]).includes(state.type));
      }
      if (state.sort === 'metric') {
        arr.sort((a,b)=> (b.metric_value??-1) - (a.metric_value??-1));
      } else {
        arr.sort((a,b)=> new Date(b.pubdate||0) - new Date(a.pubdate||0));
      }

      const list = document.getElementById('list');
      list.innerHTML = '';
      for (const x of arr) {
        const pt = (x.pubtypes||[]).join(', ');
        const m  = (x.metric_value!=null) ? `${x.metric_name}: ${x.metric_value}` : '—';
        const oa = (x.is_oa===true) ? `· OA` : (x.is_oa===false ? `· closed` : '');
        const card = document.createElement('article');
        card.className = 'bg-white border rounded-xl p-4 shadow-sm';
        card.innerHTML = `
          <div class="flex justify-between items-start gap-3">
            <div>
              <h2 class="font-semibold text-lg leading-snug">${x.title||''}</h2>
              <p class="text-sm text-neutral-600 mt-1">
                <span class="font-medium">${x.journal||''}</span>
                · ${x.pubdate ? new Date(x.pubdate).toLocaleDateString('de-DE') : '—'}
                · ${pt||'—'} ${oa}
              </p>
            </div>
            <div class="text-sm text-neutral-700 whitespace-nowrap">${m}</div>
          </div>
          <div class="mt-3 flex flex-wrap gap-3 text-sm">
            <a class="underline" href="${x.url_pubmed}" target="_blank" rel="noopener">PubMed</a>
            ${x.url_doi ? `<a class="underline" href="${x.url_doi}" target="_blank" rel="noopener">DOI</a>` : ''}
            ${x.oa_url ? `<a class="underline" href="${x.oa_url}" target="_blank" rel="noopener">OA-Volltext</a>` : ''}
          </div>`;
        list.appendChild(card);
      }
    }
    render();
  } catch (e) {
    document.getElementById('generated').textContent = 'Fehler beim Laden von data.json';
    console.error(e);
  }
}
load();
