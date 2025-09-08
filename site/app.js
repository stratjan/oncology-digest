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
