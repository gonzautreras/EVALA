const DATA_URL = "/data/live.json";
const FALLBACK_URL = "/data/mock.json";

const summaryCards = document.getElementById("summary-cards");
const recentTable = document.getElementById("recent-table");
const provinceFilter = document.getElementById("provinceFilter");
const statusCounts = document.getElementById("statusCounts");

let rawData = null;
let categoryChart = null;
let trendChart = null;

function formatPercent(value) {
  if (value === null || value === undefined) return "N/D";
  return `${Math.round(value * 100)}%`;
}

function formatNumber(value) {
  if (value === null || value === undefined) return "N/D";
  return new Intl.NumberFormat("es-EC").format(value);
}

async function loadData() {
  try {
    const live = await fetch(DATA_URL);
    if (live.ok) {
      return await live.json();
    }
  } catch (_) {}

  const fallback = await fetch(FALLBACK_URL);
  return fallback.json();
}

function renderCards(summary) {
  const items = [
    { label: "Reportes totales", value: formatNumber(summary.totalReports) },
    { label: "Alertas críticas", value: formatNumber(summary.alerts), accent: true },
    { label: "% Respuesta a tiempo", value: formatPercent(summary.responseRate) },
    {
      label: "Promedio resolución (h)",
      value:
        summary.avgResolutionHours === null || summary.avgResolutionHours === undefined
          ? "N/D"
          : summary.avgResolutionHours.toFixed(1),
    },
  ];

  summaryCards.innerHTML = items
    .map((item) => {
      const highlight = item.accent ? "style=\"color:var(--warn)\"" : "";
      return `
        <div class="card">
          <div class="label">${item.label}</div>
          <div class="value" ${highlight}>${item.value}</div>
        </div>
      `;
    })
    .join("");
}

function renderCategoryChart(data) {
  const ctx = document.getElementById("categoryChart");
  if (categoryChart) categoryChart.destroy();

  const categories = (data.byCategory || [])
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const truncate = (value, max = 22) =>
    value.length > max ? `${value.slice(0, max)}…` : value;
  categoryChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: categories.map((item) => item.category),
      datasets: [
        {
          label: "Alertas",
          data: categories.map((item) => item.count),
          backgroundColor: ["#156b6a", "#2b8b7e", "#70b98a", "#f3c969"],
          borderRadius: 8,
        },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label || "",
          },
        },
      },
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: {
          ticks: {
            callback: (value, index) => truncate(categories[index]?.category || ""),
          },
        },
      },
    },
  });
}

function renderTrendChart(data) {
  const ctx = document.getElementById("trendChart");
  if (trendChart) trendChart.destroy();

  const trend = data.trendByWeek || [];
  trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: trend.map((item) => item.week),
      datasets: [
        {
          label: "Reportes",
          data: trend.map((item) => item.count),
          borderColor: "#156b6a",
          backgroundColor: "rgba(21, 107, 106, 0.15)",
          tension: 0.35,
          fill: true,
          pointRadius: 3,
        },
      ],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 40 } },
      },
    },
  });
}

function renderMap(data) {
  const provinces = data.byProvince || [];
  const values = provinces.map((p) => p.count);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);

  const normalizeName = (value) =>
    (value || "")
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .toLowerCase()
      .replace(/\\s+/g, " ")
      .trim();

  const lookup = new Map(
    provinces.map((p) => [normalizeName(p.province), p.count])
  );

  const colorScale = (value) => {
    if (max === min) return "#5da39c";
    const ratio = (value - min) / (max - min);
    if (ratio < 0.34) return "#b8d7d2";
    if (ratio < 0.67) return "#5da39c";
    return "#0f2a29";
  };

  const nodes = document.querySelectorAll("#ecuadorMap #features path");
  nodes.forEach((node) => {
    const name = node.getAttribute("name") || "Provincia";
    const value = lookup.get(normalizeName(name)) || 0;
    node.setAttribute("fill", colorScale(value));
    node.setAttribute("data-count", String(value));

    const titleNode =
      node.querySelector("title") ||
      document.createElementNS("http://www.w3.org/2000/svg", "title");
    titleNode.textContent = `${name}: ${formatNumber(value)}`;
    if (!node.querySelector("title")) {
      node.appendChild(titleNode);
    }
  });

  const pointNodes = document.querySelectorAll("#ecuadorMap #label_points circle");
  pointNodes.forEach((node) => {
    const name = node.getAttribute("class") || "Provincia";
    const value = lookup.get(normalizeName(name)) || 0;
    node.setAttribute("fill", colorScale(value));
    node.setAttribute("data-count", String(value));

    const titleNode =
      node.querySelector("title") ||
      document.createElementNS("http://www.w3.org/2000/svg", "title");
    titleNode.textContent = `${name}: ${formatNumber(value)}`;
    if (!node.querySelector("title")) {
      node.appendChild(titleNode);
    }
  });
}

function populateProvinces(reports) {
  const provinces = Array.from(new Set(reports.map((r) => r.province))).sort();
  provinceFilter.innerHTML = `
    <option value="all">Todas</option>
    ${provinces
      .map((province) => `<option value="${province}">${province}</option>`)
      .join("")}
  `;
}

function renderTable(reports) {
  recentTable.innerHTML = reports
    .map((report) => {
      return `
        <tr>
          <td>${report.id}</td>
          <td>${report.date}</td>
          <td>${report.province}</td>
          <td>${report.category}</td>
          <td>${report.severity}</td>
          <td><span class="status-pill ${normalizeStatus(report.status)}">${statusLabel(
            normalizeStatus(report.status)
          )}</span></td>
          <td>${report.summary}</td>
        </tr>
      `;
    })
    .join("");
}

function normalizeStatus(value) {
  const normalized = String(value || "en_revision")
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[á]/g, "a")
    .replace(/[é]/g, "e")
    .replace(/[í]/g, "i")
    .replace(/[ó]/g, "o")
    .replace(/[ú]/g, "u");
  if (normalized === "enrevision") return "en_revision";
  if (normalized === "resuelto") return "resuelto";
  if (normalized === "escalado") return "escalado";
  return ["en_revision", "resuelto", "escalado"].includes(normalized)
    ? normalized
    : "en_revision";
}

function statusLabel(value) {
  const map = {
    en_revision: "En revisión",
    resuelto: "Resuelto",
    escalado: "Escalado",
  };
  return map[value] || "En revisión";
}

function renderStatusCounts(data) {
  if (!statusCounts) return;
  const list = data.byStatus || [];
  statusCounts.innerHTML = list
    .map((item) => {
      const key = normalizeStatus(item.status);
      return `<div class="status-item"><span>${statusLabel(key)}</span><strong>${formatNumber(
        item.count
      )}</strong></div>`;
    })
    .join("");
}


function buildDerivedData(reports) {
  const withResponse = reports.filter((r) => r.responseTimeHours !== undefined);
  const onTime = withResponse.filter((r) => r.responseTimeHours <= 24).length;
  const responseRate =
    withResponse.length > 0 ? onTime / withResponse.length : null;

  const withResolution = reports.filter((r) => r.resolutionHours !== undefined);
  const avgResolutionHours =
    withResolution.length > 0
      ? withResolution.reduce((sum, r) => sum + r.resolutionHours, 0) /
        withResolution.length
      : null;

  const summary = {
    totalReports: reports.length,
    alerts: reports.filter((r) => r.severity === "Alta").length,
    responseRate,
    avgResolutionHours,
  };

  return {
    summary,
    byCategory: groupCount(reports, "category").map((item) => ({
      category: item.category,
      count: item.count,
    })),
    byProvince: groupCount(reports, "province").map((item) => ({
      province: item.province,
      count: item.count,
    })),
    byStatus: groupCount(reports, "status").map((item) => ({
      status: normalizeStatus(item.status),
      count: item.count,
    })),
    trendByWeek: computeTrend(reports),
  };
}

function applyFilters() {
  const value = provinceFilter.value;
  let filtered = rawData.recentReports || [];

  if (value !== "all") {
    filtered = filtered.filter((r) => r.province === value);
  }

  renderTable(filtered);

  const derived = buildDerivedData(filtered);
  renderCards(derived.summary);
  renderMap(derived);
  renderCategoryChart(derived);
  renderTrendChart(derived);
  renderStatusCounts(derived);
}

function attachFilter() {
  provinceFilter.addEventListener("change", applyFilters);
}

function groupCount(items, key) {
  const map = new Map();
  items.forEach((item) => {
    const value = item[key] || "Sin dato";
    map.set(value, (map.get(value) || 0) + 1);
  });
  return Array.from(map.entries()).map(([label, count]) => ({
    [key]: label,
    count,
  }));
}

function weekLabel(dateStr) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const diff = date - firstDay;
  const week = Math.ceil((diff / 86400000 + firstDay.getDay() + 1) / 7);
  return `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function computeTrend(reports) {
  const map = new Map();
  reports.forEach((report) => {
    const label = weekLabel(report.date);
    map.set(label, (map.get(label) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => (a.week > b.week ? 1 : -1));
}

async function init() {
  rawData = await loadData();

  const reports = rawData.recentReports || [];
  const derived = {
    summary: rawData.summary,
    byCategory: rawData.byCategory,
    byProvince: rawData.byProvince,
    byStatus: rawData.byStatus,
    trendByWeek: rawData.trendByWeek,
  };

  const normalized = {
    summary: derived.summary,
    byCategory: derived.byCategory,
    byProvince: derived.byProvince,
    byStatus: derived.byStatus,
    trendByWeek: derived.trendByWeek,
  };

  const computed = buildDerivedData(reports);
  const merged = {
    summary: normalized.summary || computed.summary,
    byCategory: normalized.byCategory || computed.byCategory,
    byProvince: normalized.byProvince || computed.byProvince,
    byStatus: normalized.byStatus || computed.byStatus,
    trendByWeek: normalized.trendByWeek || computed.trendByWeek,
  };

  renderCards(merged.summary);
  renderMap(merged);
  renderCategoryChart(merged);
  renderTrendChart(merged);
  renderStatusCounts(merged);
  populateProvinces(reports);
  renderTable(reports);
  attachFilter();

  setInterval(async () => {
    const current = provinceFilter.value;
    rawData = await loadData();
    const updatedReports = rawData.recentReports || [];
    populateProvinces(updatedReports);
    if (current && Array.from(provinceFilter.options).some((o) => o.value === current)) {
      provinceFilter.value = current;
    } else {
      provinceFilter.value = "all";
    }
    applyFilters();
  }, 5000);

}

init();
