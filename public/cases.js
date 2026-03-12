const casesList = document.getElementById("casesList");
const caseDetail = document.getElementById("caseDetail");

const casesSession = requireAuth("cases", "/cases-login.html");
setUserLabel("userName", casesSession);
bindLogout("logoutBtn", "cases", "/cases-login.html");
startSessionCountdown("sessionTimer", casesSession, "cases", "/cases-login.html");

let records = [];
let activeId = null;

const STATUS = ["en_revision", "resuelto", "escalado"];

const TRANSITIONS = {
  en_revision: ["resuelto", "escalado"],
  escalado: ["resuelto"],
  resuelto: [],
};

function normalizeStatus(value) {
  return String(value || "en_revision")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[á]/g, "a")
    .replace(/[é]/g, "e")
    .replace(/[í]/g, "i")
    .replace(/[ó]/g, "o")
    .replace(/[ú]/g, "u");
}

function labelStatus(value) {
  const map = {
    en_revision: "En revisión",
    resuelto: "Resuelto",
    escalado: "Escalado",
  };
  return map[value] || value;
}

async function loadData() {
  const res = await fetch("/data/live.json");
  if (!res.ok) return [];
  const data = await res.json();
  return data.recentReports || [];
}

function renderList() {
  casesList.innerHTML = records
    .map((r) => {
      const status = labelStatus(normalizeStatus(r.status));
      const active = r.id === activeId ? "active" : "";
      return `
        <div class="case-item ${active}" data-id="${r.id}">
          <strong>${r.id}</strong>
          <div class="meta">${r.province} • ${r.date}</div>
          <div class="meta">${status} • ${r.severity}</div>
        </div>
      `;
    })
    .join("");

  Array.from(casesList.querySelectorAll(".case-item")).forEach((item) => {
    item.addEventListener("click", () => {
      activeId = item.dataset.id;
      renderList();
      renderDetail();
    });
  });
}

function renderDetail() {
  const record = records.find((r) => String(r.id) === String(activeId));
  if (!record) {
    caseDetail.innerHTML = '<div class="empty">Selecciona un caso para ver el detalle.</div>';
    return;
  }

  const statusKey = normalizeStatus(record.status);
  const allowed = TRANSITIONS[statusKey] || [];

  const options = allowed
    .map((s) => `<option value="${s}">${labelStatus(s)}</option>`)
    .join("");

  caseDetail.innerHTML = `
    <div class="case-grid">
      <div class="case-field"><strong>ID:</strong> ${record.id}</div>
      <div class="case-field"><strong>Provincia:</strong> ${record.province}</div>
      <div class="case-field"><strong>Categoría:</strong> ${record.category}</div>
      <div class="case-field"><strong>Criticidad:</strong> ${record.severity}</div>
      <div class="case-field"><strong>Estado actual:</strong> ${labelStatus(statusKey)}</div>
      <div class="case-field"><strong>Resumen:</strong> ${record.summary}</div>
    </div>

    <div class="case-actions">
      <label>Responsable</label>
      <input id="assignedTo" placeholder="Nombre del responsable" value="${record.assignedTo || ""}" />

      <label>Nuevo estado</label>
      <select id="newStatus">
        <option value="">Selecciona un estado</option>
        ${options}
      </select>

      <label>Observación breve</label>
      <textarea id="observation" placeholder="Escribe una observación breve"></textarea>

      <div class="case-buttons">
        <button id="saveCase" class="btn primary">Guardar cambio</button>
        ${record.severity === "Alta" ? '<button id="escalateCase" class="btn warning">Escalar</button>' : ""}
        <a class="btn" href="/dashboard">Volver al dashboard</a>
      </div>
      <div class="notice">Reglas: Resuelto no se modifica. Escalado puede pasar a resuelto.</div>
      <div class="notice" id="caseMessage"></div>
    </div>
  `;

  const saveBtn = document.getElementById("saveCase");
  const escalateBtn = document.getElementById("escalateCase");
  const msg = document.getElementById("caseMessage");

  saveBtn.addEventListener("click", async () => {
    const newStatus = document.getElementById("newStatus").value;
    const observation = document.getElementById("observation").value.trim();
    const assignedTo = document.getElementById("assignedTo").value.trim();

    if (!newStatus) {
      msg.textContent = "Selecciona un nuevo estado válido.";
      return;
    }

    if (!allowed.includes(newStatus)) {
      msg.textContent = "Transición no permitida.";
      return;
    }

    if (newStatus === "resuelto" && !observation) {
      msg.textContent = "Para resuelto, la observación es obligatoria.";
      return;
    }

    await updateCase(record.id, { status: newStatus, observation, assignedTo });
  });

  if (escalateBtn) {
    escalateBtn.addEventListener("click", async () => {
      await updateCase(record.id, { status: "escalado", observation: "Escalado por criticidad alta." });
    });
  }
}

async function updateCase(id, update) {
  const res = await fetch(`/api/records/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ update }),
  });

  const msg = document.getElementById("caseMessage");
  if (!res.ok) {
    msg.textContent = "No se pudo guardar el cambio.";
    return;
  }
  msg.textContent = "Cambio guardado.";
  records = await loadData();
  renderList();
  renderDetail();
}

async function init() {
  records = await loadData();
  renderList();
  renderDetail();
}

init();
