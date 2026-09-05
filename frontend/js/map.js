/* Карта ДЗЗ: слайдер «до/после» по слоям участка + Яндекс.Карта с наложением снимка.
   Никакого OpenStreetMap/Leaflet — базовая картография только Яндекс. */

let mapSites = [];
let currentSite = null;
let currentLayers = [];
let activeLayerType = "rgb";
let dzzMapCtx = null;
let dzzOverlay = null;
let dzzPlacemark = null;

const LAYER_META = {
  rgb: { label: "RGB, естественные цвета", icon: "ph-duotone ph-image", tag: "10 м" },
  ndvi: { label: "NDVI, растительность", icon: "ph-duotone ph-plant", tag: "индекс" },
  turbidity: { label: "Мутность воды", icon: "ph-duotone ph-drop", tag: "индекс" },
};

/* Индексы ДЗЗ бэкенд пока не считает — показываем демонстрационные значения,
   честно помечая их как демо (см. README, п. «демо-датасет»). */
const DEMO_METRICS = [
  [
    { k: "NDVI, дюнная трава", v: "+0.31", delta: "+0.08 за сезон", color: "var(--color-accent-700)", note: "плотность растительности выросла", bars: [30, 34, 38, 42, 46, 58, 66, 74] },
    { k: "Мутность воды", v: "0.42", delta: "−12 %", color: "var(--color-accent-700)", note: "меньше взвеси в прибрежной полосе", bars: [82, 78, 74, 70, 60, 54, 48, 44] },
    { k: "Замусоренность", v: "низкая", delta: "−610 кг", color: "var(--color-accent-2-700)", note: "после последней уборки", bars: [88, 84, 80, 76, 72, 40, 26, 18] },
  ],
  [
    { k: "NDVI, дюнная трава", v: "+0.07", delta: "+0.01 за сезон", color: "var(--color-neutral-600)", note: "растительность почти не восстанавливается", bars: [22, 24, 23, 26, 25, 28, 27, 30] },
    { k: "Мутность воды", v: "0.61", delta: "+5 %", color: "var(--color-accent-2-700)", note: "размытие грунта после штормов", bars: [48, 52, 56, 58, 62, 68, 72, 78] },
    { k: "Замусоренность", v: "средняя", delta: "−430 кг", color: "var(--color-accent-2-700)", note: "участок в очереди на повторную уборку", bars: [70, 72, 74, 70, 66, 58, 54, 52] },
  ],
  [
    { k: "NDVI, склоновая зелень", v: "+0.44", delta: "+0.11 за сезон", color: "var(--color-accent-700)", note: "самый зелёный участок пилота", bars: [40, 44, 50, 56, 62, 70, 78, 86] },
    { k: "Мутность воды", v: "0.28", delta: "−21 %", color: "var(--color-accent-700)", note: "чистая прибрежная полоса", bars: [76, 70, 62, 56, 50, 42, 36, 30] },
    { k: "Замусоренность", v: "низкая", delta: "−300 кг", color: "var(--color-accent-700)", note: "два выезда эко-клуба за сезон", bars: [64, 60, 54, 46, 38, 30, 24, 20] },
  ],
];

async function initMap() {
  bindCompare();

  document.getElementById("overlay-opacity").addEventListener("input", (e) => {
    if (dzzOverlay) dzzOverlay.setOpacity(parseInt(e.target.value, 10) / 100);
  });

  try {
    mapSites = await api.get("/sites");
  } catch (e) {
    document.getElementById("site-name").textContent = "Не удалось загрузить участки";
    document.getElementById("site-sub").textContent = e.message;
    return;
  }

  if (!mapSites.length) {
    document.getElementById("site-name").textContent = "Участки ещё не заведены";
    document.getElementById("site-sub").textContent =
      "Администратор фонда добавляет участки побережья вместе со снимками ДЗЗ.";
    return;
  }

  renderSiteList();

  const requested = parseInt(new URLSearchParams(location.search).get("site"), 10);
  const initial = mapSites.find((s) => s.id === requested) || mapSites[0];
  loadSite(initial.id);
}

function renderSiteList() {
  const root = document.getElementById("site-list");
  root.innerHTML = mapSites
    .map(
      (s) => `
      <button type="button" class="side-btn" data-site="${s.id}">
        <span class="t">${escapeHtml(s.name)}</span>
        <span class="s">${escapeHtml(s.region || "Побережье")}</span>
      </button>`
    )
    .join("");
  root.querySelectorAll("[data-site]").forEach((btn) =>
    btn.addEventListener("click", () => loadSite(parseInt(btn.dataset.site, 10)))
  );
}

async function loadSite(siteId) {
  document.querySelectorAll("#site-list [data-site]").forEach((btn) =>
    btn.classList.toggle("active", parseInt(btn.dataset.site, 10) === siteId)
  );

  let site;
  try {
    site = await api.get(`/sites/${siteId}`);
  } catch (e) {
    toast(e.message, "error");
    return;
  }

  currentSite = site;
  currentLayers = site.layers || [];
  const siteIndex = Math.max(mapSites.findIndex((s) => s.id === site.id), 0);

  document.getElementById("site-name").textContent = site.name;
  document.getElementById("site-sub").textContent =
    `${site.region || "Побережье"} · ${site.lat.toFixed(4)}, ${site.lon.toFixed(4)} · участок под спутниковым наблюдением`;
  document.getElementById("site-description").textContent =
    site.description ||
    "На RGB-снимке участок выглядит как обычное фото. Индекс NDVI показывает плотность растительности числом от −1 до 1, а индекс мутности — взвесь в прибрежной полосе.";

  renderPasses();
  renderLayerList();
  renderShots();
  renderMetrics(siteIndex);
  renderNextPass();
  applyLayerType(pickDefaultLayerType());
  await renderSiteYandexMap();
}

function pickDefaultLayerType() {
  const types = [...new Set(currentLayers.map((l) => l.layer_type))];
  return types.includes(activeLayerType) ? activeLayerType : types[0] || "rgb";
}

function layersOfActiveType() {
  const ofType = currentLayers.filter((l) => l.layer_type === activeLayerType);
  return ofType.length ? ofType : currentLayers;
}

function applyLayerType(type) {
  activeLayerType = type;
  document.querySelectorAll("#layer-list [data-layer]").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.layer === type)
  );

  const layers = layersOfActiveType();
  const before = layers[0];
  const after = layers[layers.length - 1];

  const compare = document.getElementById("compare");
  if (!before) {
    compare.style.display = "none";
    document.querySelector(".compare-scrub").style.display = "none";
  } else {
    compare.style.display = "";
    document.querySelector(".compare-scrub").style.display = layers.length > 1 ? "" : "none";
    document.getElementById("cmp-before").src = before.image_url;
    document.getElementById("cmp-after").src = (after || before).image_url;
    document.getElementById("cmp-label-before").textContent =
      `${before.label} · ${formatShotDate(before.captured_at)}`;
    document.getElementById("cmp-label-after").textContent = after
      ? `${after.label} · ${formatShotDate(after.captured_at)}`
      : "Второго снимка нет";
  }

  const meta = LAYER_META[type] || LAYER_META.rgb;
  document.getElementById("overlay-layer-label").textContent = `Слой на карте: ${meta.label}`;

  if (dzzOverlay && after) dzzOverlay.setImage(after.image_url);
  updateCompare();
}

function renderPasses() {
  const layers = currentLayers;
  const first = layers[0];
  const last = layers[layers.length - 1];
  document.getElementById("site-passes").innerHTML = `
    <div style="background:var(--color-bg);padding:10px 14px">
      <div class="cell-k">Снимков</div>
      <div style="font-family:var(--font-heading);font-weight:600;font-size:15px;margin-top:2px">${layers.length}</div>
    </div>
    <div style="background:var(--color-bg);padding:10px 14px">
      <div class="cell-k">Первый</div>
      <div style="font-family:var(--font-heading);font-weight:600;font-size:15px;margin-top:2px">${first ? formatShotDate(first.captured_at) : "—"}</div>
    </div>
    <div style="background:var(--color-bg);padding:10px 14px">
      <div class="cell-k">Последний</div>
      <div style="font-family:var(--font-heading);font-weight:600;font-size:15px;margin-top:2px">${last ? formatShotDate(last.captured_at) : "—"}</div>
    </div>`;
}

function renderLayerList() {
  const present = new Set(currentLayers.map((l) => l.layer_type));
  document.getElementById("layer-list").innerHTML = Object.entries(LAYER_META)
    .map(([type, meta]) => {
      const has = present.has(type);
      return `
        <button type="button" class="layer-btn" data-layer="${type}" ${has ? "" : "disabled"}>
          <i class="${meta.icon}" style="font-size:18px"></i>
          <span style="font-size:13.5px">${meta.label}</span>
          <span style="margin-left:auto;font-size:11px;opacity:.7">${has ? meta.tag : "нет данных"}</span>
        </button>`;
    })
    .join("");

  document.querySelectorAll("#layer-list [data-layer]:not([disabled])").forEach((btn) =>
    btn.addEventListener("click", () => applyLayerType(btn.dataset.layer))
  );

  document.querySelectorAll("#layer-list [data-layer].active").forEach((b) => b.classList.remove("active"));
  const activeBtn = document.querySelector(`#layer-list [data-layer="${activeLayerType}"]`);
  if (activeBtn) activeBtn.classList.add("active");
}

function renderShots() {
  document.getElementById("shot-list").innerHTML = currentLayers.length
    ? currentLayers
        .slice()
        .reverse()
        .map(
          (l, i) => `
          <div class="shot-row">
            <span class="dot" style="background:${i === 0 ? "var(--color-accent)" : "var(--color-neutral-400)"}"></span>
            <span style="flex:1">${formatShotDate(l.captured_at)}</span>
            <span class="muted" style="font-size:11.5px">${escapeHtml(l.label)}</span>
          </div>`
        )
        .join("")
    : '<p class="muted" style="font-size:13px">Снимков ещё нет.</p>';
}

function renderMetrics(siteIndex) {
  const metrics = DEMO_METRICS[siteIndex % DEMO_METRICS.length];
  document.getElementById("site-metrics").innerHTML = metrics
    .map(
      (m) => `
      <div>
        <div style="display:flex;align-items:baseline;gap:8px">
          <span class="cell-k">${m.k}</span>
          <span style="margin-left:auto;font-size:11.5px;color:${m.color}">${m.delta}</span>
        </div>
        <div style="font-family:var(--font-heading);font-weight:600;font-size:26px;margin:7px 0 10px">${m.v}</div>
        <div class="metric-bars">
          ${m.bars.map((b) => `<i style="height:${b}%"></i>`).join("")}
        </div>
        <div class="cell-note" style="margin-top:8px">${m.note} · демо-значение</div>
      </div>`
    )
    .join("");
}

function renderNextPass() {
  const next = new Date();
  next.setDate(next.getDate() + 5);
  document.getElementById("next-pass").textContent = next.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------ Яндекс.Карта участка с наложением снимка --- */

async function renderSiteYandexMap() {
  if (!currentSite) return;
  const layers = layersOfActiveType();
  const cover = layers[layers.length - 1];

  if (!dzzMapCtx) {
    dzzMapCtx = await createYandexMap("dzz-map", {
      center: [currentSite.lat, currentSite.lon],
      zoom: 14,
      mapOptions: { suppressMapOpenBlock: true },
    });
    if (!dzzMapCtx) return;
    dzzMapCtx.map.setType("yandex#satellite");
  }

  if (dzzOverlay) {
    dzzOverlay.destroy();
    dzzOverlay = null;
  }
  if (dzzPlacemark) {
    dzzMapCtx.map.geoObjects.remove(dzzPlacemark);
    dzzPlacemark = null;
  }

  dzzPlacemark = addYandexPlacemark(dzzMapCtx, [currentSite.lat, currentSite.lon], {
    title: currentSite.name,
    body: currentSite.region || "",
  });

  if (cover && Array.isArray(cover.bounds) && cover.bounds.length === 2) {
    dzzMapCtx.map.setBounds(cover.bounds, { checkZoomRange: true, zoomMargin: 24 }).then(
      () => {
        dzzOverlay = new YandexImageOverlay(dzzMapCtx, cover.image_url, cover.bounds, {
          opacity: parseInt(document.getElementById("overlay-opacity").value, 10) / 100,
        });
      },
      () => {}
    );
  } else {
    dzzMapCtx.map.setCenter([currentSite.lat, currentSite.lon], 14);
  }
}

/* ------------------------------------------------- слайдер «до/после» ----- */

function bindCompare() {
  const range = document.getElementById("cmp-range");
  range.addEventListener("input", updateCompare);

  const compare = document.getElementById("compare");
  let dragging = false;
  const setFromEvent = (clientX) => {
    const rect = compare.getBoundingClientRect();
    const pct = Math.min(Math.max(((clientX - rect.left) / rect.width) * 100, 0), 100);
    range.value = String(Math.round(pct));
    updateCompare();
  };
  compare.addEventListener("pointerdown", (e) => {
    dragging = true;
    compare.setPointerCapture(e.pointerId);
    setFromEvent(e.clientX);
  });
  compare.addEventListener("pointermove", (e) => dragging && setFromEvent(e.clientX));
  compare.addEventListener("pointerup", () => (dragging = false));
  compare.addEventListener("pointercancel", () => (dragging = false));

  window.addEventListener("resize", updateCompare);
}

function updateCompare() {
  const pct = parseInt(document.getElementById("cmp-range").value, 10);
  document.getElementById("cmp-clip").style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
  document.getElementById("cmp-handle").style.left = `calc(${pct}% - 1px)`;
}

function formatShotDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("ru-RU");
}
