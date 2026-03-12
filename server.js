const http = require("node:http");
const { readFile, writeFile, stat } = require("node:fs/promises");
const { createReadStream } = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const ROOT = path.resolve("/Users/gfutreras/Documents/EVALA_codex");
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const LIVE_PATH = path.join(DATA_DIR, "live.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const ALLOWED_STATUSES = new Set(["en_revision", "resuelto", "escalado"]);

function normalizeStatus(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[á]/g, "a")
    .replace(/[é]/g, "e")
    .replace(/[í]/g, "i")
    .replace(/[ó]/g, "o")
    .replace(/[ú]/g, "u");

  if (ALLOWED_STATUSES.has(normalized)) return normalized;
  if (normalized === "en_revision" || normalized === "enrevision") return "en_revision";
  if (normalized === "resuelto") return "resuelto";
  if (normalized === "escalado") return "escalado";
  return "en_revision";
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function handleWebhook(req, res) {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", async () => {
    try {
      const payload = raw ? JSON.parse(raw) : null;
      if (!payload || !payload.records) {
        return send(
          res,
          400,
          JSON.stringify({ ok: false, error: "records es requerido" })
        );
      }

      const records = Array.isArray(payload.records)
        ? payload.records.map((record) => ({
            ...record,
            status: normalizeStatus(record.status),
          }))
        : [];

      const normalized = {
        updatedAt: new Date().toISOString(),
        summary: payload.summary || null,
        byCategory: payload.byCategory || null,
        byRegion: payload.byRegion || null,
        trendByWeek: payload.trendByWeek || null,
        recentReports: records,
      };

      await writeFile(LIVE_PATH, JSON.stringify(normalized, null, 2), "utf-8");
      return send(res, 200, JSON.stringify({ ok: true }));
    } catch (err) {
      return send(
        res,
        400,
        JSON.stringify({ ok: false, error: "JSON inválido" })
      );
    }
  });
}

function weekLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const diff = date - firstDay;
  const week = Math.ceil((diff / 86400000 + firstDay.getUTCDay() + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function recomputeAggregates(reports) {
  const byCategory = new Map();
  const byProvince = new Map();
  const byStatus = new Map();
  const trendByWeek = new Map();

  let alerts = 0;
  let onTime = 0;
  let responseCount = 0;
  let resolutionTotal = 0;
  let resolutionCount = 0;

  reports.forEach((r) => {
    if (r.severity === "Alta") alerts += 1;
    if (r.responseTimeHours !== undefined) {
      responseCount += 1;
      if (r.responseTimeHours <= 24) onTime += 1;
    }
    if (r.resolutionHours !== undefined) {
      resolutionTotal += r.resolutionHours;
      resolutionCount += 1;
    }

    const statusKey = normalizeStatus(r.status);
    byCategory.set(r.category, (byCategory.get(r.category) || 0) + 1);
    byProvince.set(r.province, (byProvince.get(r.province) || 0) + 1);
    byStatus.set(statusKey, (byStatus.get(statusKey) || 0) + 1);
    const week = weekLabel(r.date);
    trendByWeek.set(week, (trendByWeek.get(week) || 0) + 1);
  });

  return {
    summary: {
      totalReports: reports.length,
      alerts,
      responseRate: responseCount > 0 ? onTime / responseCount : null,
      avgResolutionHours:
        resolutionCount > 0 ? resolutionTotal / resolutionCount : null,
    },
    byCategory: Array.from(byCategory.entries()).map(([category, count]) => ({
      category,
      count,
    })),
    byProvince: Array.from(byProvince.entries()).map(([province, count]) => ({
      province,
      count,
    })),
    byStatus: Array.from(byStatus.entries()).map(([status, count]) => ({
      status,
      count,
    })),
    trendByWeek: Array.from(trendByWeek.entries())
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => (a.week > b.week ? 1 : -1)),
  };
}

async function loadDataFile() {
  try {
    const live = await readFile(LIVE_PATH, "utf-8");
    return JSON.parse(live);
  } catch {
    const mock = await readFile(path.join(DATA_DIR, "mock.json"), "utf-8");
    return JSON.parse(mock);
  }
}

async function handleRecordAppend(req, res) {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", async () => {
    try {
      const payload = raw ? JSON.parse(raw) : null;
      if (!payload || !payload.record) {
        return send(
          res,
          400,
          JSON.stringify({ ok: false, error: "record es requerido" })
        );
      }

      const record = payload.record;
      if (!record.dateTime) {
        record.dateTime = new Date().toISOString();
      }
      if (!record.date) {
        record.date = record.dateTime.slice(0, 10);
      }
      record.status = normalizeStatus(record.status);

      const data = await loadDataFile();
      const reports = Array.isArray(data.recentReports) ? data.recentReports : [];
      reports.unshift(record);

      const aggregates = recomputeAggregates(reports);
      const updated = {
        updatedAt: new Date().toISOString(),
        summary: aggregates.summary,
        byCategory: aggregates.byCategory,
        byProvince: aggregates.byProvince,
        byStatus: aggregates.byStatus,
        trendByWeek: aggregates.trendByWeek,
        recentReports: reports,
      };

      await writeFile(LIVE_PATH, JSON.stringify(updated, null, 2), "utf-8");
      await writeFile(
        path.join(DATA_DIR, "mock.json"),
        JSON.stringify(updated, null, 2),
        "utf-8"
      );
      return send(res, 200, JSON.stringify({ ok: true }));
    } catch (err) {
      return send(
        res,
        400,
        JSON.stringify({ ok: false, error: "JSON inválido" })
      );
    }
  });
}

async function handleRecordUpdate(req, res, id) {
  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", async () => {
    try {
      const payload = raw ? JSON.parse(raw) : null;
      if (!payload || !payload.update) {
        return send(
          res,
          400,
          JSON.stringify({ ok: false, error: "update es requerido" })
        );
      }

      const data = await loadDataFile();
      const reports = Array.isArray(data.recentReports) ? data.recentReports : [];
      const index = reports.findIndex((r) => String(r.id) === String(id));
      if (index === -1) {
        return send(res, 404, JSON.stringify({ ok: false, error: "No encontrado" }));
      }

      const record = reports[index];
      if (normalizeStatus(record.status) === "resuelto") {
        return send(
          res,
          400,
          JSON.stringify({ ok: false, error: "Caso resuelto no modificable" })
        );
      }

      const update = payload.update;
      if (update.status) record.status = normalizeStatus(update.status);
      if (update.assignedTo !== undefined) record.assignedTo = update.assignedTo;
      if (update.observation) {
        record.observations = record.observations || [];
        record.observations.unshift({
          text: update.observation,
          at: new Date().toISOString(),
        });
      }

      const aggregates = recomputeAggregates(reports);
      const updated = {
        updatedAt: new Date().toISOString(),
        summary: aggregates.summary,
        byCategory: aggregates.byCategory,
        byProvince: aggregates.byProvince,
        byStatus: aggregates.byStatus,
        trendByWeek: aggregates.trendByWeek,
        recentReports: reports,
      };

      await writeFile(LIVE_PATH, JSON.stringify(updated, null, 2), "utf-8");
      await writeFile(
        path.join(DATA_DIR, "mock.json"),
        JSON.stringify(updated, null, 2),
        "utf-8"
      );
      return send(res, 200, JSON.stringify({ ok: true }));
    } catch (err) {
      return send(res, 400, JSON.stringify({ ok: false, error: "JSON inválido" }));
    }
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname =
    url.pathname === "/"
      ? "/index.html"
      : url.pathname === "/dashboard" || url.pathname === "/dashboard/"
      ? "/dashboard.html"
      : url.pathname;

  if (pathname.startsWith("/data/")) {
    const dataPath = path.join(DATA_DIR, pathname.replace("/data/", ""));
    if (!(await fileExists(dataPath))) {
      return send(res, 404, JSON.stringify({ ok: false, error: "No encontrado" }));
    }
    res.writeHead(200, { "Content-Type": MIME[".json"] });
    return createReadStream(dataPath).pipe(res);
  }

  const filePath = path.join(PUBLIC_DIR, pathname);
  if (!(await fileExists(filePath))) {
    return send(res, 404, "Not found", "text/plain; charset=utf-8");
  }

  const ext = path.extname(filePath);
  const type = MIME[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  return createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return send(res, 200, JSON.stringify({ ok: true, time: new Date().toISOString() }));
  }

  if (req.method === "POST" && url.pathname === "/webhook/evala") {
    return handleWebhook(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/records") {
    return handleRecordAppend(req, res);
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/records/")) {
    const id = url.pathname.replace("/api/records/", "");
    return handleRecordUpdate(req, res, id);
  }

  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`EVALA dashboard listo en http://localhost:${PORT}`);
  console.log("Webhook local listo en POST /webhook/evala");
});
