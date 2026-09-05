let currentRejectHandler = null;
let roleFieldCount = 0;

const ROSTOV_CENTER = [47.2357, 39.7015];
let eventMap = null;
let eventPlacemark = null;
let selectedCoords = null;

function loadYandexMapsScript() {
  return new Promise((resolve, reject) => {
    if (window.ymaps) {
      window.ymaps.ready(() => resolve(window.ymaps));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_MAPS_JS_API_KEY}&lang=ru_RU`;
    script.onload = () => window.ymaps.ready(() => resolve(window.ymaps));
    script.onerror = () => reject(new Error("Не удалось загрузить Яндекс.Карты"));
    document.head.appendChild(script);
  });
}

function setEventMarker(ymaps, coords) {
  selectedCoords = coords;
  if (eventPlacemark) {
    eventPlacemark.geometry.setCoordinates(coords);
  } else {
    eventPlacemark = new ymaps.Placemark(coords, {}, { draggable: true });
    eventPlacemark.events.add("dragend", () => {
      selectedCoords = eventPlacemark.geometry.getCoordinates();
    });
    eventMap.geoObjects.add(eventPlacemark);
  }
}

async function initEventMap() {
  const mapEl = document.getElementById("ce-map");
  if (!mapEl) return;
  eventMap = null;
  eventPlacemark = null;
  selectedCoords = null;

  try {
    const ymaps = await loadYandexMapsScript();
    eventMap = new ymaps.Map("ce-map", { center: ROSTOV_CENTER, zoom: 11, controls: ["zoomControl"] });
    eventMap.events.add("click", (e) => setEventMarker(ymaps, e.get("coords")));
  } catch (e) {
    mapEl.innerHTML = '<p class="muted" style="padding:12px">Не удалось загрузить карту.</p>';
  }
}

async function geocodeAddress(text) {
  if (!window.ymaps || !eventMap) return;
  try {
    const res = await window.ymaps.geocode(text, { results: 1 });
    const firstGeoObject = res.geoObjects.get(0);
    if (firstGeoObject) {
      const coords = firstGeoObject.geometry.getCoordinates();
      eventMap.setCenter(coords, 16);
      setEventMarker(window.ymaps, coords);
    }
  } catch (e) {
    /* карта необязательна — просто не переместится */
  }
}

async function initOrganizerPage() {
  requireAuth();
  const user = await currentUser(true);
  if (!user || user.role !== "organizer") {
    document.getElementById("create-event-root").innerHTML = "";
    document.getElementById("organizer-root").innerHTML =
      '<div class="alert error">Доступно только организаторам.</div>';
    return;
  }
  if (user.organization && user.organization.status !== "approved") {
    document.getElementById("create-event-root").innerHTML =
      '<div class="alert info">Создание мероприятий станет доступно после подтверждения вашей организации администрацией — см. статус в профиле.</div>';
    document.getElementById("organizer-root").innerHTML = "";
    return;
  }

  await renderCreateEventForm();

  const root = document.getElementById("organizer-root");
  root.innerHTML = skeletonCards(2);

  let events;
  try {
    events = await api.get("/events?mine_only=true");
  } catch (e) {
    root.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
    return;
  }

  if (!events.length) {
    root.innerHTML = '<p class="muted">У вас пока нет мероприятий. Создайте первое выше.</p>';
    return;
  }

  root.innerHTML = `
    <div class="field">
      <label for="event-select">Мероприятие</label>
      <select id="event-select">
        ${events.map((ev) => `<option value="${ev.id}">${escapeHtml(ev.title)} — ${formatDate(ev.starts_at)}</option>`).join("")}
      </select>
    </div>
    <div id="event-detail"></div>
    <h2>Заявки</h2>
    <div id="applicants-root">Загрузка…</div>
  `;

  document.getElementById("event-select").addEventListener("change", (e) => loadEvent(parseInt(e.target.value, 10)));
  loadEvent(events[0].id);

  document.getElementById("reject-cancel").addEventListener("click", () => {
    document.getElementById("reject-modal").hidden = true;
  });
  document.getElementById("reject-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const reason = document.getElementById("reject-reason").value.trim();
    document.getElementById("reject-modal").hidden = true;
    if (currentRejectHandler) await currentRejectHandler(reason);
  });
}

async function loadEvent(eventId) {
  const detailEl = document.getElementById("event-detail");
  const applicantsEl = document.getElementById("applicants-root");
  detailEl.innerHTML = "";
  applicantsEl.innerHTML = skeletonLines(3);

  const event = await api.get(`/events/${eventId}`);
  detailEl.innerHTML = `
    <div class="card">
      <p>${event.applications_closed_at ? '<span class="badge rejected">Набор закрыт</span>' : '<span class="badge approved">Набор открыт</span>'}</p>
      ${event.applications_closed_at ? "" : `<button class="btn secondary" id="close-reg-btn">Закрыть набор досрочно</button>`}
    </div>`;

  const closeBtn = document.getElementById("close-reg-btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", async () => {
      await api.post(`/events/${eventId}/close-registration`);
      loadEvent(eventId);
    });
  }

  const applicants = await api.get(`/events/${eventId}/applicants`);
  if (!applicants.length) {
    applicantsEl.innerHTML = '<p class="muted">Заявок пока нет.</p>';
    return;
  }

  applicantsEl.innerHTML = `<table>
    <thead><tr><th>Волонтёр</th><th>Опыт</th><th>Статус</th><th>Действия</th></tr></thead>
    <tbody>${applicants.map((a) => applicantRow(eventId, a)).join("")}</tbody>
  </table>`;

  applicants.forEach((a) => bindApplicantRow(eventId, a));
}

function statusBadge(status) {
  const map = {
    pending: '<span class="badge pending">На рассмотрении</span>',
    approved: '<span class="badge approved">Одобрена</span>',
    rejected: '<span class="badge rejected">Отклонена</span>',
    checked_in: '<span class="badge approved">Участие подтверждено</span>',
    cancelled: '<span class="badge rejected">Отменена</span>',
  };
  return map[status] || status;
}

function applicantRow(eventId, a) {
  const v = a.volunteer;
  const featuredMark = a.is_featured ? " ⭐" : "";
  return `<tr id="applicant-${a.id}">
    <td>${escapeHtml(v.display_name)}${featuredMark}<div class="muted">${Math.round(v.points_total)} б. · ${v.events_attended} мероприятий · ${v.achievements_count} ачивок</div></td>
    <td>${v.events_attended} посещено</td>
    <td>${statusBadge(a.status)}${a.rejection_reason ? `<div class="muted">${escapeHtml(a.rejection_reason)}</div>` : ""}</td>
    <td style="display:flex; gap:6px; flex-wrap:wrap">
      ${a.status === "pending" ? `<button class="btn" data-action="approve">Одобрить</button><button class="btn danger" data-action="reject">Отклонить</button>` : ""}
      <button class="btn secondary" data-action="bonus">+баллы</button>
      <button class="btn secondary" data-action="feature">${a.is_featured ? "Снять отметку" : "Выделить"}</button>
    </td>
  </tr>`;
}

function bindApplicantRow(eventId, a) {
  const row = document.getElementById(`applicant-${a.id}`);
  const approveBtn = row.querySelector('[data-action="approve"]');
  if (approveBtn) {
    approveBtn.addEventListener("click", async () => {
      await api.patch(`/events/${eventId}/applicants/${a.id}`, { status: "approved" });
      loadEvent(eventId);
    });
  }
  const rejectBtn = row.querySelector('[data-action="reject"]');
  if (rejectBtn) {
    rejectBtn.addEventListener("click", () => {
      currentRejectHandler = async (reason) => {
        await api.patch(`/events/${eventId}/applicants/${a.id}`, { status: "rejected", reason });
        loadEvent(eventId);
      };
      document.getElementById("reject-reason").value = "";
      document.getElementById("reject-modal").hidden = false;
    });
  }
  row.querySelector('[data-action="bonus"]').addEventListener("click", async () => {
    const amount = prompt("Сколько баллов начислить?");
    if (!amount) return;
    const reason = prompt("За что?", "Отличная работа") || "Бонус от организатора";
    await api.post(`/events/${eventId}/applicants/${a.id}/bonus-points`, { amount: parseFloat(amount), reason });
    loadEvent(eventId);
  });
  row.querySelector('[data-action="feature"]').addEventListener("click", async () => {
    await api.post(`/events/${eventId}/applicants/${a.id}/feature`, {
      is_featured: !a.is_featured,
      special_note: a.is_featured ? null : "Отличился на мероприятии",
    });
    loadEvent(eventId);
  });
}

async function renderCreateEventForm() {
  const root = document.getElementById("create-event-root");
  let sites = [];
  try {
    sites = await api.get("/sites");
  } catch (e) {
    /* игнорируем — форма всё равно покажется, просто без выбора сайта */
  }

  root.innerHTML = `
    <h2>Создать мероприятие</h2>
    <div class="card">
      <div id="create-event-alert"></div>
      <form id="create-event-form">
        <div class="field"><label for="ce-title">Название</label><input type="text" id="ce-title" required /></div>
        <div class="field"><label for="ce-description">Описание</label><textarea id="ce-description" rows="3" required></textarea></div>
        <div class="field">
          <label for="ce-type">Тип</label>
          <select id="ce-type">
            <option value="cleanup">Уборка</option>
            <option value="webinar">Вебинар</option>
            <option value="quest">Квест</option>
          </select>
        </div>
        <div class="field" id="ce-site-field">
          <label for="ce-site">Участок побережья (обязательно для уборки)</label>
          <select id="ce-site">
            <option value="">— выбрать —</option>
            ${sites.map((s) => `<option value="${s.id}" data-lat="${s.lat}" data-lon="${s.lon}">${escapeHtml(s.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label for="ce-region">Регион</label><input type="text" id="ce-region" /></div>
        <div class="field"><label for="ce-address">Адрес</label><input type="text" id="ce-address" autocomplete="off" placeholder="Начните вводить адрес…" /></div>
        <div class="field">
          <label>Точное место на карте (кликните, чтобы поставить метку; можно перетащить)</label>
          <div id="ce-map" style="height:320px;border-radius:8px;border:1px solid var(--border)"></div>
        </div>
        <div class="field"><label for="ce-starts">Дата и время начала</label><input type="datetime-local" id="ce-starts" required /></div>
        <div class="field"><label for="ce-capacity">Лимит участников (опционально)</label><input type="number" id="ce-capacity" min="1" /></div>
        <div class="field"><label for="ce-points">Баллы за участие</label><input type="number" id="ce-points" value="20" min="0" /></div>

        <div class="field">
          <label>Роли участников (опционально)</label>
          <div id="ce-roles"></div>
          <button class="btn secondary" type="button" id="ce-add-role">+ Добавить роль</button>
        </div>

        <button class="btn" type="submit">Создать мероприятие</button>
      </form>
    </div>`;

  document.getElementById("ce-add-role").addEventListener("click", () => {
    const id = `ce-role-${roleFieldCount++}`;
    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.gap = "8px";
    wrap.style.marginBottom = "8px";
    wrap.innerHTML = `<input type="text" placeholder="Название роли" class="ce-role-title" style="flex:1" />
      <input type="number" placeholder="Лимит" class="ce-role-capacity" style="width:100px" min="1" />
      <button class="btn secondary" type="button" data-remove>✕</button>`;
    wrap.querySelector("[data-remove]").addEventListener("click", () => wrap.remove());
    document.getElementById("ce-roles").appendChild(wrap);
  });

  initEventMap();
  initAddressSuggest(document.getElementById("ce-address"), (text) => geocodeAddress(text));

  document.getElementById("create-event-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("create-event-alert");
    alertEl.innerHTML = "";

    const roles = Array.from(document.querySelectorAll("#ce-roles > div"))
      .map((wrap) => ({
        title: wrap.querySelector(".ce-role-title").value.trim(),
        capacity: wrap.querySelector(".ce-role-capacity").value
          ? parseInt(wrap.querySelector(".ce-role-capacity").value, 10)
          : null,
      }))
      .filter((r) => r.title);

    const siteSelect = document.getElementById("ce-site");
    const siteOption = siteSelect.selectedOptions[0];
    const site_id = siteSelect.value ? parseInt(siteSelect.value, 10) : null;
    // Приоритет координат: метка на карте (точнее всего) → выбранный участок побережья → дефолт.
    let lat = 55.751244;
    let lon = 37.618423;
    if (siteOption && siteOption.dataset.lat) {
      lat = parseFloat(siteOption.dataset.lat);
      lon = parseFloat(siteOption.dataset.lon);
    }
    if (selectedCoords) {
      [lat, lon] = selectedCoords;
    }

    const payload = {
      title: document.getElementById("ce-title").value.trim(),
      description: document.getElementById("ce-description").value.trim(),
      event_type: document.getElementById("ce-type").value,
      site_id,
      region: document.getElementById("ce-region").value.trim() || null,
      address: document.getElementById("ce-address").value.trim() || null,
      starts_at: new Date(document.getElementById("ce-starts").value).toISOString(),
      capacity: document.getElementById("ce-capacity").value ? parseInt(document.getElementById("ce-capacity").value, 10) : null,
      points_reward: parseInt(document.getElementById("ce-points").value, 10) || 0,
      lat,
      lon,
      roles,
    };

    try {
      await api.post("/events", payload);
      alertEl.innerHTML = '<div class="alert success">Мероприятие создано и отправлено на модерацию!</div>';
      toast("Мероприятие создано", "success");
      document.getElementById("create-event-form").reset();
      initOrganizerPage();
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });
}
