const chatHistory = document.getElementById("chatHistory");
const chatText = document.getElementById("chatText");
const chatSend = document.getElementById("chatSend");
const chatFinalize = document.getElementById("chatFinalize");

const chatSession = requireAuth("chat", "/chat-login.html");
setUserLabel("userName", chatSession);
bindLogout("logoutBtn", "chat", "/chat-login.html");
startSessionCountdown("sessionTimer", chatSession, "chat", "/chat-login.html");

let conversation = [];
let lastAgentOutput = null;
let pendingProvince = null;
let incidentDraft = null;
let documentBase = null;

function appendMessage(role, text) {
  const node = document.createElement("div");
  node.className = `chat-message ${role}`;
  node.textContent = text;
  chatHistory.appendChild(node);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function detectProvince(text) {
  const provinces = [
    "Pichincha","Guayas","Azuay","Manabí","Pastaza","Galápagos","Esmeraldas","Los Ríos",
    "Tungurahua","Chimborazo","Imbabura","Cotopaxi","Loja","El Oro","Cañar","Napo",
    "Orellana","Sucumbíos","Morona Santiago","Santa Elena","Santo Domingo de los Tsáchilas","Bolívar"
  ];
  const normalized = normalizeText(text);

  const match = provinces.find((p) =>
    normalized.includes(normalizeText(p))
  );
  return match || "Sin dato";
}

async function loadDocumentBase() {
  if (documentBase) return documentBase;
  const res = await fetch("/data/document_base.json");
  if (!res.ok) {
    throw new Error("No se pudo cargar la base documental");
  }
  documentBase = await res.json();
  return documentBase;
}

function scoreIncident(text, incident) {
  const normalized = normalizeText(text);
  const keywords = incident.keywords || [];
  let hits = 0;
  keywords.forEach((k) => {
    if (normalized.includes(normalizeText(k))) hits += 1;
  });
  const score = keywords.length ? hits / keywords.length : 0;
  return { score, hits };
}

function pickIncident(text, incidents) {
  let best = null;
  incidents.forEach((incident) => {
    const result = scoreIncident(text, incident);
    if (!best || result.score > best.score) {
      best = { incident, ...result };
    }
  });
  return best;
}

function nowISO() {
  return new Date().toISOString();
}

function dateOnly(iso) {
  return iso.slice(0, 10);
}

async function classifyFromDocument(text) {
  const base = await loadDocumentBase();
  const incidents = base.incidents || [];
  const best = pickIncident(text, incidents);

  if (!best || best.score < 0.2) {
    return {
      requiresManualReview: true,
      confidence: best ? Number(best.score.toFixed(2)) : 0,
      response: "No hay respaldo suficiente en el documento para clasificar este caso. Revisión manual requerida.",
      reference: base.document?.name || "Documento oficial",
    };
  }

  const incident = best.incident;
  const confidence = Number(best.score.toFixed(2));
  const escalamiento = incident.escalamiento ? "Sí" : "No";

  return {
    classification: incident.problema,
    category: incident.problema,
    severity: incident.criticidad,
    impact: incident.impacto,
    solution: incident.protocolo,
    escalation: incident.escalamiento,
    reference: incident.referencia,
    confidence,
    requiresManualReview: false,
    response:
      `Clasificación documental: ${incident.problema}. ` +
      `Criticidad: ${incident.criticidad}. Impacto: ${incident.impacto}. ` +
      `Acción inicial: ${incident.protocolo} ` +
      `Escalamiento: ${escalamiento}. ` +
      `Referencia: ${incident.referencia}.`
  };
}

async function registerConversation() {
  if (!conversation.length || !lastAgentOutput) return;

  const userMessage = conversation
    .filter((m) => m.role === "user")
    .map((m) => m.text)
    .join(" ");
  const province = pendingProvince || detectProvince(userMessage);
  const timestamp = nowISO();

  const record = {
    id: `EV-${Date.now()}`,
    date: dateOnly(timestamp),
    dateTime: timestamp,
    province: province || "Sin dato",
    category: lastAgentOutput.category || "Sin clasificación",
    severity: lastAgentOutput.severity || "Sin criticidad",
    status: lastAgentOutput.requiresManualReview ? "escalado" : "en_revision",
    source: "Chat Web",
    responseTimeHours: 6,
    resolutionHours: 24,
    summary: (incidentDraft || userMessage).slice(0, 120) || "Reporte generado desde chat.",
    conversation,
    agentOutput: lastAgentOutput,
    documentReference: lastAgentOutput.reference || "Documento oficial",
    documentClassification: lastAgentOutput.classification || "Sin clasificación",
    documentSolution: lastAgentOutput.solution || "Sin solución",
    confidence: lastAgentOutput.confidence || 0,
    manualReview: lastAgentOutput.requiresManualReview === true,
  };

  try {
    const res = await fetch("/api/records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ record }),
    });
    if (!res.ok) {
      appendMessage("assistant", "No se pudo registrar el caso. Verifica el servidor.");
      return;
    }

    appendMessage(
      "assistant",
      `Registro creado. Categoría: ${record.category}. Severidad: ${record.severity}. Estado: ${record.status}.`
    );
  } catch (err) {
    appendMessage("assistant", "Error al guardar. Abre el chat desde http://localhost:3000/chat.html");
    return;
  }

  conversation = [];
  lastAgentOutput = null;
  pendingProvince = null;
  incidentDraft = null;
  chatText.value = "";
}

chatSend.addEventListener("click", async () => {
  const text = chatText.value.trim();
  if (!text) return;
  appendMessage("user", text);
  conversation.push({ role: "user", text, ts: new Date().toISOString() });

  if (!pendingProvince) {
    const detected = detectProvince(text);
    if (detected === "Sin dato") {
      incidentDraft = text;
      pendingProvince = "PENDIENTE";
      const ask = "¿En qué provincia ocurrió el incidente?";
      appendMessage("assistant", ask);
      conversation.push({ role: "assistant", text: ask, ts: new Date().toISOString() });
      chatText.value = "";
      return;
    }
    pendingProvince = detected;
    incidentDraft = text;
  } else if (pendingProvince === "PENDIENTE") {
    pendingProvince = text;
  }

  const basis = incidentDraft || text;
  try {
    lastAgentOutput = await classifyFromDocument(basis);
  } catch (err) {
    lastAgentOutput = {
      requiresManualReview: true,
      confidence: 0,
      response: "No se pudo consultar el documento. Revisión manual requerida.",
      reference: "Documento oficial",
    };
  }

  const response =
    `${lastAgentOutput.response} Provincia registrada: ${pendingProvince}.` +
    (lastAgentOutput.requiresManualReview ? " Se requiere revisión manual." : "");

  appendMessage("assistant", response);
  conversation.push({
    role: "assistant",
    text: response,
    ts: new Date().toISOString(),
  });
  chatText.value = "";
});

chatFinalize.addEventListener("click", () => {
  registerConversation();
});
