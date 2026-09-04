const EVENT_TYPE_LABELS = { cleanup: "🧹 Уборка", webinar: "💻 Вебинар", quest: "🗺️ Квест" };

async function initEventsPage() {
  const root = document.getElementById("events-root");
  const user = isLoggedIn() ? await currentUser() : null;
  root.innerHTML = skeletonCards(3);

  try {
    const events = await api.get("/events");
    if (!events.length) {
      root.innerHTML = '<p class="muted">Пока нет запланированных мероприятий.</p>';
      return;
    }
    root.innerHTML = events.map((ev) => renderEventCard(ev, user)).join("");
    events.forEach((ev) => bindEventCard(ev, user));
  } catch (e) {
    root.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

function renderEventCard(ev, user) {
  const isVolunteerViewer = !user || user.role === "volunteer";
  const isOwner = user && ev.organizer_id === user.id;

  const rolesOptions = isVolunteerViewer && ev.roles && ev.roles.length
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

  let actionsHtml;
  if (isVolunteerViewer) {
    actionsHtml = `
      <div id="event-actions-${ev.id}" style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn" data-action="register" data-id="${ev.id}" ${ev.applications_closed_at ? "disabled" : ""}>Подать заявку</button>
        <button class="btn secondary" data-action="checkin" data-id="${ev.id}">Подтвердить участие (гео-чекин)</button>
      </div>`;
  } else if (isOwner) {
    actionsHtml = `<div style="margin-top:10px"><a class="btn secondary" href="/organizer">Управлять мероприятием →</a></div>`;
  } else {
    actionsHtml = `<p class="muted" style="margin-top:10px">Запись на мероприятия доступна волонтёрам.</p>`;
  }

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
      ${actionsHtml}
      <div id="event-msg-${ev.id}"></div>
    </div>`;
}

function bindEventCard(ev, user) {
  const isVolunteerViewer = !user || user.role === "volunteer";
  if (!isVolunteerViewer) return;
  const card = document.getElementById(`event-${ev.id}`);
  card.querySelector('[data-action="register"]').addEventListener("click", () => registerForEvent(ev.id));
  card.querySelector('[data-action="checkin"]').addEventListener("click", () => checkinEvent(ev.id));
}

function eventMsg(id, html, cls = "success") {
  document.getElementById(`event-msg-${id}`).innerHTML = `<div class="alert ${cls}">${html}</div>`;
}

async function registerForEvent(id) {
  if (!isLoggedIn()) return (window.location.href = "/login");
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
  if (!isLoggedIn()) return (window.location.href = "/login");
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
        renderNav("/events");
      } catch (e) {
        eventMsg(id, escapeHtml(e.message), "error");
      }
    },
    () => eventMsg(id, "Не удалось определить местоположение. Разрешите доступ к геолокации.", "error")
  );
}
