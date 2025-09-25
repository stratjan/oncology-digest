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
