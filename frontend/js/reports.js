/* Citizen science: отправка репортов о мусоре и их модерация.
   Координаты находки выбираются на Яндекс.Карте (метка перетаскивается). */

const REPORT_STATUS_LABELS = { pending: "На модерации", approved: "Принято", rejected: "Отклонено" };
const REPORT_STATUS_TAGS = { pending: "tag-neutral", approved: "tag-accent", rejected: "tag-accent-2" };

let currentReportRejectHandler = null;
let reportMapCtx = null;
let reportPlacemark = null;
let reportCoords = null;
let reportSites = [];
let selectedReportSite = null;
let modMapCtx = null;

async function initReportsPage() {
  const root = document.getElementById("reports-root");
  const user = isLoggedIn() ? await currentUser() : null;

  document.getElementById("reason-cancel").addEventListener("click", () => {
    document.getElementById("reason-modal").hidden = true;
  });
  document.getElementById("reason-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const reason = document.getElementById("reason-text").value.trim();
    document.getElementById("reason-modal").hidden = true;
    if (currentReportRejectHandler) await currentReportRejectHandler(reason);
  });

  if (user && user.role === "admin") {
    renderModerationView(root);
  } else if (user && user.role === "organizer") {
    renderOrganizerReadOnlyView(root);
  } else {
    await renderSubmissionView(root, user);
  }
}

/* ------------------------------------------- волонтёр: отправка репорта -- */

async function renderSubmissionView(root, user) {
  reportSites = await api.get("/sites").catch(() => []);

  root.innerHTML = `
    <div class="kicker">Citizen science</div>
    <h1>Репорты о мусоре</h1>
    <p class="lead" style="max-width:64ch">Нашёл замусоренный участок — сфотографируй и отправь. Фотографии с телефона подтверждают находки и уточняют данные там, где спутниковый снимок неточен: облачность, тень, разрешение 10 метров.</p>

    <div class="cols cols-side-wide">
      <div>
        <div id="report-form-root"></div>

        <h3 style="margin:48px 0 4px">Мои репорты</h3>
        <p class="muted" style="font-size:13.5px;margin:0 0 6px">Организатор или администратор фонда проверяет каждое фото вручную.</p>
        <div id="reports-list">${skeletonLines(3)}</div>
      </div>

      <div class="stack">
        <div class="panel-dark">
          <div class="micro" style="margin-bottom:12px">Зачем это спутнику</div>
          <p style="font-size:13.5px;line-height:1.55;margin:0 0 16px">Снимок Sentinel-2 различает объекты крупнее 10 метров. Свалка в три мешка на нём не видна — а на вашем фото видна. Принятые репорты попадают в очередь приоритетных участков наравне с аномалиями, найденными алгоритмом.</p>
          <div style="display:flex;gap:1px;background:rgba(243,242,242,.16)" id="report-stats">
            <div style="background:#0a303e;padding:10px 12px;flex:1"><div style="font-family:var(--font-heading);font-weight:600;font-size:19px">10 м</div><div class="micro" style="margin-top:3px">разрешение снимка</div></div>
            <div style="background:#0a303e;padding:10px 12px;flex:1"><div style="font-family:var(--font-heading);font-weight:600;font-size:19px">+10 б.</div><div class="micro" style="margin-top:3px">за принятый репорт</div></div>
            <div style="background:#0a303e;padding:10px 12px;flex:1"><div style="font-family:var(--font-heading);font-weight:600;font-size:19px" id="my-report-count">—</div><div class="micro" style="margin-top:3px">ваших репортов</div></div>
          </div>
        </div>
        <div>
          <div class="micro" style="margin-bottom:12px">Что помогает модератору</div>
          ${tipRow("ph-duotone ph-camera", "Снимайте общий план: видно берег, воду и масштаб свалки.")}
          ${tipRow("ph-duotone ph-crosshair", "Ставьте метку точно там, где мусор, — не там, где стоите.")}
          ${tipRow("ph-duotone ph-textbox", "В описании — что за мусор, сколько примерно и как давно лежит.")}
        </div>
      </div>
    </div>`;

  if (!user) {
    document.getElementById("report-form-root").innerHTML =
      '<div class="note">Чтобы отправить репорт, сначала <a href="/login">войдите</a> в аккаунт волонтёра.</div>';
  } else if (user.role !== "volunteer") {
    document.getElementById("report-form-root").innerHTML =
      '<div class="note">Отправка репортов доступна волонтёрам.</div>';
  } else {
    renderReportForm();
  }

  loadMyReports();
}

function tipRow(icon, text) {
  return `<div style="display:flex;gap:11px;padding:10px 0;border-top:1px solid var(--color-divider)">
    <i class="${icon}" style="font-size:19px;color:var(--color-accent);flex:none"></i>
    <div style="font-size:13px;line-height:1.45">${text}</div>
  </div>`;
}

function renderReportForm() {
  document.getElementById("report-form-root").innerHTML = `
    <div class="cols" style="grid-template-columns:280px minmax(0,1fr);gap:24px;align-items:start">
      <div>
        <div class="micro" style="margin-bottom:8px">Фото находки</div>
        <label for="photo" style="display:block;cursor:pointer">
          <div id="photo-preview" class="site-thumb" style="aspect-ratio:3/4;display:grid;place-items:center;text-align:center;padding:16px;color:var(--color-neutral-600);font-size:13px">
            <span><i class="ph-duotone ph-camera" style="font-size:32px;display:block;margin-bottom:8px"></i>Выбрать фото<br />JPEG, PNG или WebP</span>
          </div>
        </label>
        <input type="file" id="photo" accept="image/jpeg,image/png,image/webp" required style="margin-top:10px" />
      </div>

      <div>
        <div id="report-alert"></div>

        <div class="micro" style="margin-bottom:8px">Координаты находки</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
          <button type="button" class="btn btn-secondary" id="geo-btn"><i class="ph-duotone ph-crosshair" style="font-size:17px"></i>Определить местоположение</button>
          <span style="font-size:12.5px" class="muted" id="geo-status">Координаты не определены</span>
        </div>
        <div class="ymap" id="report-map"></div>
        <p class="muted" style="font-size:12px;margin:8px 0 20px">Кликните по карте или перетащите метку, чтобы уточнить место находки.</p>

        <div class="field">
          <label for="rep-desc">Что видно на месте</label>
          <textarea class="input" id="rep-desc" rows="4" placeholder="Например: у спуска к воде свалка строительного мусора, около 20 мешков, лежит не меньше месяца."></textarea>
        </div>

        <div class="field">
          <label for="rep-region">Регион</label>
          <input class="input" type="text" id="rep-region" placeholder="Например, Краснодарский край" />
        </div>

        ${
          reportSites.length
            ? `<div class="field">
                 <span class="field-label">Участок берега (необязательно)</span>
                 <div class="seg seg-fill" id="report-sites">
                   <button type="button" class="active" data-site="">Не привязывать</button>
                   ${reportSites.map((s) => `<button type="button" data-site="${s.id}">${escapeHtml(s.name)}</button>`).join("")}
                 </div>
               </div>`
            : ""
        }

        <button type="button" class="btn btn-primary btn-lg" id="report-submit">Отправить на модерацию</button>
      </div>
    </div>`;

  document.getElementById("photo").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    document.getElementById("photo-preview").outerHTML =
      `<img id="photo-preview" class="site-thumb" style="aspect-ratio:3/4" src="${url}" alt="Предпросмотр фото" />`;
  });

  document.querySelectorAll("#report-sites [data-site]").forEach((btn) =>
    btn.addEventListener("click", () => {
      selectedReportSite = btn.dataset.site || null;
      document.querySelectorAll("#report-sites [data-site]").forEach((b) => b.classList.toggle("active", b === btn));
      const site = reportSites.find((s) => String(s.id) === btn.dataset.site);
      if (site && reportMapCtx) {
        reportMapCtx.map.setCenter([site.lat, site.lon], 14);
        setReportMarker([site.lat, site.lon]);
      }
    })
  );

  document.getElementById("geo-btn").addEventListener("click", locateReport);
  document.getElementById("report-submit").addEventListener("click", submitReport);

  initReportMap();
}

async function initReportMap() {
  const center = reportSites.length ? [reportSites[0].lat, reportSites[0].lon] : YANDEX_DEFAULT_CENTER;
  reportMapCtx = await createYandexMap("report-map", { center, zoom: reportSites.length ? 12 : 6 });
  if (!reportMapCtx) return;
  reportMapCtx.map.events.add("click", (e) => setReportMarker(e.get("coords")));
}

function setReportMarker(coords) {
  reportCoords = coords;
  document.getElementById("geo-status").textContent = `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`;
  if (!reportMapCtx) return;

  if (reportPlacemark) {
    reportPlacemark.geometry.setCoordinates(coords);
  } else {
    reportPlacemark = new reportMapCtx.ymaps.Placemark(
      coords,
      { hintContent: "Место находки" },
      { preset: "islands#circleIcon", iconColor: "#d6006c", draggable: true }
    );
    reportPlacemark.events.add("dragend", () => {
      reportCoords = reportPlacemark.geometry.getCoordinates();
      document.getElementById("geo-status").textContent =
        `${reportCoords[0].toFixed(5)}, ${reportCoords[1].toFixed(5)}`;
    });
    reportMapCtx.map.geoObjects.add(reportPlacemark);
  }
}

function locateReport() {
  const status = document.getElementById("geo-status");
  if (!navigator.geolocation) {
    status.textContent = "Геолокация не поддерживается браузером.";
    return;
  }
  status.textContent = "Определяем местоположение…";
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const coords = [pos.coords.latitude, pos.coords.longitude];
      setReportMarker(coords);
      if (reportMapCtx) reportMapCtx.map.setCenter(coords, 16);
      const address = await reverseGeocodeYandex(coords);
      if (address && !document.getElementById("rep-region").value) {
        document.getElementById("rep-region").value = address;
      }
    },
    () => {
      status.textContent = "Не удалось определить местоположение.";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

async function submitReport() {
  const alertEl = document.getElementById("report-alert");
  alertEl.innerHTML = "";

  const photo = document.getElementById("photo").files[0];
  if (!photo) {
    alertEl.innerHTML = '<div class="alert error">Выберите фото находки.</div>';
    return;
  }
  if (!reportCoords) {
    alertEl.innerHTML = '<div class="alert error">Укажите место находки: кнопкой «Определить местоположение» или кликом по карте.</div>';
    return;
  }

  const formData = new FormData();
  formData.append("lat", reportCoords[0]);
  formData.append("lon", reportCoords[1]);
  formData.append("description", document.getElementById("rep-desc").value);
  formData.append("region", document.getElementById("rep-region").value);
  if (selectedReportSite) formData.append("site_id", selectedReportSite);
  formData.append("photo", photo);

  try {
    await api.postForm("/reports", formData);
    alertEl.innerHTML =
      '<div class="alert success">Репорт отправлен на модерацию. Спасибо! За принятый репорт начислится 10 баллов и ачивка «Дозорный берега».</div>';
    toast("Репорт отправлен", "success");
    document.getElementById("rep-desc").value = "";
    loadMyReports();
  } catch (err) {
    alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
  }
}

async function loadMyReports() {
  const list = document.getElementById("reports-list");
  if (!isLoggedIn()) {
    list.innerHTML = '<p class="muted">Войдите, чтобы увидеть свои репорты.</p>';
    return;
  }
  try {
    const reports = await api.get("/reports?mine_only=true");
    const counter = document.getElementById("my-report-count");
    if (counter) counter.textContent = String(reports.length);

    list.innerHTML = reports.length
      ? `<table class="table">
          <thead><tr><th>Дата</th><th>Фото</th><th>Описание</th><th>Координаты</th><th>Статус</th></tr></thead>
          <tbody>
            ${reports
              .map(
                (r) => `<tr>
                  <td style="white-space:nowrap">${formatDate(r.created_at)}</td>
                  <td><a href="${r.photo_url}" target="_blank" rel="noopener"><img src="${r.photo_url}" alt="Фото репорта" style="width:64px;height:64px;object-fit:cover;border:1px solid var(--color-divider)" /></a></td>
                  <td class="muted">${escapeHtml(r.description || "—")}</td>
                  <td class="muted" style="white-space:nowrap">${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}</td>
                  <td><span class="tag ${REPORT_STATUS_TAGS[r.status] || "tag-neutral"}">${REPORT_STATUS_LABELS[r.status] || r.status}</span></td>
                </tr>`
              )
              .join("")}
          </tbody>
        </table>`
      : '<p class="muted">У вас пока нет отправленных репортов.</p>';
  } catch (e) {
    list.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

/* ----------------------------------- организатор: только просмотр очереди -- */

function renderOrganizerReadOnlyView(root) {
  root.innerHTML = `
    <div class="kicker">Citizen science</div>
    <h1>Репорты о мусоре</h1>
    <p class="lead">Модерация репортов — задача администрации фонда. Здесь можно только просматривать очередь на модерации.</p>
    <div id="reports-readonly-table">${skeletonLines(4)}</div>`;
  loadOrganizerReadOnlyTable();
}

async function loadOrganizerReadOnlyTable() {
  const el = document.getElementById("reports-readonly-table");
  try {
    const reports = await api.get("/reports?status_filter=pending");
    el.innerHTML = reports.length
      ? reports
          .map(
            (r) => `
        <div class="queue-item">
          <img src="${r.photo_url}" alt="Фото репорта" />
          <div style="flex:1;min-width:0">
            <div style="font-size:13.5px;line-height:1.45;margin-bottom:5px">${escapeHtml(r.description || "Без описания")}</div>
            <div class="muted" style="font-size:11.5px">${formatDate(r.created_at)} · ${escapeHtml(r.region || "регион не указан")}</div>
          </div>
        </div>`
          )
          .join("")
      : '<p class="muted" style="border-top:1px solid var(--color-divider);padding-top:20px">Нет репортов на модерации.</p>';
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

/* ------------------------------------------------------ админ: модерация -- */

function renderModerationView(root) {
  root.innerHTML = `
    <div class="kicker">Модерация</div>
    <h1>Репорты о мусоре</h1>
    <p class="lead">Находки волонтёров, ожидающие решения. Принятый репорт даёт автору баллы и попадает в очередь приоритетных участков.</p>

    <div class="cols cols-side-wide">
      <div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:18px">
          <span class="micro">Сортировка</span>
          <div class="seg" id="reports-sort">
            <button type="button" class="active" data-sort="created_at">По дате</button>
            <button type="button" data-sort="region">По региону</button>
          </div>
          <span class="muted" style="font-size:12.5px;margin-left:auto" id="mod-count"></span>
        </div>
        <div id="reports-mod-list">${skeletonLines(4)}</div>
      </div>
      <div class="stack">
        <div>
          <div class="micro" style="margin-bottom:10px">Все находки на карте</div>
          <div class="ymap ymap-sm" id="mod-map"></div>
          <p class="muted" style="font-size:12px;margin-top:8px">Кликните по метке, чтобы увидеть описание репорта.</p>
        </div>
        <div class="panel-dark">
          <div class="micro" style="margin-bottom:10px">Как проверять</div>
          <p style="font-size:13px;line-height:1.55;margin:0">Смотрите, совпадает ли фото с координатами и участком берега. Если мусор не виден или снимок не с побережья — отклоняйте с понятной причиной: автор увидит её в уведомлениях.</p>
        </div>
      </div>
    </div>`;

  document.querySelectorAll("#reports-sort [data-sort]").forEach((btn) =>
    btn.addEventListener("click", () => {
      document.querySelectorAll("#reports-sort [data-sort]").forEach((b) => b.classList.toggle("active", b === btn));
      loadModerationList(btn.dataset.sort);
    })
  );

  loadModerationList("created_at");
}

async function loadModerationList(sortBy) {
  const el = document.getElementById("reports-mod-list");
  try {
    const reports = await api.get(`/reports?status_filter=pending&sort_by=${sortBy}`);
    document.getElementById("mod-count").textContent = reports.length
      ? `${reports.length} на модерации`
      : "очередь пуста";

    el.innerHTML = reports.length
      ? reports.map(moderationItem).join("")
      : '<p class="muted" style="border-top:1px solid var(--color-divider);padding-top:18px">Нет репортов на модерации.</p>';

    reports.forEach(bindModerationItem);
    renderModerationMap(reports);
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

function moderationItem(r) {
  return `
    <div class="queue-item" id="report-mod-${r.id}">
      <a href="${r.photo_url}" target="_blank" rel="noopener"><img src="${r.photo_url}" alt="Фото репорта" /></a>
      <div style="flex:1;min-width:0">
        <div style="font-size:13.5px;line-height:1.45;margin-bottom:5px">${escapeHtml(r.description || "Без описания")}</div>
        <div class="muted" style="font-size:11.5px;margin-bottom:10px">
          ${formatDate(r.created_at)} · ${escapeHtml(r.region || "регион не указан")} · ${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}
        </div>
        <div class="field" style="margin-bottom:10px;max-width:160px">
          <label for="report-points-${r.id}">Баллы за репорт</label>
          <input class="input" type="number" id="report-points-${r.id}" min="0" value="${r.points_reward}" />
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-approve>Принять</button>
          <button class="btn btn-secondary btn-sm" data-reject>Отклонить</button>
          <a class="btn btn-secondary btn-sm" href="${yandexRouteUrl(r.lat, r.lon)}" target="_blank" rel="noopener">Маршрут</a>
        </div>
      </div>
    </div>`;
}

function bindModerationItem(r) {
  const card = document.getElementById(`report-mod-${r.id}`);
  card.querySelector("[data-approve]").addEventListener("click", async () => {
    const pointsInput = document.getElementById(`report-points-${r.id}`);
    const points = pointsInput.value === "" ? null : parseInt(pointsInput.value, 10);
    try {
      await api.post(`/reports/${r.id}/moderate`, { approve: true, points });
      toast("Репорт принят", "success");
      loadModerationList(document.querySelector("#reports-sort .active").dataset.sort);
    } catch (err) {
      toast(err.message, "error");
    }
  });
  card.querySelector("[data-reject]").addEventListener("click", () => {
    currentReportRejectHandler = async (reason) => {
      await api.post(`/reports/${r.id}/moderate`, { approve: false, comment: reason });
      toast("Репорт отклонён", "success");
      loadModerationList(document.querySelector("#reports-sort .active").dataset.sort);
    };
    document.getElementById("reason-text").value = "";
    document.getElementById("reason-modal").hidden = false;
  });
}

async function renderModerationMap(reports) {
  if (!modMapCtx) {
    modMapCtx = await createYandexMap("mod-map", { zoom: 5, controls: ["zoomControl", "fullscreenControl"] });
  }
  if (!modMapCtx) return;

  modMapCtx.map.geoObjects.removeAll();
  if (!reports.length) return;

  reports.forEach((r) =>
    addYandexPlacemark(modMapCtx, [r.lat, r.lon], {
      title: r.region || "Репорт о мусоре",
      body: escapeHtml(r.description || "Без описания"),
      color: "#d6006c",
    })
  );

  fitYandexGeoObjects(modMapCtx, { maxZoom: 13 });
}
