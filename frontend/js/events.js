const EVENT_TYPE_LABELS = { cleanup: "🧹 Уборка", webinar: "💻 Вебинар", quest: "🗺️ Квест" };

async function initEventsPage() {
  const root = document.getElementById("events-root");
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
  return `
    <div class="card" id="event-${ev.id}">
      <span class="badge">${EVENT_TYPE_LABELS[ev.event_type] || ev.event_type}</span>
      <h2 style="margin:8px 0 4px">${escapeHtml(ev.title)}</h2>
      <p class="muted">${formatDate(ev.starts_at)} ${ev.address ? "· " + escapeHtml(ev.address) : ""}</p>
      <p>${escapeHtml(ev.description)}</p>
      <p class="badge">+${ev.points_reward} баллов за чекин</p>
      <div id="event-actions-${ev.id}" style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn" data-action="register" data-id="${ev.id}">Зарегистрироваться</button>
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
  try {
    await api.post(`/events/${id}/register`);
    eventMsg(id, "Вы зарегистрированы! На месте нажмите «Подтвердить участие».");
  } catch (e) {
    if (e.message.includes("409") || e.message.includes("уже зарегистрированы")) {
      eventMsg(id, "Вы уже зарегистрированы на это мероприятие.", "success");
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
        const result = await api.post(`/events/${id}/checkin`, {
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
