/* Страница действующего мероприятия: подробности проведения, Яндекс.Карта
   с меткой точки сбора и радиусом гео-чекина, заявка и подтверждение участия. */

const EV_TYPE_LABELS = { cleanup: "Уборка", webinar: "Вебинар", quest: "Квест" };
const EV_TYPE_ICONS = {
  cleanup: "ph-duotone ph-broom",
  webinar: "ph-duotone ph-laptop",
  quest: "ph-duotone ph-map-trifold",
};
const REG_STATUS = {
  pending: { label: "Заявка на рассмотрении", tag: "tag-neutral" },
  approved: { label: "Заявка одобрена", tag: "tag-accent" },
  rejected: { label: "Заявка отклонена", tag: "tag-accent-2" },
  checked_in: { label: "Участие подтверждено", tag: "tag-accent" },
  cancelled: { label: "Заявка отменена", tag: "tag-neutral" },
};

let evEvent = null;
let evUser = null;
let evRegistration = null;
let evSite = null;
let evMapCtx = null;
let evUserPlacemark = null;

async function initEventPage() {
  const root = document.getElementById("event-root");
  const id = parseInt(new URLSearchParams(location.search).get("id"), 10);

  if (!id) {
    root.innerHTML = '<div class="alert error">Мероприятие не указано. <a href="/events">Вернуться к календарю</a>.</div>';
    return;
  }

  try {
    evEvent = await api.get(`/events/${id}`);
  } catch (e) {
    root.innerHTML = `<div class="alert error">${escapeHtml(e.message)} <a href="/events">Все мероприятия →</a></div>`;
    return;
  }

  document.title = `${evEvent.title} — Чистый берег`;

  evUser = isLoggedIn() ? await currentUser() : null;
  if (evEvent.site_id) {
    evSite = await api.get(`/sites/${evEvent.site_id}`).catch(() => null);
  }
  if (evUser) {
    evRegistration = await api.get(`/events/${id}/my-registration`).catch(() => null);
  }

  renderEvent();
  await renderEventMap();
  bindEventActions();

  if (location.hash === "#checkin") {
    document.getElementById("checkin")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderEvent() {
  const ev = evEvent;
  const start = new Date(ev.starts_at);
  const end = ev.ends_at ? new Date(ev.ends_at) : null;
  const closed = !!ev.applications_closed_at;
  const isVolunteer = !evUser || evUser.role === "volunteer";
  const isOwner = evUser && ev.organizer_id === evUser.id;

  document.getElementById("event-root").innerHTML = `
    <a href="/events" class="btn btn-ghost" style="padding-left:0;margin-bottom:14px"><i class="ph-duotone ph-arrow-left"></i>Все мероприятия</a>

    <div class="page-head">
      <div>
        <div class="kicker" style="display:flex;align-items:center;gap:8px">
          <i class="${EV_TYPE_ICONS[ev.event_type] || "ph-duotone ph-calendar-dots"}" style="font-size:16px"></i>
          ${EV_TYPE_LABELS[ev.event_type] || ev.event_type}${ev.region ? " · " + escapeHtml(ev.region) : ""}
        </div>
        <h1>${escapeHtml(ev.title)}</h1>
        <p class="muted" style="font-size:14.5px;margin:0">
          ${start.toLocaleString("ru-RU", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}${end ? " — " + end.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : ""}
          · ${escapeHtml(ev.address || "адрес уточняется")}
        </p>
      </div>
      <div class="spacer seg" style="border:1px solid var(--color-divider)">
        <div style="background:var(--color-bg);padding:10px 14px">
          <div class="cell-k">Баллы за чекин</div>
          <div style="font-family:var(--font-heading);font-weight:600;font-size:15px;margin-top:2px">+${ev.points_reward}</div>
        </div>
        <div style="background:var(--color-bg);padding:10px 14px">
          <div class="cell-k">Мест</div>
          <div style="font-family:var(--font-heading);font-weight:600;font-size:15px;margin-top:2px">${ev.capacity ? ev.capacity : "без лимита"}</div>
        </div>
        <div style="background:var(--color-bg);padding:10px 14px">
          <div class="cell-k">Радиус чекина</div>
          <div style="font-family:var(--font-heading);font-weight:600;font-size:15px;margin-top:2px">${CHECKIN_RADIUS_METERS} м</div>
        </div>
      </div>
    </div>

    <div class="cols cols-side-wide">
      <div>
        <h3>О мероприятии</h3>
        <p style="font-size:15.5px;line-height:1.6;max-width:64ch">${escapeHtml(ev.description)}</p>

        ${ev.roles && ev.roles.length ? renderRolesBlock(ev.roles) : ""}

        <h3 style="margin-top:38px">Как добраться</h3>
        <p class="muted" style="font-size:13.5px;margin:0 0 14px">Точка сбора отмечена на Яндекс.Карте. Пунктирный круг — радиус, в котором сработает гео-чекин.</p>
        <div class="ymap ymap-lg" id="event-map"></div>
        <div class="ymap-legend">
          <span><i class="ph-duotone ph-map-pin" style="color:var(--color-accent)"></i> ${escapeHtml(ev.address || "Адрес уточняется")}</span>
          <span class="muted">${ev.lat.toFixed(5)}, ${ev.lon.toFixed(5)}</span>
          <span style="margin-left:auto"><a class="btn btn-secondary btn-sm" href="${yandexRouteUrl(ev.lat, ev.lon)}" target="_blank" rel="noopener"><i class="ph-duotone ph-navigation-arrow"></i>Маршрут в Яндекс.Картах</a></span>
        </div>

        ${evSite ? renderSiteBlock(evSite) : ""}

        <h3 id="checkin" style="margin-top:44px">Подтверждение участия</h3>
        <p class="muted" style="font-size:13.5px;margin:0 0 18px">Чекин доступен на месте проведения после того, как организатор одобрил заявку. Он подтверждает участие и начисляет баллы.</p>

        <div class="cols" style="grid-template-columns:220px minmax(0,1fr);gap:28px;align-items:center">
          <div class="geo-dial">
            <div class="ring"></div>
            <div class="ring-2"></div>
            <i class="ph-duotone ph-crosshair"></i>
          </div>
          <div>
            <div style="font-family:var(--font-heading);font-weight:600;font-size:19px;margin-bottom:4px" id="geo-distance">Расстояние до точки сбора не определено</div>
            <p class="muted" style="font-size:13px;line-height:1.5;margin:0 0 16px" id="geo-hint">Разрешите доступ к геолокации — покажем, насколько вы близко, ещё до нажатия кнопки.</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button type="button" class="btn btn-secondary" id="geo-locate"><i class="ph-duotone ph-crosshair"></i>Определить местоположение</button>
              ${isVolunteer ? '<button type="button" class="btn btn-primary" id="checkin-btn">Подтвердить участие</button>' : ""}
            </div>
            <div id="event-msg" style="margin-top:14px"></div>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="panel-dark">
          <div class="micro" style="margin-bottom:10px">Когда и где</div>
          <div style="font-family:var(--font-heading);font-weight:600;font-size:20px;line-height:1.2;margin-bottom:6px">${start.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}, ${start.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</div>
          <p style="font-size:12.5px;margin:0 0 16px">${escapeHtml(ev.address || ev.region || "Место уточняется")}</p>
          <div style="height:1px;background:rgba(243,242,242,.16);margin-bottom:16px"></div>
          <div id="registration-box">${renderRegistrationBox(isVolunteer, isOwner, closed)}</div>
        </div>

        <div>
          <div class="micro" style="margin-bottom:12px">Что нужно для участия</div>
          ${requirementRow("ph-duotone ph-identification-badge", "Подтверждённый возраст (14+)", evUser ? (evUser.age_verified ? "выполнено" : "подтвердите в профиле") : "нужен вход")}
          ${
            ev.event_type === "cleanup"
              ? requirementRow("ph-duotone ph-graduation-cap", "Базовый курс волонтёра", "проходится в разделе «Уроки»")
              : ""
          }
          ${ev.prerequisite_lesson_id ? requirementRow("ph-duotone ph-book-open-text", "Курс, привязанный к мероприятию", "см. раздел «Уроки»") : ""}
          ${requirementRow("ph-duotone ph-map-pin-area", "Быть на площадке", `гео-чекин в радиусе ${CHECKIN_RADIUS_METERS} м`)}
        </div>

        <div>
          <div class="micro" style="margin-bottom:12px">Что взять с собой</div>
          <p class="muted" style="font-size:13px;line-height:1.55;margin:0">Перчатки, воду и удобную обувь. Мешки для мусора и жилеты обычно привозит организатор — уточните в описании выше.</p>
        </div>

        ${isOwner ? '<a class="btn btn-secondary btn-block" href="/organizer">Управлять мероприятием →</a>' : ""}
      </div>
    </div>`;
}

function renderRolesBlock(roles) {
  return `
    <h3 style="margin-top:38px">Роли участников</h3>
    <table class="table">
      <thead><tr><th>Роль</th><th>Описание</th><th style="text-align:right">Мест</th></tr></thead>
      <tbody>
        ${roles
          .map(
            (r) => `<tr>
              <td style="white-space:nowrap">${escapeHtml(r.title)}</td>
              <td class="muted">${escapeHtml(r.description || "—")}</td>
              <td style="text-align:right">${r.capacity ? r.capacity : "—"}</td>
            </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function renderSiteBlock(site) {
  return `
    <h3 style="margin-top:44px">Участок побережья под наблюдением</h3>
    <div class="note" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;min-width:240px">
        <div style="font-family:var(--font-heading);font-weight:600;font-size:16px">${escapeHtml(site.name)}</div>
        <div class="muted" style="font-size:13px">${escapeHtml(site.region || "")} · снимков ДЗЗ: ${(site.layers || []).length}</div>
      </div>
      <a class="btn btn-secondary btn-sm" href="/map?site=${site.id}">Смотреть «до/после» →</a>
    </div>`;
}

function requirementRow(icon, title, note) {
  return `
    <div style="display:flex;gap:11px;padding:10px 0;border-top:1px solid var(--color-divider)">
      <i class="${icon}" style="font-size:19px;color:var(--color-accent);flex:none"></i>
      <div>
        <div style="font-size:13.5px;line-height:1.4">${title}</div>
        <div class="muted" style="font-size:12px">${note}</div>
      </div>
    </div>`;
}

function renderRegistrationBox(isVolunteer, isOwner, closed) {
  if (!evUser) {
    return `
      <p style="font-size:12.5px;margin:0 0 12px">Войдите, чтобы подать заявку и получить баллы за участие.</p>
      <a class="btn btn-primary btn-block" href="/login">Войти</a>`;
  }
  if (isOwner) {
    return '<p style="font-size:12.5px;margin:0">Вы организатор этого мероприятия — заявки видны в разделе «Мои мероприятия».</p>';
  }
  if (!isVolunteer) {
    return '<p style="font-size:12.5px;margin:0">Запись на мероприятия доступна волонтёрам.</p>';
  }
  if (evRegistration) {
    const st = REG_STATUS[evRegistration.status] || { label: evRegistration.status, tag: "tag-neutral" };
    return `
      <span class="tag ${st.tag}">${st.label}</span>
      ${evRegistration.rejection_reason ? `<p style="font-size:12.5px;margin:10px 0 0">Причина: ${escapeHtml(evRegistration.rejection_reason)}</p>` : ""}
      ${
        evRegistration.status === "approved"
          ? '<p style="font-size:12.5px;margin:10px 0 0">На месте нажмите «Подтвердить участие» — кнопка ниже на странице.</p>'
          : ""
      }
      ${
        evRegistration.status === "checked_in"
          ? `<p style="font-size:12.5px;margin:10px 0 0">Баллы начислены: +${evEvent.points_reward}. Спасибо за участие!</p>`
          : ""
      }`;
  }
  return `
    ${closed ? '<p style="font-size:12.5px;margin:0 0 12px">Набор заявок закрыт организатором.</p>' : ""}
    ${evEvent.roles && evEvent.roles.length ? renderRoleSelect(evEvent.roles) : ""}
    <button type="button" class="btn btn-primary btn-block" id="register-btn" ${closed ? "disabled" : ""}>Подать заявку</button>`;
}

function renderRoleSelect(roles) {
  return `
    <div class="field" style="margin-bottom:12px">
      <label for="role-select" style="color:rgba(203,238,255,.75);font-size:11px;letter-spacing:.1em;text-transform:uppercase">Роль (необязательно)</label>
      <select id="role-select" class="input">
        <option value="">— без роли —</option>
        ${roles.map((r) => `<option value="${r.id}">${escapeHtml(r.title)}</option>`).join("")}
      </select>
    </div>`;
}

/* ----------------------------------------------------- Яндекс.Карта ------ */

async function renderEventMap() {
  evMapCtx = await createYandexMap("event-map", {
    center: [evEvent.lat, evEvent.lon],
    zoom: 15,
  });
  if (!evMapCtx) return;

  addYandexPlacemark(evMapCtx, [evEvent.lat, evEvent.lon], {
    title: evEvent.title,
    body: escapeHtml(evEvent.address || evEvent.region || ""),
  });
  addYandexRadius(evMapCtx, [evEvent.lat, evEvent.lon], CHECKIN_RADIUS_METERS);
  fitYandexGeoObjects(evMapCtx, { zoomMargin: 30, maxZoom: 16 });
}

function showUserOnMap(lat, lon) {
  if (!evMapCtx) return;
  if (evUserPlacemark) evMapCtx.map.geoObjects.remove(evUserPlacemark);
  evUserPlacemark = new evMapCtx.ymaps.Placemark(
    [lat, lon],
    { hintContent: "Вы здесь" },
    { preset: "islands#circleIcon", iconColor: "#d6006c" }
  );
  evMapCtx.map.geoObjects.add(evUserPlacemark);
}

/* --------------------------------------------------------- действия ------ */

function bindEventActions() {
  document.getElementById("geo-locate")?.addEventListener("click", () => locateUser());
  document.getElementById("register-btn")?.addEventListener("click", registerForEvent);
  document.getElementById("checkin-btn")?.addEventListener("click", doCheckin);
}

function eventMsg(html, cls = "success") {
  document.getElementById("event-msg").innerHTML = `<div class="alert ${cls}">${html}</div>`;
}

function locateUser() {
  return new Promise((resolve) => {
    const distEl = document.getElementById("geo-distance");
    const hintEl = document.getElementById("geo-hint");
    if (!navigator.geolocation) {
      hintEl.textContent = "Геолокация не поддерживается вашим браузером.";
      resolve(null);
      return;
    }
    distEl.textContent = "Определяем местоположение…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const distance = haversineMeters(latitude, longitude, evEvent.lat, evEvent.lon);
        distEl.textContent =
          distance < 1000
            ? `Вы в ${Math.round(distance)} м от точки сбора`
            : `Вы в ${(distance / 1000).toFixed(1)} км от точки сбора`;
        hintEl.textContent =
          distance <= CHECKIN_RADIUS_METERS
            ? `Вы внутри радиуса чекина (${CHECKIN_RADIUS_METERS} м) — можно подтверждать участие.`
            : `Чекин сработает ближе ${CHECKIN_RADIUS_METERS} м от точки сбора.`;
        showUserOnMap(latitude, longitude);
        resolve({ lat: latitude, lon: longitude });
      },
      () => {
        distEl.textContent = "Не удалось определить местоположение";
        hintEl.textContent = "Разрешите доступ к геолокации в настройках браузера и попробуйте снова.";
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

async function registerForEvent() {
  if (!isLoggedIn()) {
    window.location.href = "/login";
    return;
  }
  const roleSelect = document.getElementById("role-select");
  const role_id = roleSelect && roleSelect.value ? parseInt(roleSelect.value, 10) : null;
  try {
    evRegistration = await api.post(`/events/${evEvent.id}/register`, { role_id });
    toast("Заявка отправлена", "success");
    document.getElementById("registration-box").innerHTML = renderRegistrationBox(true, false, false);
    eventMsg("Заявка отправлена! Дождитесь решения организатора, затем на месте подтвердите участие.");
  } catch (e) {
    eventMsg(escapeHtml(e.message), "error");
  }
}

async function doCheckin() {
  if (!isLoggedIn()) {
    window.location.href = "/login";
    return;
  }
  eventMsg("Определяем местоположение…");
  const position = await locateUser();
  if (!position) {
    eventMsg("Не удалось определить местоположение. Разрешите доступ к геолокации.", "error");
    return;
  }
  try {
    evRegistration = await api.post(`/events/${evEvent.id}/checkin`, { lat: position.lat, lon: position.lon });
    eventMsg(`Чекин выполнен, начислено ${evEvent.points_reward} баллов. Спасибо за участие!`);
    toast("Участие подтверждено", "success");
    cachedUser = null;
    document.getElementById("registration-box").innerHTML = renderRegistrationBox(true, false, false);
    renderNav("/events");
  } catch (e) {
    eventMsg(escapeHtml(e.message), "error");
  }
}
