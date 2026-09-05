/* Админский конструктор карты ДЗЗ: участки побережья + снимки «до/после».
   То же самое, что раньше делалось вручную через /docs + docker cp (см. README,
   раздел «Как добавить свой участок побережья и снимки «до/после»»), но в одном окне. */

const DEFAULT_BOUNDS_DELTA = 0.006; // тот же дефолт, что в backend/app/db/seed_content.py

let sitesAll = [];
let currentSite = null;
let editingLayerId = null;

let siteMapCtx = null;
let sitePlacemark = null;
let siteCoords = null;

let boundsMapCtx = null;
let swMarker = null;
let neMarker = null;
let boundsRect = null;
let currentBounds = null;

async function initAdminSitesPage() {
  requireAuth();
  const user = await currentUser(true);
  const root = document.getElementById("admin-sites-root");
  if (!user || user.role !== "admin") {
    root.innerHTML = '<div class="alert error">Страница доступна только администратору фонда.</div>';
    return;
  }

  root.innerHTML = `
    <div class="page-head">
      <div>
        <div class="kicker">Админка · Карта ДЗЗ</div>
        <h1>Конструктор участков и снимков</h1>
        <p class="muted" style="font-size:14px;max-width:70ch;margin:0">
          Участки побережья и снимки «до/после» для раздела «Карта ДЗЗ» — создание участка,
          загрузка снимка и настройка границ наложения на карте в одном месте.
        </p>
      </div>
    </div>
    <div class="cols" style="grid-template-columns:280px minmax(0,1fr);gap:32px;align-items:start">
      <div>
        <div class="micro" style="margin-bottom:10px">Участки берега</div>
        <div id="site-list"></div>
        <button class="btn btn-secondary btn-sm btn-block" type="button" id="new-site-btn" style="margin-top:10px">+ Новый участок</button>
      </div>
      <div id="site-detail"></div>
    </div>`;

  document.getElementById("new-site-btn").addEventListener("click", () => selectSite(null));
  await loadSites();
}

async function loadSites() {
  try {
    sitesAll = await api.get("/sites");
  } catch (e) {
    document.getElementById("site-list").innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
    return;
  }
  renderSiteList();
  if (sitesAll.length) await selectSite(sitesAll[0].id);
  else await selectSite(null);
}

function renderSiteList() {
  const root = document.getElementById("site-list");
  root.innerHTML = sitesAll.length
    ? sitesAll
        .map(
          (s) => `
      <button type="button" class="side-btn" data-site="${s.id}" style="width:100%;text-align:left">
        <span class="t">${escapeHtml(s.name)}</span><br />
        <span class="s">${escapeHtml(s.region || "Побережье")}</span>
      </button>`
        )
        .join("")
    : '<p class="muted" style="font-size:13px">Участков ещё нет.</p>';

  root.querySelectorAll("[data-site]").forEach((btn) =>
    btn.addEventListener("click", () => selectSite(parseInt(btn.dataset.site, 10)))
  );
}

function highlightActiveSite(siteId) {
  document.querySelectorAll("#site-list [data-site]").forEach((btn) =>
    btn.classList.toggle("active", parseInt(btn.dataset.site, 10) === siteId)
  );
}

async function selectSite(siteId) {
  editingLayerId = null;
  if (siteId == null) {
    currentSite = null;
    highlightActiveSite(-1);
    renderSiteDetail(null);
    return;
  }
  try {
    currentSite = await api.get(`/sites/${siteId}`);
  } catch (e) {
    toast(e.message, "error");
    return;
  }
  highlightActiveSite(siteId);
  renderSiteDetail(currentSite);
}

/* ------------------------------------------------------------- форма участка -- */

function renderSiteDetail(site) {
  const root = document.getElementById("site-detail");
  const isNew = !site;

  root.innerHTML = `
    <h2 style="font-size:20px;margin-top:0">${isNew ? "Новый участок" : escapeHtml(site.name)}</h2>
    <div id="site-form-alert"></div>
    <form id="site-form" style="max-width:640px">
      <div class="cols" style="grid-template-columns:1fr 1fr;gap:16px">
        <div class="field"><label for="site-name">Название</label><input class="input" type="text" id="site-name" required value="${isNew ? "" : escapeHtml(site.name)}" /></div>
        <div class="field"><label for="site-region">Регион</label><input class="input" type="text" id="site-region" value="${isNew ? "" : escapeHtml(site.region || "")}" /></div>
      </div>
      <div class="field"><label for="site-description">Описание</label><textarea class="input" id="site-description" rows="2">${isNew ? "" : escapeHtml(site.description || "")}</textarea></div>
      <div class="field">
        <span class="field-label">Координаты центра участка</span>
        <div class="ymap ymap-sm" id="site-map"></div>
        <span class="field-hint" id="site-coords-hint">${isNew ? "Кликните по карте, чтобы поставить метку участка." : `Точка: ${site.lat.toFixed(5)}, ${site.lon.toFixed(5)}`}</span>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn-primary" type="submit">${isNew ? "Создать участок" : "Сохранить"}</button>
        ${isNew ? "" : '<button type="button" class="btn btn-danger" id="delete-site-btn">Удалить участок</button>'}
      </div>
    </form>

    ${
      isNew
        ? ""
        : `
    <div style="border-top:1px solid var(--color-divider);margin-top:36px;padding-top:26px">
      <h2 style="font-size:20px">Снимки участка</h2>
      <div id="layers-table"></div>

      <h3 style="font-size:16px;margin-top:30px" id="layer-form-title">Добавить снимок</h3>
      <div id="layer-form-alert"></div>
      <form id="layer-form" style="max-width:640px">
        <div class="field">
          <label for="layer-photo">Файл снимка (JPEG/PNG/WebP)</label>
          <input class="input" type="file" id="layer-photo" accept="image/jpeg,image/png,image/webp" />
          <span class="field-hint" id="layer-photo-hint" hidden>Необязательно при редактировании — оставьте пустым, чтобы не менять картинку.</span>
        </div>
        <div class="cols" style="grid-template-columns:1fr 1fr 1fr;gap:16px">
          <div class="field"><label for="layer-date">Дата съёмки</label><input class="input" type="date" id="layer-date" required /></div>
          <div class="field">
            <label for="layer-type">Тип слоя</label>
            <select class="input" id="layer-type">
              <option value="rgb">RGB (естественные цвета)</option>
              <option value="ndvi">NDVI (растительность)</option>
              <option value="turbidity">Мутность воды</option>
            </select>
          </div>
          <div class="field"><label for="layer-order">Порядок (0 = «до», больше = «после»)</label><input class="input" type="number" id="layer-order" value="0" min="0" /></div>
        </div>
        <div class="field"><label for="layer-label">Подпись</label><input class="input" type="text" id="layer-label" placeholder="До уборки" required /></div>
        <div class="field">
          <span class="field-label">Границы наложения на карте</span>
          <div class="ymap ymap-sm" id="bounds-map"></div>
          <span class="field-hint" id="bounds-hint">Перетащите синюю метку в юго-западный угол снимка, оранжевую — в северо-восточный.</span>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" type="submit" id="layer-submit-btn">Добавить снимок</button>
          <button type="button" class="btn btn-secondary" id="layer-cancel-edit-btn" hidden>Отменить редактирование</button>
        </div>
      </form>
    </div>`
    }
  `;

  document.getElementById("site-form").addEventListener("submit", (e) => submitSiteForm(e, site));
  document.getElementById("delete-site-btn")?.addEventListener("click", () => deleteSite(site.id));
  initSiteMap(site);

  if (!isNew) {
    renderLayersTable(site);
    document.getElementById("layer-date").valueAsDate = new Date();
    initBoundsMap(site, null);
    document.getElementById("layer-form").addEventListener("submit", (e) => submitLayerForm(e, site.id));
    document.getElementById("layer-cancel-edit-btn").addEventListener("click", () => resetLayerForm(site));
  }
}

async function initSiteMap(site) {
  const center = site ? [site.lat, site.lon] : YANDEX_DEFAULT_CENTER;
  siteCoords = site ? [site.lat, site.lon] : null;
  sitePlacemark = null;
  siteMapCtx = await createYandexMap("site-map", { center, zoom: site ? 12 : 6 });
  if (!siteMapCtx) return;
  if (siteCoords) setSiteMarker(siteCoords);
  siteMapCtx.map.events.add("click", (e) => setSiteMarker(e.get("coords")));
}

function setSiteMarker(coords) {
  siteCoords = coords;
  const hint = document.getElementById("site-coords-hint");
  if (hint) hint.textContent = `Точка: ${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`;
  if (!siteMapCtx) return;
  if (sitePlacemark) {
    sitePlacemark.geometry.setCoordinates(coords);
  } else {
    sitePlacemark = new siteMapCtx.ymaps.Placemark(coords, {}, { preset: "islands#circleIcon", iconColor: "#0088b0", draggable: true });
    sitePlacemark.events.add("dragend", () => setSiteMarker(sitePlacemark.geometry.getCoordinates()));
    siteMapCtx.map.geoObjects.add(sitePlacemark);
  }
}

async function submitSiteForm(e, site) {
  e.preventDefault();
  const alertEl = document.getElementById("site-form-alert");
  if (!siteCoords) {
    alertEl.innerHTML = '<div class="alert error">Отметьте точку участка на карте.</div>';
    return;
  }
  const payload = {
    name: document.getElementById("site-name").value.trim(),
    region: document.getElementById("site-region").value.trim() || null,
    description: document.getElementById("site-description").value.trim() || null,
    lat: siteCoords[0],
    lon: siteCoords[1],
  };
  try {
    if (site) {
      await api.patch(`/sites/${site.id}`, payload);
      toast("Участок обновлён", "success");
      await loadSites();
      await selectSite(site.id);
    } else {
      const created = await api.post("/sites", payload);
      toast("Участок создан — теперь добавьте снимки «до/после»", "success");
      await loadSites();
      await selectSite(created.id);
    }
  } catch (err) {
    alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
  }
}

async function deleteSite(siteId) {
  if (!confirm("Удалить участок вместе со всеми снимками? Это необратимо.")) return;
  try {
    await api.del(`/sites/${siteId}`);
    toast("Участок удалён", "success");
    await loadSites();
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ------------------------------------------------------------ снимки участка -- */

function renderLayersTable(site) {
  const root = document.getElementById("layers-table");
  const layers = site.layers || [];
  root.innerHTML = layers.length
    ? `<div class="table-wrap"><table class="table"><thead><tr>
        <th>Превью</th><th>Дата</th><th>Тип</th><th>Подпись</th><th>Порядок</th><th></th>
      </tr></thead><tbody>
        ${layers
          .map(
            (l) => `
          <tr>
            <td><img src="${escapeHtml(l.image_url)}" alt="" style="width:64px;height:48px;object-fit:cover;border:1px solid var(--color-divider);display:block" /></td>
            <td>${escapeHtml(l.captured_at)}</td>
            <td>${escapeHtml(l.layer_type)}</td>
            <td>${escapeHtml(l.label)}</td>
            <td>${l.order_index}</td>
            <td style="white-space:nowrap">
              <button type="button" class="btn btn-secondary btn-sm" data-edit-layer="${l.id}">Изменить</button>
              <button type="button" class="btn btn-danger btn-sm" data-delete-layer="${l.id}">Удалить</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody></table></div>`
    : '<p class="muted" style="font-size:13px">Снимков пока нет — добавьте первый ниже.</p>';

  root.querySelectorAll("[data-edit-layer]").forEach((btn) =>
    btn.addEventListener("click", () => startEditLayer(site, parseInt(btn.dataset.editLayer, 10)))
  );
  root.querySelectorAll("[data-delete-layer]").forEach((btn) =>
    btn.addEventListener("click", () => deleteLayer(site.id, parseInt(btn.dataset.deleteLayer, 10)))
  );
}

function startEditLayer(site, layerId) {
  const layer = (site.layers || []).find((l) => l.id === layerId);
  if (!layer) return;
  editingLayerId = layerId;
  document.getElementById("layer-form-title").textContent = `Изменить снимок «${layer.label}»`;
  document.getElementById("layer-date").value = layer.captured_at;
  document.getElementById("layer-type").value = layer.layer_type;
  document.getElementById("layer-order").value = layer.order_index;
  document.getElementById("layer-label").value = layer.label;
  document.getElementById("layer-photo").value = "";
  document.getElementById("layer-photo-hint").hidden = false;
  document.getElementById("layer-submit-btn").textContent = "Сохранить изменения";
  document.getElementById("layer-cancel-edit-btn").hidden = false;
  initBoundsMap(site, layer.bounds);
  document.getElementById("layer-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetLayerForm(site) {
  editingLayerId = null;
  document.getElementById("layer-form").reset();
  document.getElementById("layer-form-title").textContent = "Добавить снимок";
  document.getElementById("layer-photo-hint").hidden = true;
  document.getElementById("layer-submit-btn").textContent = "Добавить снимок";
  document.getElementById("layer-cancel-edit-btn").hidden = true;
  document.getElementById("layer-date").valueAsDate = new Date();
  initBoundsMap(site, null);
}

async function deleteLayer(siteId, layerId) {
  if (!confirm("Удалить этот снимок?")) return;
  try {
    await api.del(`/sites/${siteId}/layers/${layerId}`);
    toast("Снимок удалён", "success");
    currentSite = await api.get(`/sites/${siteId}`);
    renderLayersTable(currentSite);
    if (editingLayerId === layerId) resetLayerForm(currentSite);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function submitLayerForm(e, siteId) {
  e.preventDefault();
  const alertEl = document.getElementById("layer-form-alert");
  const file = document.getElementById("layer-photo").files[0];

  if (!editingLayerId && !file) {
    alertEl.innerHTML = '<div class="alert error">Выберите файл снимка.</div>';
    return;
  }

  try {
    let imageUrl = null;
    if (file) {
      const fd = new FormData();
      fd.append("photo", file);
      const uploaded = await api.postForm("/sites/upload-image", fd);
      imageUrl = uploaded.image_url;
    }

    const payload = {
      captured_at: document.getElementById("layer-date").value,
      layer_type: document.getElementById("layer-type").value,
      label: document.getElementById("layer-label").value.trim(),
      bounds: currentBounds,
      order_index: parseInt(document.getElementById("layer-order").value, 10) || 0,
    };
    if (imageUrl) payload.image_url = imageUrl;

    if (editingLayerId) {
      await api.patch(`/sites/${siteId}/layers/${editingLayerId}`, payload);
      toast("Снимок обновлён", "success");
    } else {
      await api.post(`/sites/${siteId}/layers`, payload);
      toast("Снимок добавлен", "success");
    }

    currentSite = await api.get(`/sites/${siteId}`);
    renderLayersTable(currentSite);
    resetLayerForm(currentSite);
  } catch (err) {
    alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
  }
}

/* Границы наложения снимка на карту: две перетаскиваемые метки (Ю-З/С-В угол) +
   прямоугольник-превью. currentBounds — то, что реально уйдёт в payload. */
async function initBoundsMap(site, bounds) {
  const initial = bounds || [
    [site.lat - DEFAULT_BOUNDS_DELTA, site.lon - DEFAULT_BOUNDS_DELTA],
    [site.lat + DEFAULT_BOUNDS_DELTA, site.lon + DEFAULT_BOUNDS_DELTA],
  ];
  currentBounds = initial;
  swMarker = null;
  neMarker = null;
  boundsRect = null;

  boundsMapCtx = await createYandexMap("bounds-map", { center: [site.lat, site.lon], zoom: 13 });
  if (!boundsMapCtx) return;
  boundsMapCtx.map.setType("yandex#satellite");

  const { ymaps, map } = boundsMapCtx;
  boundsRect = new ymaps.Rectangle([initial[0], initial[1]], {}, { fillColor: "#0088b022", strokeColor: "#0088b0", strokeWidth: 2 });
  swMarker = new ymaps.Placemark(initial[0], { hintContent: "Юго-запад" }, { preset: "islands#blueCircleIcon", draggable: true });
  neMarker = new ymaps.Placemark(initial[1], { hintContent: "Северо-восток" }, { preset: "islands#orangeCircleIcon", draggable: true });
  map.geoObjects.add(boundsRect);
  map.geoObjects.add(swMarker);
  map.geoObjects.add(neMarker);

  const updateFromMarkers = () => {
    currentBounds = [swMarker.geometry.getCoordinates(), neMarker.geometry.getCoordinates()];
    boundsRect.geometry.setCoordinates(currentBounds);
    document.getElementById("bounds-hint").textContent =
      `Ю-З: ${currentBounds[0][0].toFixed(5)}, ${currentBounds[0][1].toFixed(5)} · С-В: ${currentBounds[1][0].toFixed(5)}, ${currentBounds[1][1].toFixed(5)}`;
  };
  swMarker.events.add("dragend", updateFromMarkers);
  neMarker.events.add("dragend", updateFromMarkers);
  updateFromMarkers();

  map.setBounds(initial, { checkZoomRange: true, zoomMargin: 40 }).catch(() => {});
}
