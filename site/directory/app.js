function renderList(list) {
  const container = document.querySelector("#contactsList");
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = `<div class="p-4 text-red-500">Keine Treffer.</div>`;
    return;
  }

  container.innerHTML = list.map(renderRow).join("");
}

// Kompakte Listen-Zeile
function renderRow(r) {
  const name = escapeHtml(r.fullName || `${r.firstName || ""} ${r.lastName || ""}`.trim()) || "—";
  const pos  = r.position ? `<span class="text-gray-500"> · ${escapeHtml(r.position)}</span>` : "";

  // Abteilungen als „Badges“
  const d1 = r.department1 ? `<span class="badge">${escapeHtml(r.department1)}</span>` : "";
  const d2 = r.department2 ? `<span class="badge">${escapeHtml(r.department2)}</span>` : "";
  const depts = (d1 || d2) ? `<div class="flex flex-wrap gap-2 mt-1">${d1}${d2}</div>` : "";

  // Kontaktfelder rechts in eine kompakte Spalte
  const right = [
    linePhone("Tel", r.phoneWork),
    linePhone("Tel2", r.phoneWork2),
    linePhone("Mobil", r.mobile),
    linePhone("Fax", r.fax),
    linePhone("Weitere Nr.", r.phoneOther),
    linePhone("Pager", r.pager),
    lineMail("E-Mail", r.emailDisplay),
  ].filter(Boolean).join("");

  return `
    <div class="contact-row flex items-start justify-between gap-4 p-3">
      <div class="min-w-0">
        <div class="font-medium truncate">${name}${pos}</div>
        ${depts}
        ${r.salutation ? `<div class="text-sm text-gray-500 mt-1">${escapeHtml(r.salutation)}</div>` : ""}
      </div>
      <div class="text-sm text-gray-700 flex flex-col gap-1 text-right">
        ${right || `<span class="text-gray-400">—</span>`}
      </div>
    </div>
  `;
}

function linePhone(label, value) {
  if (!value) return "";
  const valEsc = escapeHtml(value);
  return `<div><span class="text-gray-500">${label}:</span> <a class="underline" href="${telHref(value)}">${valEsc}</a></div>`;
}

function lineMail(label, value) {
  if (!value) return "";
  const valEsc = escapeHtml(value);
  return `<div><span class="text-gray-500">${label}:</span> <a class="underline" href="mailto:${valEsc}">${valEsc}</a></div>`;
}
