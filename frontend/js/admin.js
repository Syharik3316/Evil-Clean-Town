async function initAdminPage() {
  requireAuth();
  const root = document.getElementById("admin-root");
  const user = await currentUser(true);

  if (!user || user.role !== "admin") {
    root.innerHTML = '<div class="alert error">Доступно только администраторам.</div>';
    return;
  }

  root.innerHTML = `
    <h1>Статистика фонда</h1>
    <div id="stats-block" class="card">Загрузка статистики…</div>

    <h2>История всех мероприятий</h2>
    <div id="events-history">Загрузка…</div>
  `;

  loadStats();
  loadEventsHistory();
}

async function loadStats() {
  const el = document.getElementById("stats-block");
  try {
    const s = await api.get("/admin/stats");
    el.innerHTML = `
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

const EVENT_STATUS_LABELS = {
  draft: "Черновик",
  pending_review: "На модерации",
  published: "Опубликовано",
  rejected: "Отклонено",
  cancelled: "Отменено",
};

async function loadEventsHistory() {
  const el = document.getElementById("events-history");
  try {
    const events = await api.get("/admin/events");
    if (!events.length) {
      el.innerHTML = '<p class="muted">Мероприятий пока нет.</p>';
      return;
    }
    el.innerHTML = `<table>
      <thead><tr><th>Название</th><th>Тип</th><th>Дата</th><th>Регион</th><th>Статус</th></tr></thead>
      <tbody>${events
        .map(
          (ev) => `<tr>
            <td>${escapeHtml(ev.title)}</td>
            <td>${escapeHtml(ev.event_type)}</td>
            <td>${formatDate(ev.starts_at)}</td>
            <td>${escapeHtml(ev.region || "—")}</td>
            <td>${escapeHtml(EVENT_STATUS_LABELS[ev.status] || ev.status)}</td>
          </tr>`
        )
        .join("")}</tbody>
    </table>`;
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}
