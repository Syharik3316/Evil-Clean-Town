/* Кабинет организатора: создание мероприятий (точка сбора выбирается
   на Яндекс.Карте) и управление заявками волонтёров. */

let currentRejectHandler = null;
let roleFieldCount = 0;

let eventMapCtx = null;
let eventPlacemark = null;
let selectedCoords = null;
let organizerSites = [];

async function initOrganizerPage() {
  requireAuth();
  const user = await currentUser(true);
  if (!user || user.role !== "organizer") {
    document.getElementById("create-event-root").innerHTML =
      '<div class="alert error">Кабинет доступен только организаторам.</div>';
    document.getElementById("organizer-root").innerHTML = "";
    return;
  }

  document.getElementById("reject-cancel").addEventListener("click", () => {
    document.getElementById("reject-modal").hidden = true;
  });
  document.getElementById("reject-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const reason = document.getElementById("reject-reason").value.trim();
    document.getElementById("reject-modal").hidden = true;
    if (currentRejectHandler) await currentRejectHandler(reason);
  });

  await renderCreateEventForm();
  await renderManagement();
}

/* ------------------------------------------------ создание мероприятия --- */

async function renderCreateEventForm() {
  const root = document.getElementById("create-event-root");
  organizerSites = await api.get("/sites").catch(() => []);

  root.innerHTML = `
    <h2 style="font-size:22px">Создать мероприятие</h2>
    <p class="muted" style="font-size:13.5px;max-width:56ch">После создания мероприятие уходит на модерацию администратору фонда и появляется в календаре после одобрения.</p>
    <div id="create-event-alert"></div>

    <form id="create-event-form">
      <div class="field"><label for="ce-title">Название</label><input class="input" type="text" id="ce-title" required /></div>
      <div class="field"><label for="ce-description">Описание</label><textarea class="input" id="ce-description" rows="3" required placeholder="Что будем делать, что взять с собой, где именно собираемся"></textarea></div>

      <div class="cols" style="grid-template-columns:1fr 1fr;gap:16px">
        <div class="field">
          <label for="ce-type">Тип</label>
          <select class="input" id="ce-type">
            <option value="cleanup">Уборка</option>
            <option value="webinar">Вебинар</option>
            <option value="quest">Квест</option>
          </select>
        </div>
        <div class="field">
          <label for="ce-site">Участок побережья (обязателен для уборки)</label>
          <select class="input" id="ce-site">
            <option value="">— выбрать —</option>
            ${organizerSites
              .map((s) => `<option value="${s.id}" data-lat="${s.lat}" data-lon="${s.lon}">${escapeHtml(s.name)}</option>`)
              .join("")}
          </select>
        </div>
      </div>

      <div class="cols" style="grid-template-columns:1fr 1fr;gap:16px">
        <div class="field"><label for="ce-starts">Дата и время начала</label><input class="input" type="datetime-local" id="ce-starts" required /></div>
        <div class="field"><label for="ce-region">Регион</label><input class="input" type="text" id="ce-region" placeholder="Например, Краснодарский край" /></div>
      </div>

      <div class="field"><label for="ce-address">Адрес точки сбора</label><input class="input" type="text" id="ce-address" autocomplete="off" placeholder="Начните вводить адрес…" /></div>

      <div class="field">
        <span class="field-label">Точное место на Яндекс.Карте</span>
        <div class="ymap" id="ce-map"></div>
        <span class="field-hint" id="ce-coords">Кликните по карте, чтобы поставить метку, — её можно перетащить. Волонтёры увидят эту точку и радиус гео-чекина (${CHECKIN_RADIUS_METERS} м).</span>
      </div>

      <div class="cols" style="grid-template-columns:1fr 1fr;gap:16px">
        <div class="field"><label for="ce-capacity">Лимит участников (необязательно)</label><input class="input" type="number" id="ce-capacity" min="1" /></div>
        <div class="field"><label for="ce-points">Баллы за участие</label><input class="input" type="number" id="ce-points" value="20" min="0" /></div>
      </div>

      <div class="field">
        <span class="field-label">Роли участников (необязательно)</span>
        <div id="ce-roles"></div>
        <button class="btn btn-secondary btn-sm" type="button" id="ce-add-role" style="align-self:flex-start">+ Добавить роль</button>
      </div>

      <button class="btn btn-primary btn-lg" type="submit">Создать мероприятие</button>
    </form>`;

  document.getElementById("ce-add-role").addEventListener("click", () => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;gap:8px;margin-bottom:8px";
    wrap.dataset.role = String(roleFieldCount++);
    wrap.innerHTML = `
      <input class="input ce-role-title" type="text" placeholder="Название роли" style="flex:1" />
      <input class="input ce-role-capacity" type="number" placeholder="Лимит" style="width:110px" min="1" />
      <button class="btn btn-secondary" type="button" data-remove>✕</button>`;
    wrap.querySelector("[data-remove]").addEventListener("click", () => wrap.remove());
    document.getElementById("ce-roles").appendChild(wrap);
  });

  document.getElementById("ce-site").addEventListener("change", (e) => {
    const opt = e.target.selectedOptions[0];
    if (opt && opt.dataset.lat && eventMapCtx) {
      const coords = [parseFloat(opt.dataset.lat), parseFloat(opt.dataset.lon)];
      eventMapCtx.map.setCenter(coords, 14);
      setEventMarker(coords);
    }
  });

  await initEventMap();
  initAddressSuggest(document.getElementById("ce-address"), async (text) => {
    const coords = await geocodeYandex(text);
    if (coords && eventMapCtx) {
      eventMapCtx.map.setCenter(coords, 16);
      setEventMarker(coords);
    }
  });

  document.getElementById("create-event-form").addEventListener("submit", submitCreateEvent);
}

async function initEventMap() {
  const center = organizerSites.length ? [organizerSites[0].lat, organizerSites[0].lon] : YANDEX_DEFAULT_CENTER;
  eventMapCtx = await createYandexMap("ce-map", { center, zoom: organizerSites.length ? 11 : 6 });
  if (!eventMapCtx) return;
  eventMapCtx.map.events.add("click", (e) => setEventMarker(e.get("coords")));
}

function setEventMarker(coords) {
  selectedCoords = coords;
  document.getElementById("ce-coords").textContent =
    `Точка сбора: ${coords[0].toFixed(5)}, ${coords[1].toFixed(5)} · радиус гео-чекина ${CHECKIN_RADIUS_METERS} м`;
  if (!eventMapCtx) return;

  if (eventPlacemark) {
    eventPlacemark.geometry.setCoordinates(coords);
  } else {
    eventPlacemark = new eventMapCtx.ymaps.Placemark(
      coords,
      { hintContent: "Точка сбора" },
      { preset: "islands#circleIcon", iconColor: "#0088b0", draggable: true }
    );
    eventPlacemark.events.add("dragend", () => setEventMarker(eventPlacemark.geometry.getCoordinates()));
    eventMapCtx.map.geoObjects.add(eventPlacemark);
  }
}

async function submitCreateEvent(e) {
  e.preventDefault();
  const alertEl = document.getElementById("create-event-alert");
  alertEl.innerHTML = "";

  const roles = Array.from(document.querySelectorAll("#ce-roles > [data-role]"))
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

  // Приоритет координат: метка на карте (точнее всего) → выбранный участок → дефолт.
  let lat = 55.751244;
  let lon = 37.618423;
  if (siteOption && siteOption.dataset.lat) {
    lat = parseFloat(siteOption.dataset.lat);
    lon = parseFloat(siteOption.dataset.lon);
  }
  if (selectedCoords) [lat, lon] = selectedCoords;

  const payload = {
    title: document.getElementById("ce-title").value.trim(),
    description: document.getElementById("ce-description").value.trim(),
    event_type: document.getElementById("ce-type").value,
    site_id,
    region: document.getElementById("ce-region").value.trim() || null,
    address: document.getElementById("ce-address").value.trim() || null,
    starts_at: new Date(document.getElementById("ce-starts").value).toISOString(),
    capacity: document.getElementById("ce-capacity").value
      ? parseInt(document.getElementById("ce-capacity").value, 10)
      : null,
    points_reward: parseInt(document.getElementById("ce-points").value, 10) || 0,
    lat,
    lon,
    roles,
  };

  try {
    await api.post("/events", payload);
    alertEl.innerHTML = '<div class="alert success">Мероприятие создано и отправлено на модерацию.</div>';
    toast("Мероприятие создано", "success");
    document.getElementById("create-event-form").reset();
    document.getElementById("ce-roles").innerHTML = "";
    await renderManagement();
  } catch (err) {
    alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
  }
}

/* -------------------------------------------------- управление заявками -- */

async function renderManagement() {
  const root = document.getElementById("organizer-root");
  root.innerHTML = skeletonLines(4);

  let events;
  try {
    events = await api.get("/events?mine_only=true");
  } catch (e) {
    root.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
    return;
  }

  if (!events.length) {
    root.innerHTML = '<p class="muted">У вас пока нет мероприятий — создайте первое в форме слева.</p>';
    return;
  }

  root.innerHTML = `
    <div>
      <div class="micro" style="margin-bottom:10px">Мероприятие</div>
      <select class="input" id="event-select">
        ${events
          .map((ev) => `<option value="${ev.id}">${escapeHtml(ev.title)} — ${formatDate(ev.starts_at)}</option>`)
          .join("")}
      </select>
    </div>
    <div id="event-detail"></div>
    <div>
      <h3 style="font-size:18px">Заявки</h3>
      <div id="applicants-root">${skeletonLines(3)}</div>
    </div>`;

  document
    .getElementById("event-select")
    .addEventListener("change", (e) => loadOrganizerEvent(parseInt(e.target.value, 10)));
  loadOrganizerEvent(events[0].id);
}

const ORG_EVENT_STATUS = {
  draft: "Черновик",
  pending_review: "На модерации",
  published: "Опубликовано",
  rejected: "Отклонено",
  cancelled: "Отменено",
};

async function loadOrganizerEvent(eventId) {
  const detailEl = document.getElementById("event-detail");
  const applicantsEl = document.getElementById("applicants-root");
  detailEl.innerHTML = "";
  applicantsEl.innerHTML = skeletonLines(3);

  const event = await api.get(`/events/${eventId}`);
  detailEl.innerHTML = `
    <div class="panel-dark">
      <div class="micro" style="margin-bottom:8px">Статус</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <span class="tag tag-accent">${ORG_EVENT_STATUS[event.status] || event.status}</span>
        <span class="tag ${event.applications_closed_at ? "tag-accent-2" : "tag-accent"}">${event.applications_closed_at ? "Набор закрыт" : "Набор открыт"}</span>
      </div>
      <div style="font-size:12.5px;margin-bottom:14px">${formatDate(event.starts_at)} · ${escapeHtml(event.address || event.region || "место не указано")}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn btn-on-dark btn-sm" href="/event?id=${event.id}">Страница мероприятия</a>
        ${event.applications_closed_at ? "" : '<button class="btn btn-primary btn-sm" id="close-reg-btn">Закрыть набор</button>'}
      </div>
    </div>`;

  document.getElementById("close-reg-btn")?.addEventListener("click", async () => {
    await api.post(`/events/${eventId}/close-registration`);
    loadOrganizerEvent(eventId);
  });

  const applicants = await api.get(`/events/${eventId}/applicants`);
  if (!applicants.length) {
    applicantsEl.innerHTML = '<p class="muted" style="font-size:13.5px">Заявок пока нет.</p>';
    return;
  }

  applicantsEl.innerHTML = applicants.map(applicantCard).join("");
  applicants.forEach((a) => bindApplicantCard(eventId, a));
}

const APPLICANT_STATUS = {
  pending: ["На рассмотрении", "tag-neutral"],
  approved: ["Одобрена", "tag-accent"],
  rejected: ["Отклонена", "tag-accent-2"],
  checked_in: ["Участие подтверждено", "tag-accent"],
  cancelled: ["Отменена", "tag-neutral"],
};

function applicantCard(a) {
  const v = a.volunteer;
  const [label, tagClass] = APPLICANT_STATUS[a.status] || [a.status, "tag-neutral"];
  return `
    <div style="border-top:1px solid var(--color-divider);padding:16px 0" id="applicant-${a.id}">
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px">
        <strong style="font-family:var(--font-heading);font-size:15px">${escapeHtml(v.display_name)}${a.is_featured ? " ⭐" : ""}</strong>
        <span class="tag ${tagClass}" style="margin-left:auto">${label}</span>
      </div>
      <div class="muted" style="font-size:12.5px;margin-bottom:10px">
        ${Math.round(v.points_total)} б. · ${v.events_attended} мероприятий · ${v.achievements_count} ачивок
      </div>
      ${a.rejection_reason ? `<div class="muted" style="font-size:12.5px;margin-bottom:10px">Причина: ${escapeHtml(a.rejection_reason)}</div>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${a.status === "pending" ? '<button class="btn btn-primary btn-sm" data-action="approve">Одобрить</button><button class="btn btn-secondary btn-sm" data-action="reject">Отклонить</button>' : ""}
        <button class="btn btn-secondary btn-sm" data-action="bonus">+ баллы</button>
        <button class="btn btn-secondary btn-sm" data-action="feature">${a.is_featured ? "Снять отметку" : "Выделить"}</button>
      </div>
    </div>`;
}

function bindApplicantCard(eventId, a) {
  const row = document.getElementById(`applicant-${a.id}`);

  row.querySelector('[data-action="approve"]')?.addEventListener("click", async () => {
    await api.patch(`/events/${eventId}/applicants/${a.id}`, { status: "approved" });
    toast("Заявка одобрена", "success");
    loadOrganizerEvent(eventId);
  });

  row.querySelector('[data-action="reject"]')?.addEventListener("click", () => {
    currentRejectHandler = async (reason) => {
      await api.patch(`/events/${eventId}/applicants/${a.id}`, { status: "rejected", reason });
      loadOrganizerEvent(eventId);
    };
    document.getElementById("reject-reason").value = "";
    document.getElementById("reject-modal").hidden = false;
  });

  row.querySelector('[data-action="bonus"]').addEventListener("click", async () => {
    const amount = prompt("Сколько баллов начислить?");
    if (!amount) return;
    const reason = prompt("За что?", "Отличная работа") || "Бонус от организатора";
    await api.post(`/events/${eventId}/applicants/${a.id}/bonus-points`, { amount: parseFloat(amount), reason });
    toast("Баллы начислены", "success");
    loadOrganizerEvent(eventId);
  });

  row.querySelector('[data-action="feature"]').addEventListener("click", async () => {
    await api.post(`/events/${eventId}/applicants/${a.id}/feature`, {
      is_featured: !a.is_featured,
      special_note: a.is_featured ? null : "Отличился на мероприятии",
    });
    loadOrganizerEvent(eventId);
  });
}
