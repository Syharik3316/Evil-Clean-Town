async function initAdminPage() {
  requireAuth();
  const root = document.getElementById("admin-root");
  const user = await currentUser(true);

  if (!user || (user.role !== "organizer" && user.role !== "admin")) {
    root.innerHTML = '<div class="alert error">Доступно только организаторам и администраторам.</div>';
    return;
  }

  const sites = await api.get("/sites").catch(() => []);

  root.innerHTML = `
    <h1>Панель организатора</h1>

    ${user.role === "admin" ? '<div id="stats-block" class="card">Загрузка статистики…</div>' : ""}

    <h2>Создать мероприятие</h2>
    <div class="card">
      <div id="event-form-alert"></div>
      <form id="event-form">
        <div class="field"><label>Название</label><input type="text" id="ev-title" required /></div>
        <div class="field"><label>Описание</label><textarea id="ev-description" rows="3" required></textarea></div>
        <div class="field">
          <label>Тип</label>
          <select id="ev-type">
            <option value="cleanup">Уборка</option>
            <option value="webinar">Вебинар</option>
            <option value="quest">Квест</option>
          </select>
        </div>
        <div class="field">
          <label>Участок берега (необязательно)</label>
          <select id="ev-site"><option value="">—</option>${sites
            .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
            .join("")}</select>
        </div>
        <div class="field"><label>Дата и время начала</label><input type="datetime-local" id="ev-starts" required /></div>
        <div class="field"><label>Адрес</label><input type="text" id="ev-address" /></div>
        <div class="field"><label>Широта</label><input type="number" step="any" id="ev-lat" required /></div>
        <div class="field"><label>Долгота</label><input type="number" step="any" id="ev-lon" required /></div>
        <div class="field"><label>Баллы за участие</label><input type="number" id="ev-points" value="20" /></div>
        <button class="btn" type="submit">Создать</button>
      </form>
    </div>

    <h2>Модерация репортов о мусоре</h2>
    <div id="moderation-queue" class="grid">Загрузка…</div>
  `;

  document.getElementById("event-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("event-form-alert");
    try {
      await api.post("/events", {
        title: document.getElementById("ev-title").value,
        description: document.getElementById("ev-description").value,
        event_type: document.getElementById("ev-type").value,
        site_id: document.getElementById("ev-site").value || null,
        starts_at: new Date(document.getElementById("ev-starts").value).toISOString(),
        address: document.getElementById("ev-address").value || null,
        lat: parseFloat(document.getElementById("ev-lat").value),
        lon: parseFloat(document.getElementById("ev-lon").value),
        points_reward: parseInt(document.getElementById("ev-points").value, 10) || 20,
      });
      alertEl.innerHTML = '<div class="alert success">Мероприятие создано!</div>';
      document.getElementById("event-form").reset();
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });

  loadModerationQueue();
  if (user.role === "admin") loadStats();
}

async function loadModerationQueue() {
  const el = document.getElementById("moderation-queue");
  try {
    const reports = await api.get("/reports?status_filter=pending");
    if (!reports.length) {
      el.innerHTML = '<p class="muted">Нет репортов на модерации.</p>';
      return;
    }
    el.innerHTML = reports
      .map(
        (r) => `
        <div class="card" id="mod-${r.id}">
          <img src="${r.photo_url}" style="width:100%;border-radius:8px;margin-bottom:8px" />
          <p>${escapeHtml(r.description || "Без описания")}</p>
          <p class="muted">${formatDate(r.created_at)} · координаты ${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}</p>
          <div style="display:flex; gap:8px">
            <button class="btn" data-approve="${r.id}">Принять</button>
            <button class="btn danger" data-reject="${r.id}">Отклонить</button>
          </div>
        </div>`
      )
      .join("");

    el.querySelectorAll("[data-approve]").forEach((btn) =>
      btn.addEventListener("click", () => moderate(btn.dataset.approve, true))
    );
    el.querySelectorAll("[data-reject]").forEach((btn) =>
      btn.addEventListener("click", () => moderate(btn.dataset.reject, false))
    );
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

async function moderate(reportId, approve) {
  try {
    await api.post(`/reports/${reportId}/moderate`, { approve });
    document.getElementById(`mod-${reportId}`).remove();
  } catch (e) {
    alert(e.message);
  }
}

async function loadStats() {
  const el = document.getElementById("stats-block");
  try {
    const s = await api.get("/admin/stats");
    el.innerHTML = `
      <h2 style="margin-top:0">Статистика фонда</h2>
      <div class="grid">
        <div><p class="muted">Пользователей</p><strong>${s.users_total}</strong></div>
        <div><p class="muted">Команд/школ</p><strong>${s.teams_total}</strong></div>
        <div><p class="muted">Мероприятий</p><strong>${s.events_total}</strong></div>
        <div><p class="muted">Чекинов на мероприятиях</p><strong>${s.checkins_total}</strong></div>
        <div><p class="muted">Пройдено уроков</p><strong>${s.lessons_completed_total}</strong></div>
        <div><p class="muted">Репортов всего / на модерации / принято</p><strong>${s.reports_total} / ${s.reports_pending} / ${s.reports_approved}</strong></div>
        <div><p class="muted">Начислено баллов всего</p><strong>${Math.round(s.points_awarded_total)}</strong></div>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}
