const EVENT_TYPE_LABELS = { cleanup: "🧹 Уборка", webinar: "💻 Вебинар", quest: "🗺️ Квест" };

async function initEventsPage() {
  const root = document.getElementById("events-root");
  const user = isLoggedIn() ? await currentUser() : null;

  if (user && user.role === "organizer") {
    await renderCreateEventForm();
  }

  try {
    const events = await api.get("/events");
    if (!events.length) {
      root.innerHTML = '<p class="muted">Пока нет запланированных мероприятий.</p>';
      return;
    }
    root.innerHTML = events.map(renderEventCard).join("");
    events.forEach(bindEventCard);
  } catch (e) {
    root.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

function renderEventCard(ev) {
  const rolesOptions = ev.roles && ev.roles.length
    ? `<div class="field"><label>Роль (опционально)</label>
        <select id="event-role-${ev.id}">
          <option value="">— без роли —</option>
          ${ev.roles.map((r) => `<option value="${r.id}">${escapeHtml(r.title)}</option>`).join("")}
        </select>
      </div>`
    : "";
  const closedNotice = ev.applications_closed_at
    ? '<p class="badge rejected">Набор закрыт</p>'
    : "";

  return `
    <div class="card" id="event-${ev.id}">
      <span class="badge">${EVENT_TYPE_LABELS[ev.event_type] || ev.event_type}</span>
      ${ev.region ? `<span class="badge">${escapeHtml(ev.region)}</span>` : ""}
      <h2 style="margin:8px 0 4px">${escapeHtml(ev.title)}</h2>
      <p class="muted">${formatDate(ev.starts_at)} ${ev.address ? "· " + escapeHtml(ev.address) : ""}</p>
      <p>${escapeHtml(ev.description)}</p>
      <p class="badge">+${ev.points_reward} баллов за чекин</p>
      ${closedNotice}
      ${rolesOptions}
      <div id="event-actions-${ev.id}" style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn" data-action="register" data-id="${ev.id}" ${ev.applications_closed_at ? "disabled" : ""}>Подать заявку</button>
        <button class="btn secondary" data-action="checkin" data-id="${ev.id}">Подтвердить участие (гео-чекин)</button>
      </div>
      <div id="event-msg-${ev.id}"></div>
    </div>`;
}

function bindEventCard(ev) {
  const card = document.getElementById(`event-${ev.id}`);
  card.querySelector('[data-action="register"]').addEventListener("click", () => registerForEvent(ev.id));
  card.querySelector('[data-action="checkin"]').addEventListener("click", () => checkinEvent(ev.id));
}

function eventMsg(id, html, cls = "success") {
  document.getElementById(`event-msg-${id}`).innerHTML = `<div class="alert ${cls}">${html}</div>`;
}

async function registerForEvent(id) {
  if (!isLoggedIn()) return (window.location.href = "login.html");
  const roleSelect = document.getElementById(`event-role-${id}`);
  const role_id = roleSelect && roleSelect.value ? parseInt(roleSelect.value, 10) : null;
  try {
    await api.post(`/events/${id}/register`, { role_id });
    eventMsg(id, "Заявка отправлена! Дождитесь решения организатора, затем на месте нажмите «Подтвердить участие».");
  } catch (e) {
    if (e.message.includes("уже подавали")) {
      eventMsg(id, "Вы уже подавали заявку на это мероприятие.", "success");
    } else {
      eventMsg(id, escapeHtml(e.message), "error");
    }
  }
}

function checkinEvent(id) {
  if (!isLoggedIn()) return (window.location.href = "login.html");
  if (!navigator.geolocation) {
    eventMsg(id, "Геолокация не поддерживается вашим браузером.", "error");
    return;
  }
  eventMsg(id, "Определяем местоположение…", "success");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        await api.post(`/events/${id}/checkin`, {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
        eventMsg(id, "Чекин выполнен, баллы начислены! Спасибо за участие 🌊");
        cachedUser = null;
        renderNav("events.html");
      } catch (e) {
        eventMsg(id, escapeHtml(e.message), "error");
      }
    },
    () => eventMsg(id, "Не удалось определить местоположение. Разрешите доступ к геолокации.", "error")
  );
}

let roleFieldCount = 0;

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
        <div class="field"><label for="ce-address">Адрес</label><input type="text" id="ce-address" /></div>
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
    const lat = siteOption && siteOption.dataset.lat ? parseFloat(siteOption.dataset.lat) : 55.751244;
    const lon = siteOption && siteOption.dataset.lon ? parseFloat(siteOption.dataset.lon) : 37.618423;

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
      alertEl.innerHTML = '<div class="alert success">Мероприятие создано!</div>';
      document.getElementById("create-event-form").reset();
      initEventsPage();
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });
}
