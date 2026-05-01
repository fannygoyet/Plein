/* Mes Pleins — design iOS natif (Settings.app / Health) */

const VERSION = "1.3.0";
const STORAGE_KEY = "mes_pleins_v1";
const VEHICLES_KEY = "plein_vehicles_v1";
const DASHBOARD_KEY = "plein_dashboard_v1";   // ordre + visibilité des tuiles
const PROFILE_KEY = "plein_profile_v1";       // prénom de l'utilisateur

// Véhicule par défaut : la Mégane (toutes les données du seed lui sont rattachées)
const DEFAULT_VEHICLE = {
  id: "megane",
  name: "Mégane 3",
  fuel: "gazole",
  start_date: "2021-09-05",
  active: true,
};

const FUEL_LABELS = { essence: "Essence", gazole: "Gazole", e85: "E85", electrique: "Électrique" };

const STATION_LABELS = {
  intermarche: "Intermarché",
  leclerc: "Leclerc",
  super_u: "Super U",
  carrefour: "Carrefour",
  total: "Total",
  auchan: "Auchan",
  casino: "Casino",
  esso: "Esso",
  bp: "BP",
  shell: "Shell",
  avia: "Avia",
  autre: "Autre",
};

// Initiales courtes pour le badge station de l'historique (style iOS Wallet)
const STATION_INITIALS = {
  intermarche: "INT",
  leclerc: "LEC",
  super_u: "SU",
  carrefour: "CAR",
  total: "TOT",
  auchan: "AUC",
  casino: "CAS",
  esso: "ESS",
  bp: "BP",
  shell: "SH",
  avia: "AV",
  autre: "?",
  null: "?",
};

const STATION_COLORS = {
  intermarche: "#ff3b30",
  leclerc:     "#0a84ff",
  super_u:     "#34c759",
  carrefour:   "#5856d6",
  total:       "#ff9500",
  auchan:      "#af52de",
  casino:      "#30d158",
  esso:        "#5ac8fa",
  bp:          "#34c759",
  shell:       "#ffcc00",
  avia:        "#ff2d55",
  autre:       "#8e8e93",
  null:        "#8e8e93",
};

// ===== State =====
let pleins = [];
let vehicles = [];        // [{id, name, fuel, start_date, active}]
let activeVehicleId = null;
let profile = { name: "Fanny" };
let dashboardLayout = null;  // {order: [tileIds], hidden: [tileIds]}
let editMode = false;

// ===== Utils =====
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtNum(n, decimals = 0) {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
function fmtEur(n) { return n == null ? "—" : fmtNum(n, 2) + " €"; }
function fmtL(n) { return n == null ? "—" : fmtNum(n, 2) + " L"; }
function fmtKm(n) { return n == null ? "—" : fmtNum(n, 0) + " km"; }
function fmtPrixL(n) { return n == null ? "—" : fmtNum(n, 3) + " €/L"; }

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}
function fmtDateLong(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function stationLabel(s, custom) {
  if (s === "autre" && custom) return custom;
  return STATION_LABELS[s] || s || "—";
}
function stationInitial(s) {
  return STATION_INITIALS[s] || STATION_INITIALS.null;
}
function stationColor(s) {
  return STATION_COLORS[s] || STATION_COLORS.null;
}

function toast(msg, type = "") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast " + type;
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => t.classList.remove("show"), 2000);
}

// ===== Storage =====
function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(pleins)); }

function loadProfile() {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function saveProfile() { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }

function loadDashboard() {
  const raw = localStorage.getItem(DASHBOARD_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function saveDashboard() { localStorage.setItem(DASHBOARD_KEY, JSON.stringify(dashboardLayout)); }

function loadVehicles() {
  const raw = localStorage.getItem(VEHICLES_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function saveVehicles() { localStorage.setItem(VEHICLES_KEY, JSON.stringify(vehicles)); }

function getActiveVehicle() {
  return vehicles.find((v) => v.id === activeVehicleId) || vehicles.find((v) => v.active) || vehicles[0] || null;
}
function vehicleById(id) { return vehicles.find((v) => v.id === id) || null; }
function vehicleName(id) { const v = vehicleById(id); return v ? v.name : "—"; }

async function seedFromMessenger() {
  // Tente de charger un seed local (data.json). Absent du repo public,
  // chaque visiteur démarre avec une app vide.
  try {
    const r = await fetch("data.json", { cache: "no-store" });
    if (!r.ok) return [];
    const data = await r.json();
    return data.map((p) => ({
      id: uid(),
      date: p.date,
      station: p.station,
      station_custom: null,
      km: p.km,
      litres: p.litres,
      prix_litre: p.prix_litre,
      total: p.total,
      missed_before: false,
      vehicle_id: DEFAULT_VEHICLE.id,
    }));
  } catch {
    return [];
  }
}

// ===== Widgets / tuiles dashboard =====
// Ordre par défaut, taille, libellé court (visible dans le menu d'ajout).
const TILES = [
  { id: "hero",       size: "hero",  label: "En-tête véhicule" },
  { id: "year",       size: "small", label: "km cette année" },
  { id: "month",      size: "small", label: "km ce mois" },
  { id: "rolling12",  size: "small", label: "12 derniers mois" },
  { id: "conso",      size: "small", label: "Conso moyenne" },
  { id: "lastFill",   size: "wide",  label: "Dernier plein" },
  { id: "nextFill",   size: "wide",  label: "Prochain plein estimé" },
  { id: "totalSpent", size: "small", label: "Total dépensé" },
  { id: "lastPrice",  size: "small", label: "Prix actuel /L" },
  { id: "topStation", size: "small", label: "Station favorite" },
  { id: "streak",     size: "small", label: "Jours depuis dernier plein" },
  { id: "totalKm",    size: "small", label: "km total parcourus" },
  { id: "recordPrice",size: "small", label: "Prix max enregistré" },
  { id: "recordCheap",size: "small", label: "Prix le moins cher" },
];

function renderDashboard() {
  const dash = $("#dashboard");
  if (!dash) return;
  const order = dashboardLayout.order || TILES.map((t) => t.id);
  const hidden = new Set(dashboardLayout.hidden || []);
  const visible = order.filter((id) => !hidden.has(id) && TILES.find((t) => t.id === id));

  dash.innerHTML = visible.map((id) => {
    const tile = TILES.find((t) => t.id === id);
    if (!tile) return "";
    const html = renderTile(id);
    if (!html) return "";
    return `<div class="tile ${tile.size === "wide" ? "wide" : ""} ${tile.size === "hero" ? "hero" : ""}" data-tile="${id}" draggable="true">
      <span class="tile-remove" data-remove="${id}">−</span>
      ${html}
    </div>`;
  }).join("");

  dash.classList.toggle("edit-mode", editMode);
  // Liste des modules masqués
  const hiddenList = $("#hidden-tiles-list");
  if (hiddenList) {
    const hiddenTiles = order.filter((id) => hidden.has(id));
    if (hiddenTiles.length === 0) {
      hiddenList.innerHTML = `<div class="list-row" style="cursor:default; color:var(--ios-text-2)">Aucun module masqué</div>`;
    } else {
      hiddenList.innerHTML = hiddenTiles.map((id) => {
        const t = TILES.find((x) => x.id === id);
        return `<div class="list-row" data-restore="${id}">
          <div class="row-icon bg-blue">＋</div>
          <span class="row-label">${escapeHtml(t ? t.label : id)}</span>
        </div>`;
      }).join("");
    }
  }
  $("#edit-actions").classList.toggle("hidden", !editMode);
  $("#nav-edit-btn").textContent = editMode ? "OK" : "Modifier";
  $("#nav-edit-btn").style.fontWeight = editMode ? "600" : "400";

  enableDragAndDrop();
}

function renderTile(id) {
  const ap = activePleins();
  const v = getActiveVehicle();
  const stats = computeStats();
  const today = new Date();

  switch (id) {
    case "hero": {
      if (!v) return "";
      const km = stats ? fmtNum(stats.totalKm) : "—";
      const conso = stats && stats.consoMoyenne ? fmtNum(stats.consoMoyenne, 2) + " L/100" : "—";
      return `
        <div class="hero-row">
          <div class="hero-emoji">🚗</div>
          <div class="hero-text">
            <h2 class="hero-name">${escapeHtml(v.name)}</h2>
            <p class="hero-meta">${ap.length} pleins · ${km} km · ${conso}</p>
          </div>
        </div>`;
    }
    case "year": {
      if (!stats) return null;
      return `
        <div class="tile-label"><span class="tile-icon bg-indigo">▲</span>${today.getFullYear()}</div>
        <div class="tile-value">${fmtNum(stats.kmYTD || 0)}<span class="unit">km</span></div>
        <div class="tile-sub">depuis le 1ᵉʳ janvier</div>`;
    }
    case "month": {
      if (!stats) return null;
      const mStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
      const km = kmSincePeriod([...ap].sort((a, b) => (a.date < b.date ? -1 : 1)), mStart);
      const monthName = today.toLocaleDateString("fr-FR", { month: "long" });
      return `
        <div class="tile-label"><span class="tile-icon bg-teal">↻</span>Ce mois</div>
        <div class="tile-value">${fmtNum(km || 0)}<span class="unit">km</span></div>
        <div class="tile-sub">en ${monthName}</div>`;
    }
    case "rolling12": {
      if (!stats || stats.km12Months == null) return null;
      return `
        <div class="tile-label"><span class="tile-icon bg-purple">↻</span>12 mois</div>
        <div class="tile-value">${fmtNum(stats.km12Months)}<span class="unit">km</span></div>
        <div class="tile-sub">glissants</div>`;
    }
    case "conso": {
      if (!stats || stats.consoMoyenne == null) return null;
      return `
        <div class="tile-label"><span class="tile-icon bg-red">▾</span>Conso</div>
        <div class="tile-value">${fmtNum(stats.consoMoyenne, 2)}<span class="unit">L/100</span></div>
        <div class="tile-sub">moyenne globale</div>`;
    }
    case "lastFill": {
      if (ap.length === 0) return null;
      const sorted = [...ap].sort((a, b) => (a.date < b.date ? 1 : -1));
      const last = sorted[0];
      return `
        <div class="tile-label"><span class="tile-icon bg-blue">⏱</span>Dernier plein</div>
        <div class="tile-value">${fmtDate(last.date)}</div>
        <div class="tile-sub">${stationLabel(last.station, last.station_custom)} · ${fmtNum(last.km)} km · ${fmtNum(last.litres, 2)} L · ${fmtNum(last.total, 2)} €</div>`;
    }
    case "nextFill": {
      const pred = predictNextPlein();
      if (!pred) return null;
      const litresStr = pred.litres ? ` · ~${fmtNum(pred.litres, 1)} L` : "";
      return `
        <div class="tile-label"><span class="tile-icon bg-orange">◇</span>Prochain plein estimé</div>
        <div class="tile-value">~${fmtNum(pred.km)}<span class="unit">km</span></div>
        <div class="tile-sub">${pred.kmPerDay} km/jour · ${pred.daysSinceLast}j depuis le dernier${litresStr}</div>`;
    }
    case "totalSpent": {
      if (!stats) return null;
      return `
        <div class="tile-label"><span class="tile-icon bg-green">€</span>Total</div>
        <div class="tile-value">${fmtNum(stats.totalEur, 0)}<span class="unit">€</span></div>
        <div class="tile-sub">dépensé en carburant</div>`;
    }
    case "lastPrice": {
      if (ap.length === 0) return null;
      const sorted = [...ap].sort((a, b) => (a.date < b.date ? 1 : -1));
      const last = sorted[0];
      const avg = stats && stats.prixMoyen ? stats.prixMoyen : null;
      let trend = "";
      if (avg && last.prix_litre) {
        const diff = ((last.prix_litre - avg) / avg) * 100;
        const cls = diff > 0 ? "up" : "down";
        const sign = diff > 0 ? "▲" : "▼";
        trend = `<div class="tile-trend ${cls}">${sign} ${Math.abs(diff).toFixed(1)}% vs moyenne</div>`;
      }
      return `
        <div class="tile-label"><span class="tile-icon bg-pink">€</span>Dernier prix</div>
        <div class="tile-value">${last.prix_litre ? fmtNum(last.prix_litre, 3) : "—"}<span class="unit">€/L</span></div>
        ${trend}`;
    }
    case "topStation": {
      if (ap.length === 0) return null;
      const counts = {};
      for (const p of ap) {
        const k = p.station || "autre";
        counts[k] = (counts[k] || 0) + 1;
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (!top) return null;
      const [key, count] = top;
      return `
        <div class="tile-label"><span class="tile-icon bg-yellow">★</span>Favorite</div>
        <div class="tile-value" style="font-size:24px">${escapeHtml(STATION_LABELS[key] || key)}</div>
        <div class="tile-sub">${count} pleins (${Math.round((count / ap.length) * 100)}%)</div>`;
    }
    case "streak": {
      if (ap.length === 0) return null;
      const sorted = [...ap].sort((a, b) => (a.date < b.date ? 1 : -1));
      const last = sorted[0];
      const days = Math.floor((Date.now() - new Date(last.date).getTime()) / (24 * 3600 * 1000));
      return `
        <div class="tile-label"><span class="tile-icon bg-gray">⏱</span>Jours sans plein</div>
        <div class="tile-value">${days}<span class="unit">j</span></div>
        <div class="tile-sub">depuis le ${fmtDate(last.date)}</div>`;
    }
    case "totalKm": {
      if (!stats) return null;
      return `
        <div class="tile-label"><span class="tile-icon bg-purple">↗</span>Distance</div>
        <div class="tile-value">${fmtNum(stats.totalKm)}<span class="unit">km</span></div>
        <div class="tile-sub">parcourus en tout</div>`;
    }
    case "recordPrice": {
      if (ap.length === 0) return null;
      const max = ap.filter((p) => p.prix_litre).reduce((m, p) => p.prix_litre > (m ? m.prix_litre : 0) ? p : m, null);
      if (!max) return null;
      return `
        <div class="tile-label"><span class="tile-icon bg-red">▲</span>Plus cher</div>
        <div class="tile-value">${fmtNum(max.prix_litre, 3)}<span class="unit">€/L</span></div>
        <div class="tile-sub">${fmtDate(max.date)} · ${stationLabel(max.station, max.station_custom)}</div>`;
    }
    case "recordCheap": {
      if (ap.length === 0) return null;
      const min = ap.filter((p) => p.prix_litre).reduce((m, p) => p.prix_litre < (m ? m.prix_litre : Infinity) ? p : m, null);
      if (!min) return null;
      return `
        <div class="tile-label"><span class="tile-icon bg-green">▼</span>Moins cher</div>
        <div class="tile-value">${fmtNum(min.prix_litre, 3)}<span class="unit">€/L</span></div>
        <div class="tile-sub">${fmtDate(min.date)} · ${stationLabel(min.station, min.station_custom)}</div>`;
    }
    default:
      return null;
  }
}

// ===== Drag & drop des tuiles (mode édition) =====
function enableDragAndDrop() {
  const dash = $("#dashboard");
  if (!dash || !editMode) return;
  const tiles = $$(".tile", dash);
  tiles.forEach((tile) => {
    tile.addEventListener("dragstart", onDragStart);
    tile.addEventListener("dragover", onDragOver);
    tile.addEventListener("drop", onDrop);
    tile.addEventListener("dragend", onDragEnd);
    // Touch support
    tile.addEventListener("touchstart", onTouchStart, { passive: false });
  });
}

let draggedTileId = null;
function onDragStart(e) {
  if (!editMode) return;
  draggedTileId = e.currentTarget.dataset.tile;
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", draggedTileId);
}
function onDragOver(e) {
  if (!editMode || !draggedTileId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const target = e.currentTarget;
  if (target.dataset.tile !== draggedTileId) {
    reorderTiles(draggedTileId, target.dataset.tile);
  }
}
function onDrop(e) { e.preventDefault(); }
function onDragEnd(e) {
  e.currentTarget.classList.remove("dragging");
  draggedTileId = null;
  saveDashboard();
}

// Touch drag : on prend le doigt, on déplace, on swap au survol
let touchTile = null;
let touchOffset = { x: 0, y: 0 };
let touchClone = null;

function onTouchStart(e) {
  if (!editMode) return;
  if (e.target.closest(".tile-remove")) return; // laisse le clic sur −
  e.preventDefault();
  touchTile = e.currentTarget;
  const rect = touchTile.getBoundingClientRect();
  const t = e.touches[0];
  touchOffset.x = t.clientX - rect.left;
  touchOffset.y = t.clientY - rect.top;
  touchTile.classList.add("dragging");
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("touchend", onTouchEnd);
}
function onTouchMove(e) {
  if (!touchTile) return;
  e.preventDefault();
  const t = e.touches[0];
  touchTile.style.position = "relative";
  touchTile.style.zIndex = "10";
  // On regarde sur quelle tuile on est
  touchTile.style.pointerEvents = "none";
  const elBelow = document.elementFromPoint(t.clientX, t.clientY);
  touchTile.style.pointerEvents = "";
  const otherTile = elBelow && elBelow.closest(".tile");
  if (otherTile && otherTile !== touchTile) {
    const draggedId = touchTile.dataset.tile;
    const targetId = otherTile.dataset.tile;
    reorderTiles(draggedId, targetId);
  }
}
function onTouchEnd() {
  if (touchTile) {
    touchTile.classList.remove("dragging");
    touchTile.style.position = "";
    touchTile.style.zIndex = "";
  }
  touchTile = null;
  document.removeEventListener("touchmove", onTouchMove);
  document.removeEventListener("touchend", onTouchEnd);
  saveDashboard();
}

function reorderTiles(draggedId, targetId) {
  const order = [...dashboardLayout.order];
  const i = order.indexOf(draggedId);
  const j = order.indexOf(targetId);
  if (i < 0 || j < 0) return;
  order.splice(i, 1);
  order.splice(j, 0, draggedId);
  dashboardLayout.order = order;
  renderDashboard();
}

function hideTile(id) {
  if (!dashboardLayout.hidden.includes(id)) dashboardLayout.hidden.push(id);
  saveDashboard();
  renderDashboard();
}
function showTile(id) {
  dashboardLayout.hidden = dashboardLayout.hidden.filter((x) => x !== id);
  saveDashboard();
  renderDashboard();
}

function toggleEditMode(force) {
  editMode = force === undefined ? !editMode : force;
  renderDashboard();
}

// ===== Greeting =====
function updateGreeting() {
  const el = $("#greeting-text");
  const elDate = $("#greeting-date");
  if (!el) return;
  const h = new Date().getHours();
  let salut = "Bonjour";
  let emoji = "☀️";
  if (h < 5) { salut = "Bonsoir"; emoji = "🌙"; }
  else if (h < 12) { salut = "Bonjour"; emoji = "☀️"; }
  else if (h < 18) { salut = "Bonjour"; emoji = "🌤"; }
  else { salut = "Bonsoir"; emoji = "🌆"; }
  el.innerHTML = `${salut}, ${escapeHtml(profile.name || "Fanny")} ${emoji}`;
  if (elDate) {
    elDate.textContent = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  }
}

async function init() {
  // Profil
  profile = loadProfile() || { name: "Fanny" };
  saveProfile();

  // Dashboard layout
  dashboardLayout = loadDashboard() || { order: TILES.map((t) => t.id), hidden: [] };
  saveDashboard();

  // Véhicules
  const storedVehicles = loadVehicles();
  vehicles = (storedVehicles && Array.isArray(storedVehicles) && storedVehicles.length > 0)
    ? storedVehicles
    : [{ ...DEFAULT_VEHICLE }];
  activeVehicleId = (getActiveVehicle() || vehicles[0]).id;
  saveVehicles();

  // Pleins
  const stored = load();
  if (stored && Array.isArray(stored)) {
    pleins = stored;
  } else {
    try {
      pleins = await seedFromMessenger();
      save();
    } catch (e) {
      console.error("Seed failed", e);
      pleins = [];
    }
  }
  // Migration : tout plein sans vehicle_id → véhicule par défaut (Mégane)
  let migrated = 0;
  for (const p of pleins) {
    if (!p.vehicle_id) { p.vehicle_id = DEFAULT_VEHICLE.id; migrated++; }
  }
  if (migrated > 0) save();

  refresh();
  fillPredictions();
}

function activePleins() {
  // Tous les pleins du véhicule actif (le seul affiché dans l'app)
  if (!activeVehicleId) return pleins;
  return pleins.filter((p) => p.vehicle_id === activeVehicleId);
}

function refresh() {
  pleins.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.km - b.km));
  renderVehicles();
  renderHistory();
  renderStats();
  renderCharts();
  renderDashboard();
  updateGreeting();
  $("#data-count").textContent = `${activePleins().length}`;
}

function renderVehicleSelector() {
  const row = $("#vehicle-row");
  const select = row.querySelector('[name="vehicle_id"]');
  const multi = vehicles.length > 1;
  row.style.display = multi ? "" : "none";
  // Reconstruit les options
  const cur = select.value || activeVehicleId;
  select.innerHTML = vehicles.map((v) =>
    `<option value="${v.id}">${escapeHtml(v.name)}</option>`
  ).join("");
  if (cur && vehicles.some((v) => v.id === cur)) select.value = cur;
  else select.value = activeVehicleId;
}

function renderVehicles() {
  const list = $("#vehicles-list");
  if (!list) return;
  // L'actif en premier, puis les archivés
  const sorted = [...vehicles].sort((a, b) => {
    if (a.id === activeVehicleId) return -1;
    if (b.id === activeVehicleId) return 1;
    return (b.start_date || "").localeCompare(a.start_date || "");
  });
  list.innerHTML = sorted.map((v) => {
    const scoped = pleins.filter((p) => p.vehicle_id === v.id);
    const isActive = v.id === activeVehicleId;
    const fuelLabel = FUEL_LABELS[v.fuel] || v.fuel;
    let metaLine = `${fuelLabel} · ${scoped.length} plein${scoped.length > 1 ? "s" : ""}`;
    if (scoped.length > 0) {
      const sortedScoped = [...scoped].sort((a, b) => (a.date < b.date ? -1 : 1));
      const km = sortedScoped[sortedScoped.length - 1].km - sortedScoped[0].km;
      const eur = scoped.reduce((s, p) => s + (Number(p.total) || 0), 0);
      metaLine += ` · ${fmtNum(km)} km · ${fmtNum(eur, 0)} €`;
    } else if (v.start_date) {
      metaLine += ` · depuis ${fmtDate(v.start_date)}`;
    }
    return `
      <div class="list-row" data-vehicle="${v.id}" style="cursor:pointer">
        <div class="row-icon bg-${isActive ? "blue" : "gray"}">${isActive ? "✓" : "▣"}</div>
        <div style="flex:1; min-width:0">
          <div style="font-size:17px; font-weight:500; letter-spacing:-0.43px; display:flex; align-items:center; gap:8px">
            ${escapeHtml(v.name)}
            ${isActive
              ? '<span style="font-size:11px; color:var(--ios-blue); background:color-mix(in srgb, var(--ios-blue) 15%, transparent); padding:2px 7px; border-radius:5px; font-weight:600; letter-spacing:0">ACTIF</span>'
              : '<span style="font-size:11px; color:var(--ios-text-2); background:var(--ios-fill); padding:2px 7px; border-radius:5px; font-weight:500; letter-spacing:0">ARCHIVÉ</span>'}
          </div>
          <div style="font-size:13px; color:var(--ios-text-2); letter-spacing:-0.08px; margin-top:2px">${metaLine}</div>
        </div>
      </div>
    `;
  }).join("");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}


// ===== Computations =====
function consoForPlein(p, prev) {
  if (!prev || !p.km || !prev.km || !p.litres) return null;
  if (p.missed_before) return null;
  const dKm = p.km - prev.km;
  if (dKm <= 0) return null;
  return (p.litres / dKm) * 100;
}

function buildSegments(chrono) {
  const segs = [];
  let cur = [];
  for (const p of chrono) {
    if (p.missed_before && cur.length > 0) {
      segs.push(cur);
      cur = [p];
    } else {
      cur.push(p);
    }
  }
  if (cur.length > 0) segs.push(cur);
  return segs;
}

function kmSincePeriod(chrono, periodStartIso) {
  if (chrono.length === 0) return null;
  const last = chrono[chrono.length - 1];
  if (last.date < periodStartIso) return 0;
  let baseline = null;
  for (const p of chrono) {
    if (p.date < periodStartIso) baseline = p;
    else break;
  }
  if (!baseline) return last.km - chrono[0].km;
  return last.km - baseline.km;
}

function sumBy(arr, key) {
  return arr.reduce((s, x) => s + (Number(x[key]) || 0), 0);
}

function predictNextPlein() {
  // Estime km à aujourd'hui + litres pour un plein "type" sur le véhicule actif.
  // - km/jour : moyenne sur les 6 derniers mois (ou tout l'historique si < 2 pleins récents)
  // - litres : conso moyenne (segments) appliquée à (predictedKm - lastKm)
  const ap = activePleins();
  if (ap.length < 2) return null;

  const sortedDesc = [...ap].sort((a, b) => (a.date < b.date ? 1 : -1));
  const last = sortedDesc[0];

  const cutoff = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const recent = ap.filter((p) => p.date >= cutoff);
  const usable = recent.length >= 2 ? recent : ap;
  const usSorted = [...usable].sort((a, b) => (a.date < b.date ? -1 : 1));
  const u0 = usSorted[0], uN = usSorted[usSorted.length - 1];
  const days = (new Date(uN.date) - new Date(u0.date)) / (24 * 3600 * 1000);
  if (days <= 0 || uN.km <= u0.km) return null;
  const kmPerDay = (uN.km - u0.km) / days;

  const today = new Date();
  const daysSinceLast = Math.max(1, Math.round((today - new Date(last.date)) / (24 * 3600 * 1000)));
  const predictedKm = Math.round(last.km + kmPerDay * daysSinceLast);

  // Litres prévus à partir de la conso moyenne du véhicule
  const stats = computeStats();
  const dKm = predictedKm - last.km;
  const predictedLitres = (stats && stats.consoMoyenne && dKm > 0)
    ? +((dKm * stats.consoMoyenne) / 100).toFixed(2)
    : null;

  return { km: predictedKm, litres: predictedLitres, kmPerDay: Math.round(kmPerDay), daysSinceLast };
}

function computeStats(scope) {
  // scope = liste de pleins (par défaut, ceux du véhicule actif)
  const src = scope || activePleins();
  if (src.length === 0) return null;
  const sorted = [...src].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = sorted[0], last = sorted[sorted.length - 1];

  const totalEur = sumBy(sorted, "total");
  const totalLitres = sumBy(sorted, "litres");
  const totalKm = last.km - first.km;

  const segments = buildSegments(sorted);
  let segLitres = 0, segKm = 0;
  for (const seg of segments) {
    if (seg.length < 2) continue;
    segLitres += seg.slice(1).reduce((s, p) => s + (Number(p.litres) || 0), 0);
    segKm += seg[seg.length - 1].km - seg[0].km;
  }
  const consoMoyenne = segKm > 0 ? (segLitres / segKm) * 100 : null;
  const prixMoyen = totalLitres > 0 ? totalEur / totalLitres : null;

  const dStart = new Date(first.date), dEnd = new Date(last.date);
  const annees = Math.max(0.0001, (dEnd - dStart) / (365.25 * 24 * 3600 * 1000));
  const eurParAn = totalEur / annees;
  const kmParAn = totalKm / annees;
  const eurParKm = totalKm > 0 ? totalEur / totalKm : null;

  const today = new Date();
  const yearStart = `${today.getFullYear()}-01-01`;
  const kmYTD = kmSincePeriod(sorted, yearStart);

  const m1 = today.getMonth() + 1;
  const yMinus1 = today.getFullYear() - 1;
  const rolling12Start = `${yMinus1}-${String(m1).padStart(2, "0")}-01`;
  const km12Months = kmSincePeriod(sorted, rolling12Start);

  const missedCount = sorted.filter((p) => p.missed_before).length;

  return {
    nb: sorted.length, totalEur, totalLitres, totalKm,
    consoMoyenne, prixMoyen, eurParAn, kmParAn, eurParKm,
    kmYTD, km12Months, rolling12Start, missedCount, first, last,
  };
}

// ===== Render: history (Style Apple Wallet/Mail) =====
function renderHistory() {
  const list = $("#history-list");
  const search = ($("#hist-search").value || "").trim().toLowerCase();
  const ap = activePleins();
  const sorted = [...ap].sort((a, b) => (a.date < b.date ? 1 : -1));

  // Calcul L/100 (besoin ordre chrono dans le scope du véhicule actif)
  const prevByKm = {};
  const chrono = [...ap].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.km - b.km));
  chrono.forEach((p, i) => { prevByKm[p.id] = i > 0 ? chrono[i - 1] : null; });

  list.innerHTML = "";
  let shown = 0;

  for (const p of sorted) {
    const label = stationLabel(p.station, p.station_custom).toLowerCase();
    const hay = `${p.date} ${label}`;
    if (search && !hay.includes(search)) continue;
    shown++;

    const conso = consoForPlein(p, prevByKm[p.id]);
    const row = document.createElement("div");
    row.className = "history-row";
    row.dataset.id = p.id;
    const showVehicle = vehicles.length > 1 && p.vehicle_id;
    row.innerHTML = `
      <div class="history-station-icon" style="background:${stationColor(p.station)}">
        ${stationInitial(p.station)}
      </div>
      <div class="history-main">
        <div class="history-title">
          <span>${stationLabel(p.station, p.station_custom)}</span>
          ${p.missed_before ? '<span class="badge-warning" title="Plein(s) raté(s) avant">⚠</span>' : ""}
        </div>
        <div class="history-meta">${fmtDate(p.date)}${showVehicle ? " · " + escapeHtml(vehicleName(p.vehicle_id)) : ""} · ${fmtNum(p.km)} km · ${p.litres ? fmtNum(p.litres, 2) + " L" : "— L"}</div>
      </div>
      <div class="history-trail">
        <div class="price">${p.total != null ? fmtNum(p.total, 2) + " €" : "—"}</div>
        <div class="conso">${conso != null ? fmtNum(conso, 2) + " L/100" : (p.prix_litre != null ? fmtNum(p.prix_litre, 3) + " €/L" : "")}</div>
      </div>
    `;
    list.appendChild(row);
  }

  $("#hist-header").textContent = shown === ap.length
    ? `${ap.length} PLEINS`
    : `${shown} SUR ${ap.length}`;
  $("#hist-footer").textContent = ap.length === 0
    ? "Aucun plein pour ce véhicule. Ajoute le premier dans l'onglet Ajouter."
    : `Touche un plein pour le modifier ou le supprimer.`;
}

// ===== Render: stats (Apple Health style) =====
function renderStats() {
  const grid = $("#stat-grid");
  const s = computeStats();
  if (!s) {
    grid.innerHTML = '<div class="empty-state">Aucune donnée. Ajoute ton premier plein.</div>';
    return;
  }
  const today = new Date();
  const cards = [
    { label: "Pleins",          icon: "▦", color: "blue",   value: fmtNum(s.nb), sub: `${fmtDate(s.first.date)} → ${fmtDate(s.last.date)}` },
    { label: "Total dépensé",   icon: "€", color: "green",  value: fmtNum(s.totalEur, 2), unit: "€" },
    { label: "Litres totaux",   icon: "◐", color: "orange", value: fmtNum(s.totalLitres, 2), unit: "L" },
    { label: "km parcourus",    icon: "↗", color: "purple", value: fmtNum(s.totalKm), unit: "km" },
    { label: `${today.getFullYear()}`,   icon: "▲", color: "indigo", value: s.kmYTD != null ? fmtNum(s.kmYTD) : "—", unit: "km", sub: "depuis le 1er janvier" },
    { label: "12 derniers mois", icon: "↻", color: "teal",  value: s.km12Months != null ? fmtNum(s.km12Months) : "—", unit: "km", sub: `depuis le ${fmtDate(s.rolling12Start)}` },
    { label: "Conso moyenne",   icon: "▾", color: "red",    value: s.consoMoyenne != null ? fmtNum(s.consoMoyenne, 2) : "—", unit: "L/100", sub: s.missedCount > 0 ? `${s.missedCount} plein(s) raté(s) exclu(s)` : "segments contigus" },
    { label: "Prix moyen /L",   icon: "€", color: "pink",   value: fmtNum(s.prixMoyen, 3), unit: "€/L" },
    { label: "€ par an",        icon: "Σ", color: "blue",   value: fmtNum(s.eurParAn, 0), unit: "€" },
    { label: "km par an",       icon: "Σ", color: "green",  value: fmtNum(s.kmParAn, 0), unit: "km" },
    { label: "€ par km",        icon: "÷", color: "gray",   value: s.eurParKm != null ? fmtNum(s.eurParKm * 100, 2) : "—", unit: "¢/km", span2: true },
  ];
  grid.innerHTML = cards.map((c) => `
    <div class="stat-card${c.span2 ? " span-2" : ""}">
      <div class="stat-label">
        <span class="stat-icon bg-${c.color}">${c.icon}</span>
        ${c.label}
      </div>
      <div class="stat-value">${c.value}${c.unit ? `<span class="unit">${c.unit}</span>` : ""}</div>
      ${c.sub ? `<div class="stat-sub">${c.sub}</div>` : ""}
    </div>
  `).join("");
}

// ===== Render: charts =====
const chartInstances = {};
function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}
function isLight() { return true; } // thème clair forcé
function chartTheme() {
  return {
    grid: "rgba(60,60,67,0.12)",
    text: "#000",
    muted: "rgba(60,60,67,0.6)",
    blue: "#007aff",
    green: "#34c759",
    orange: "#ff9500",
  };
}

function makeLine(canvasId, labels, data, label, color) {
  destroyChart(canvasId);
  const t = chartTheme();
  chartInstances[canvasId] = new Chart($("#" + canvasId), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label, data,
        borderColor: color,
        backgroundColor: color + "22",
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: color,
        borderWidth: 2.5,
        fill: true,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: isLight() ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)",
        titleColor: isLight() ? "#fff" : "#000",
        bodyColor: isLight() ? "#fff" : "#000",
        cornerRadius: 8, padding: 10, displayColors: false,
      } },
      scales: {
        x: { ticks: { color: t.muted, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 }, grid: { display: false } },
        y: { ticks: { color: t.muted, font: { size: 10 } }, grid: { color: t.grid, drawBorder: false } },
      },
    },
  });
}

function makeBar(canvasId, labels, data, label, color, colors) {
  destroyChart(canvasId);
  const t = chartTheme();
  chartInstances[canvasId] = new Chart($("#" + canvasId), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label, data,
        backgroundColor: colors || color,
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 28,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: {
        backgroundColor: isLight() ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.95)",
        titleColor: isLight() ? "#fff" : "#000",
        bodyColor: isLight() ? "#fff" : "#000",
        cornerRadius: 8, padding: 10, displayColors: false,
      } },
      scales: {
        x: { ticks: { color: t.muted, font: { size: 10 }, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: t.muted, font: { size: 10 } }, grid: { color: t.grid, drawBorder: false } },
      },
    },
  });
}

function renderCharts() {
  if (typeof Chart === "undefined") return;
  const ap = activePleins();
  if (ap.length === 0) return;
  const t = chartTheme();
  const chrono = [...ap].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.km - b.km));

  // Conso L/100km (filtre top-ups)
  const consoLabels = [], consoData = [];
  for (let i = 1; i < chrono.length; i++) {
    const dKm = chrono[i].km - chrono[i - 1].km;
    const c = consoForPlein(chrono[i], chrono[i - 1]);
    if (c != null && c < 15 && dKm >= 250) {
      consoLabels.push(fmtDate(chrono[i].date));
      consoData.push(+c.toFixed(2));
    }
  }
  makeLine("chart-conso", consoLabels, consoData, "L/100 km", t.green);

  // Prix au litre
  makeLine("chart-prix", chrono.map((p) => fmtDate(p.date)), chrono.map((p) => p.prix_litre), "€/L", t.orange);

  // Coût mensuel
  const byMonth = groupBy(chrono, (p) => p.date.slice(0, 7));
  const monthsSorted = Object.keys(byMonth).sort();
  const moisLabels = monthsSorted.map(formatYM);
  makeBar("chart-cout-mois", moisLabels, monthsSorted.map((m) => +sumBy(byMonth[m], "total").toFixed(2)), "€", t.blue);

  // Coût annuel
  const byYear = groupBy(chrono, (p) => p.date.slice(0, 4));
  const yearsSorted = Object.keys(byYear).sort();
  makeBar("chart-cout-an", yearsSorted, yearsSorted.map((y) => +sumBy(byYear[y], "total").toFixed(2)), "€", t.blue);

  // km / mois
  const kmMoisData = monthsSorted.map((m) => {
    const items = [...byMonth[m]].sort((a, b) => a.km - b.km);
    if (items.length < 2) {
      const idx = chrono.findIndex((x) => x.id === items[0].id);
      if (idx > 0) return Math.max(0, items[items.length - 1].km - chrono[idx - 1].km);
      return 0;
    }
    return items[items.length - 1].km - items[0].km;
  });
  makeBar("chart-km-mois", moisLabels, kmMoisData, "km", t.green);

  // Stations · prix
  const byStation = groupBy(chrono, (p) => p.station || "null");
  const stOrder = Object.keys(byStation).sort((a, b) => byStation[b].length - byStation[a].length);
  const stLabels = stOrder.map((s) => STATION_LABELS[s] || (s === "null" ? "Inconnue" : s));
  const stColors = stOrder.map((s) => STATION_COLORS[s] || STATION_COLORS.null);
  const stPrix = stOrder.map((s) => {
    const items = byStation[s];
    const tL = sumBy(items, "litres"), tE = sumBy(items, "total");
    return tL > 0 ? +(tE / tL).toFixed(3) : 0;
  });
  makeBar("chart-stations-prix", stLabels, stPrix, "€/L", t.orange, stColors);
  makeBar("chart-stations-count", stLabels, stOrder.map((s) => byStation[s].length), "Pleins", t.blue, stColors);
}

function groupBy(arr, fn) {
  const out = {};
  for (const x of arr) { const k = fn(x); (out[k] = out[k] || []).push(x); }
  return out;
}
function formatYM(ym) {
  const [y, m] = ym.split("-");
  const months = ["jan","fév","mar","avr","mai","juin","juil","août","sep","oct","nov","déc"];
  return `${months[+m - 1]} ${y.slice(2)}`;
}

// ===== Tabs (bottom tab bar iOS) =====
function showTab(name) {
  // Désactive le mode édition quand on quitte Aujourd'hui
  if (name !== "today" && editMode) toggleEditMode(false);
  $$(".tab-bar-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
  if (name === "charts") setTimeout(renderCharts, 50);
  if (name === "add") fillPredictions();
  // Affiche/masque le bouton "Modifier" : visible uniquement sur Aujourd'hui
  $("#nav-edit-btn").style.visibility = name === "today" ? "visible" : "hidden";
  // Le bouton ＋ en haut à droite : visible partout sauf sur l'onglet Ajouter lui-même
  $("#nav-add-btn").style.visibility = name === "add" ? "hidden" : "visible";
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$(".tab-bar-btn").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

// ===== Nav bar scroll behavior =====
const navBar = $("#nav-bar");
function onScroll() {
  navBar.classList.toggle("scrolled", window.scrollY > 8);
}
window.addEventListener("scroll", onScroll, { passive: true });

// ===== Nav actions =====
$("#nav-edit-btn").addEventListener("click", () => toggleEditMode());
$("#nav-add-btn").addEventListener("click", () => showTab("add"));

// ===== Dashboard interactions =====
$("#dashboard").addEventListener("click", (e) => {
  const remove = e.target.closest("[data-remove]");
  if (remove) {
    e.stopPropagation();
    hideTile(remove.dataset.remove);
    return;
  }
  // Hors mode édition : un tap sur la tuile "Dernier plein" ou "Prochain plein"
  // ouvre l'onglet ajout pour confort
  if (!editMode) {
    const tile = e.target.closest("[data-tile]");
    if (!tile) return;
    if (tile.dataset.tile === "nextFill" || tile.dataset.tile === "lastFill") {
      showTab("add");
    }
  }
});
$("#hidden-tiles-list").addEventListener("click", (e) => {
  const row = e.target.closest("[data-restore]");
  if (row) showTile(row.dataset.restore);
});

// ===== Profil prénom =====
const userNameInput = $("#user-name-input");
if (userNameInput) {
  userNameInput.addEventListener("input", () => {
    profile.name = (userNameInput.value || "").trim() || "Fanny";
    saveProfile();
    updateGreeting();
  });
}

// ===== Form =====
const form = $("#form-plein");
const stationSelect = form.querySelector('[name="station"]');
const customLabel = form.querySelector(".custom-station");
const litresInput = form.querySelector('[name="litres"]');
const prixInput = form.querySelector('[name="prix_litre"]');
const totalInput = form.querySelector('[name="total"]');
const autoHint = $("#auto-calc-hint");

stationSelect.addEventListener("change", () => {
  customLabel.classList.toggle("hidden", stationSelect.value !== "autre");
});

function autoCompute() {
  const l = parseFloat(litresInput.value);
  const p = parseFloat(prixInput.value);
  const t = parseFloat(totalInput.value);
  const filled = [!isNaN(l), !isNaN(p), !isNaN(t)].filter(Boolean).length;
  if (filled !== 2) { autoHint.textContent = "Saisis 2 champs sur 3 — le 3ᵉ se calcule tout seul."; return; }
  if (isNaN(t) && !isNaN(l) && !isNaN(p)) {
    const v = (l * p).toFixed(2);
    autoHint.textContent = `Total auto-calculé : ${v} €`;
    totalInput.value = v;
  } else if (isNaN(p) && !isNaN(l) && !isNaN(t) && l > 0) {
    const v = (t / l).toFixed(3);
    autoHint.textContent = `Prix /L auto-calculé : ${v} €/L`;
    prixInput.value = v;
  } else if (isNaN(l) && !isNaN(p) && !isNaN(t) && p > 0) {
    const v = (t / p).toFixed(2);
    autoHint.textContent = `Litres auto-calculés : ${v} L`;
    litresInput.value = v;
  }
}
[litresInput, prixInput, totalInput].forEach((el) => el.addEventListener("blur", autoCompute));

// Quand l'utilisateur ajuste le km, on recalcule l'estimation des litres
// (uniquement en saisie d'un nouveau plein, et seulement si litres est vide
// ou contient une estimation auto, c.-à-d. avant qu'elle ait tapé son chiffre réel).
let litresIsEstimate = true;
litresInput.addEventListener("input", () => { litresIsEstimate = false; });

const kmInput = form.querySelector('[name="km"]');
kmInput.addEventListener("input", () => {
  if (form.querySelector('[name="id"]').value) return; // édition : pas d'estim
  if (!litresIsEstimate) return;
  const ap = activePleins();
  if (ap.length === 0) return;
  const stats = computeStats();
  if (!stats || !stats.consoMoyenne) return;
  const sortedDesc = [...ap].sort((a, b) => (a.date < b.date ? 1 : -1));
  const lastKm = sortedDesc[0].km;
  const km = parseInt(kmInput.value);
  if (isNaN(km) || km <= lastKm) return;
  const litres = +(((km - lastKm) * stats.consoMoyenne) / 100).toFixed(2);
  litresInput.value = litres;
});

function resetForm() {
  form.reset();
  form.querySelector('[name="id"]').value = "";
  form.querySelector('[name="date"]').valueAsDate = new Date();
  customLabel.classList.add("hidden");
  $("#form-section-title").textContent = "DÉTAILS";
  autoHint.textContent = "Saisis 2 champs sur 3 — le 3ᵉ se calcule tout seul.";
  fillPredictions();
}

function fillPredictions() {
  // Pré-remplit km et litres avec une estimation, uniquement en mode "nouveau plein"
  // et si les champs sont vides. L'utilisateur peut écraser à tout moment.
  if (form.querySelector('[name="id"]').value) return; // édition
  const kmI = form.querySelector('[name="km"]');
  const litresI = form.querySelector('[name="litres"]');
  if (kmI.value || litresI.value) return;
  const pred = predictNextPlein();
  if (!pred) return;
  if (pred.km) kmI.value = pred.km;
  if (pred.litres) litresI.value = pred.litres;
  litresIsEstimate = true;
  autoHint.textContent = `Estimations : ~${fmtNum(pred.kmPerDay)} km/jour depuis ${pred.daysSinceLast} jour${pred.daysSinceLast > 1 ? "s" : ""}. Modifie avec les valeurs réelles du compteur.`;
}
$("#btn-cancel").addEventListener("click", () => { resetForm(); showTab("today"); });

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const id = fd.get("id") || uid();
  const station = fd.get("station");
  if (!station) { toast("Choisis une station", "error"); return; }
  const km = parseInt(fd.get("km"));
  if (isNaN(km)) { toast("Saisis le kilométrage", "error"); return; }
  const litres = parseFloat(fd.get("litres"));
  let prix_litre = parseFloat(fd.get("prix_litre"));
  let total = parseFloat(fd.get("total"));

  if (isNaN(prix_litre) && !isNaN(litres) && !isNaN(total) && litres > 0) {
    prix_litre = +(total / litres).toFixed(3);
  }
  if (isNaN(total) && !isNaN(litres) && !isNaN(prix_litre)) {
    total = +(litres * prix_litre).toFixed(2);
  }

  const vehicle_id = fd.get("vehicle_id") || activeVehicleId || (vehicles[0] && vehicles[0].id);

  const entry = {
    id,
    date: fd.get("date"),
    station,
    station_custom: station === "autre" ? (fd.get("station_custom") || null) : null,
    km,
    litres: isNaN(litres) ? null : litres,
    prix_litre: isNaN(prix_litre) ? null : prix_litre,
    total: isNaN(total) ? null : total,
    missed_before: fd.get("missed_before") === "on",
    vehicle_id,
  };

  const existing = pleins.findIndex((p) => p.id === id);
  if (existing >= 0) {
    pleins[existing] = entry;
    toast("Plein mis à jour", "success");
  } else {
    pleins.push(entry);
    toast("Plein ajouté", "success");
  }
  save();
  refresh();
  resetForm();
  showTab("today");
});

// ===== History click → action sheet =====
$("#history-list").addEventListener("click", (e) => {
  const row = e.target.closest(".history-row");
  if (!row) return;
  const id = row.dataset.id;
  const p = pleins.find((x) => x.id === id);
  if (!p) return;
  // ActionSheet iOS-like via confirm natif (le navigateur en mode standalone applique le style iOS)
  const choice = window.prompt(
    `${stationLabel(p.station, p.station_custom)} · ${fmtDateLong(p.date)}\n${fmtNum(p.km)} km · ${fmtNum(p.litres, 2)} L · ${fmtNum(p.total, 2)} €\n\nTape :\n  M = Modifier\n  S = Supprimer\n  (laisse vide pour annuler)`,
    ""
  );
  if (!choice) return;
  const c = choice.trim().toUpperCase();
  if (c === "M") editPlein(id);
  else if (c === "S") deletePlein(id);
});

function editPlein(id) {
  const p = pleins.find((x) => x.id === id);
  if (!p) return;
  form.querySelector('[name="id"]').value = p.id;
  form.querySelector('[name="date"]').value = p.date;
  form.querySelector('[name="station"]').value = p.station || "";
  form.querySelector('[name="station_custom"]').value = p.station_custom || "";
  form.querySelector('[name="km"]').value = p.km ?? "";
  form.querySelector('[name="litres"]').value = p.litres ?? "";
  form.querySelector('[name="prix_litre"]').value = p.prix_litre ?? "";
  form.querySelector('[name="total"]').value = p.total ?? "";
  form.querySelector('[name="missed_before"]').checked = !!p.missed_before;
  if (vehicles.length > 1 && p.vehicle_id) {
    form.querySelector('[name="vehicle_id"]').value = p.vehicle_id;
  }
  customLabel.classList.toggle("hidden", p.station !== "autre");
  $("#form-section-title").textContent = "MODIFIER LE PLEIN";
  showTab("add");
}

function deletePlein(id) {
  const p = pleins.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`Supprimer le plein du ${fmtDateLong(p.date)} ?`)) return;
  pleins = pleins.filter((x) => x.id !== id);
  save();
  refresh();
  toast("Plein supprimé");
}

$("#hist-search").addEventListener("input", renderHistory);

// ===== Data tab =====
$("#btn-export-json").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(pleins, null, 2)], { type: "application/json" });
  downloadBlob(blob, `mes-pleins-${todayStr()}.json`);
});
$("#btn-export-csv").addEventListener("click", () => {
  const headers = ["date", "vehicle_id", "station", "station_custom", "km", "litres", "prix_litre", "total", "missed_before"];
  const lines = [headers.join(",")];
  for (const p of pleins) lines.push(headers.map((h) => csvEscape(p[h])).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  downloadBlob(blob, `mes-pleins-${todayStr()}.csv`);
});

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("Export téléchargé", "success");
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

$("#file-import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  let imported = [];
  try {
    if (file.name.endsWith(".json")) imported = JSON.parse(text);
    else imported = parseCSV(text);
  } catch (err) { toast("Erreur d'import : " + err.message, "error"); return; }
  if (!Array.isArray(imported)) { toast("Format invalide", "error"); return; }
  if (!confirm(`Importer ${imported.length} entrées ? Cela remplacera les données actuelles.`)) {
    e.target.value = ""; return;
  }
  pleins = imported.map((p) => ({ id: p.id || uid(), ...p }));
  save(); refresh();
  toast(`${imported.length} entrées importées`, "success");
  e.target.value = "";
});

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      let v = values[i];
      if (v === "" || v === undefined) { obj[h] = null; return; }
      if (["km", "litres", "prix_litre", "total"].includes(h)) obj[h] = parseFloat(v);
      else if (h === "missed_before") obj[h] = v === "true" || v === "1" || v === "on";
      else obj[h] = v;
    });
    return obj;
  });
}
function parseCSVLine(line) {
  const out = []; let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur); return out;
}

$("#btn-reset").addEventListener("click", async () => {
  if (!confirm("Réinitialiser depuis l'export Messenger ? Tes ajouts/modifs seront perdus.")) return;
  pleins = await seedFromMessenger();
  save(); refresh();
  toast("Données réinitialisées", "success");
});
$("#btn-clear").addEventListener("click", () => {
  if (!confirm("Tout effacer ? Cette action est irréversible.")) return;
  pleins = []; save(); refresh();
  toast("Toutes les données ont été effacées");
});

// ===== Véhicules =====
$("#btn-add-vehicle").addEventListener("click", () => {
  const name = (window.prompt("Nom du véhicule (ex: Clio 5)") || "").trim();
  if (!name) return;
  const fuel = (window.prompt("Carburant ? Tape : essence, gazole, e85 ou electrique", "gazole") || "").trim().toLowerCase();
  if (!FUEL_LABELS[fuel]) { toast("Carburant non reconnu", "error"); return; }
  const startDate = (window.prompt("Date du premier plein (AAAA-MM-JJ)", todayStr()) || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { toast("Date invalide", "error"); return; }
  const v = {
    id: "v_" + uid(),
    name, fuel, start_date: startDate, active: false,
  };
  vehicles.push(v);
  // Le nouveau véhicule devient le véhicule actif (logique : on l'ajoute parce qu'on en change)
  setActiveVehicle(v.id);
  saveVehicles();
  refresh();
  toast(`${v.name} ajoutée`, "success");
});

function setActiveVehicle(id) {
  vehicles.forEach((v) => { v.active = v.id === id; });
  activeVehicleId = id;
  saveVehicles();
}

$("#vehicles-list").addEventListener("click", (e) => {
  const row = e.target.closest("[data-vehicle]");
  if (!row) return;
  const id = row.dataset.vehicle;
  const v = vehicleById(id);
  if (!v) return;
  const count = pleins.filter((p) => p.vehicle_id === id).length;
  const isActive = v.id === activeVehicleId;
  // Récap stats du véhicule
  const vstats = computeStats(pleins.filter((p) => p.vehicle_id === id));
  let summary = `${v.name} · ${FUEL_LABELS[v.fuel]} · ${count} plein(s)`;
  if (vstats) {
    summary += `\nTotal : ${fmtNum(vstats.totalKm)} km · ${fmtNum(vstats.totalEur, 0)} € · ${fmtNum(vstats.totalLitres, 0)} L`;
    if (vstats.consoMoyenne != null) summary += `\nConso moyenne : ${fmtNum(vstats.consoMoyenne, 2)} L/100`;
    if (vstats.first && vstats.last) summary += `\nPériode : ${fmtDate(vstats.first.date)} → ${fmtDate(vstats.last.date)}`;
  }
  const opts = isActive
    ? "  R = Renommer\n  C = Changer le carburant\n  D = Changer la date de début\n  S = Supprimer"
    : "  A = Réactiver (les stats reprendront sur ce véhicule)\n  R = Renommer\n  C = Changer le carburant\n  D = Changer la date de début\n  S = Supprimer";
  const choice = window.prompt(`${summary}\n\nActions :\n${opts}\n  (laisse vide pour fermer)`, "");
  if (!choice) return;
  const c = choice.trim().toUpperCase();
  if (c === "A") {
    setActiveVehicle(id);
    refresh();
    toast(`${v.name} est maintenant le véhicule actif`, "success");
  } else if (c === "R") {
    const newName = (window.prompt("Nouveau nom", v.name) || "").trim();
    if (newName) { v.name = newName; saveVehicles(); refresh(); toast("Renommée", "success"); }
  } else if (c === "C") {
    const f = (window.prompt("Carburant : essence, gazole, e85 ou electrique", v.fuel) || "").trim().toLowerCase();
    if (FUEL_LABELS[f]) { v.fuel = f; saveVehicles(); refresh(); toast("Carburant mis à jour", "success"); }
  } else if (c === "D") {
    const d = (window.prompt("Date de début (AAAA-MM-JJ)", v.start_date) || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { v.start_date = d; saveVehicles(); refresh(); toast("Date mise à jour", "success"); }
  } else if (c === "S") {
    if (vehicles.length === 1) { toast("Impossible de supprimer le dernier véhicule", "error"); return; }
    if (count > 0 && !confirm(`${count} plein(s) sont rattaché(s) à ${v.name}. Ils seront supprimés aussi. Continuer ?`)) return;
    if (!confirm(`Supprimer ${v.name} ?`)) return;
    pleins = pleins.filter((p) => p.vehicle_id !== id);
    vehicles = vehicles.filter((x) => x.id !== id);
    if (activeVehicleId === id) {
      activeVehicleId = vehicles[0].id;
      vehicles[0].active = true;
    }
    save(); saveVehicles(); refresh();
    toast(`${v.name} supprimée`);
  }
});


// ===== Init =====
$("#app-version").textContent = VERSION;
form.querySelector('[name="date"]').valueAsDate = new Date();
init().then(() => {
  if (userNameInput) userNameInput.value = profile.name || "";
});

if ("serviceWorker" in navigator) {
  // Si une SW contrôlait déjà la page au démarrage, c'est qu'on n'est PAS
  // au tout premier lancement. Dans ce cas, recharger quand une nouvelle
  // version est annoncée par la SW.
  const wasControlled = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data && e.data.type === "SW_UPDATED" && wasControlled && !reloaded) {
      reloaded = true;
      window.location.reload();
    }
  });
  // Quand la SW active change (nouvelle prise de contrôle), on reload aussi
  // au cas où le message n'arrive pas (Safari iOS l'écarte parfois).
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (wasControlled && !reloaded) {
      reloaded = true;
      window.location.reload();
    }
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then((reg) => {
      // Force la vérification d'une nouvelle version à chaque ouverture
      reg.update().catch(() => null);
    }).catch((e) => console.warn("SW registration failed", e));
  });
}
