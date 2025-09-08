async function load(bust=false) {
  const url = bust ? `./data.json?t=${Date.now()}` : './data.json';
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json();

  document.getElementById('generated').textContent =
    `Aktualisiert: ${new Date(data.generated).toLocaleString('de-DE')}`;

  const items = data.items || [];
  const state = { items, q:'', entity:'', type:'', sort:'metric', boostGuidelines:false };

  // Controls
  const elQ = document.getElementById('q');
  const elE = document.getElementById('entity');
  const elT = document.getElementById('type');
  const elS = document.getElementById('sort');
  const elR = document.getElementById('refresh');
  const elB = document.getElementById('boostGuidelines');

  elQ.addEventListener('input', ()=>{ state.q = elQ.value.toLowerCase(); render(); });
  elE.addEventListener('change', ()=>{ state.entity = elE.value; render(); });
  elT.addEventListener('change', ()=>{ state.type = elT.value; render(); });
  elS.addEventListener('change', ()=>{ state.sort = elS.value; render(); });
  elR.addEventListener('click', ()=> load(true));
  elB.addEventListener('change', ()=>{ state.boostGuidelines = elB.checked; render(); });

  // Farbzuordnung (Tailwind-Klassen fest ausgeschrieben)
  const colorMap = {
    "Prospective": { border: "border-l-4 border-emerald-500", badge: "bg-emerald-500/10 text-emerald-700 border-emerald-300" },
    "Review":      { border: "border-l-4 border-blue-500",    badge: "bg-blue-500/10 text-blue-700 border-blue-300" },
    "Guideline":   { border: "border-l-4 border-amber-500",   badge: "bg-amber-500/10 text-amber-800 border-amber-300" },
    "Preclinical": { border: "border-l-4 border-purple-500",  badge: "bg-purple-500/10 text-purple-700 border-purple-300" },
    "Other":       { border: "border-l-4 border-neutral-300", badge: "bg-neutral-200 text-neutral-700 border-neutral-300" },
  };

  function sortArr(arr) {
    arr.sort((a,b)=>{
      // Optionaler Boost: Guidelines zuerst
      if (state.boostGuidelines) {
        const ag = a.study_class === 'Guideline' ? 1 : 0;
        const bg = b.study_class === 'Guideline' ? 1 : 0;
        if (ag !== bg) return bg - ag; // Guideline oben
      }
      if (state.sort === 'metric') {
        const dm = (b.metric_value??-1) - (a.metric_value??-1);
        if (dm !== 0) return dm;
        return new Date(b.pubdate||0) - new Date(a.pubdate||0);
      } else {
        const dd = new Date(b.pubdate||0) - new Date(a.pubdate||0);
        if (dd !== 0) return dd;
        return (b.metric_value??-1) - (a.metric_value??-1);
      }
    });
  }

  function cardHtml(x) {
    const study = x.study_class || 'Other';
    const cm = colorMap[study] || colorMap['Other'];
    const pt = (x.pubtypes||[]).join(', ');
    const m  = (x.metric_value!=null) ? `${x.metric_name}: ${x.metric_value}` : '—';
    const oa = (x.is_oa===true) ? `· OA` : (x.is_oa===false ? `· closed` : '');
    const badge = (txt, cls) => `<span class="px-2 py-0.5 rounded-full text-xs border ${cls}">${txt}</span>`;
    const badges = [
      study ? badge(study, cm.badge) : '',
      x.entity ? badge(x.entity, "bg-neutral-100 text-neutral-700 border-neutral-300") : '',
      x.trial_type ? badge(x.trial_type, "bg-neutral-100 text-neutral-700 border-neutral-300") : ''
    ].filter(Boolean).join(' ');

    return `
      <article class="bg-white border rounded-xl p-4 shadow-sm ${cm.border}">
        <div class="flex justify-between items-start gap-3">
          <div>
            <h2 class="font-semibold text-lg leading-snug">${x.title||''}</h2>
            <p class="text-sm text-neutral-600 mt-1">
              <span class="font-medium">${x.journal||''}</span>
              · ${x.pubdate ? new Date(x.pubdate).toLocaleDateString('de-DE') : '—'}
              · ${pt||'—'} ${oa}
            </p>
            <div class="mt-2 flex gap-2 flex-wrap">${badges}</div>
          </div>
          <div class="text-sm text-neutral-700 whitespace-nowrap">${m}</div>
        </div>
        <div class="mt-3 flex flex-wrap gap-3 text-sm">
          <a class="underline" href="${x.url_pubmed}" target="_blank" rel="noopener">PubMed</a>
          ${x.url_doi ? `<a class="underline" href="${x.url_doi}" target="_blank" rel="noopener">DOI</a>` : ''}
          ${x.oa_url ? `<a class="underline" href="${x.oa_url}" target="_blank" rel="noopener">OA-Volltext</a>` : ''}
        </div>
      </article>
    `;
  }

  function render() {
    let arr = state.items.slice();

    // Suche
    if (state.q) {
      arr = arr.filter(x =>
        (x.title||'').toLowerCase().includes(state.q) ||
        (x.journal||'').toLowerCase().includes(state.q)
      );
    }
    // Entität
    if (state.entity) {
      arr = arr.filter(x => (x.entity||'') === state.entity);
    }
    // Publikationstyp (rohe PubTypes)
    if (state.type) {
      arr = arr.filter(x => (x.pubtypes||[]).includes(state.type));
    }

    sortArr(arr);

    // Top-5 und Rest
    const top5 = arr.slice(0, 5);
    const topIds = new Set(top5.map(x => x.pmid));
    const rest = arr.filter(x => !topIds.has(x.pmid));

    document.getElementById('top5list').innerHTML = top5.map(cardHtml).join('');
    document.getElementById('list').innerHTML = rest.map(cardHtml).join('');
  }

  render();
}

load().catch(() => {
  document.getElementById('generated').textContent = 'Fehler beim Laden von data.json';
});
