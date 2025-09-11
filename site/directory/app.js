// === Robust: mehrere Pfade probieren ===
const CANDIDATE_URLS = [
  new URL("/directory/contacts.example.json", window.location.origin).toString(),
  new URL("/site/directory/contacts.example.json", window.location.origin).toString(),
  new URL("./contacts.example.json", window.location.href).toString(),
  new URL("../directory/contacts.example.json", window.location.href).toString(),
];

async function fetchFirstAvailable(urls) {
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        console.info("[contacts] geladen von:", u);
        return { json, url: u };
      } else {
        console.warn("[contacts] Kandidat nicht ok:", u, res.status);
      }
    } catch (e) {
      console.warn("[contacts] Kandidat fehlerhaft:", u, e);
    }
  }
  throw new Error("Kein Kandidatenpfad lieferte Daten.");
}

// In deinem loadContacts() anstelle des bisherigen fetch:
async function loadContacts() {
  let data, usedUrl;
  try {
    const out = await fetchFirstAvailable(CANDIDATE_URLS);
    data = out.json;
    usedUrl = out.url;
  } catch (e) {
    const container = document.querySelector("#contactsList");
    if (container) {
      container.innerHTML = `<div class="error-hint">Fehler beim Laden der Kontakte. Geprüfte Pfade:<br>${CANDIDATE_URLS.map(u=>`<code>${u}</code>`).join("<br>")}</div>`;
    }
    throw e;
  }

  // ... ab hier deine bestehende Normalisierung/Render-Logik
  // (CONTACTS = data.map(...); renderList(...); etc.)
}
