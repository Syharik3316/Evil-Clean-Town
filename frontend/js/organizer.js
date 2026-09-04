let currentRejectHandler = null;

async function initOrganizerPage() {
  requireAuth();
  const root = document.getElementById("organizer-root");

  let events;
  try {
    events = await api.get("/events?mine_only=true");
  } catch (e) {
    root.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
    return;
  }

  if (!events.length) {
    root.innerHTML = '<p class="muted">У вас пока нет мероприятий. Создайте первое на странице «Мероприятия».</p>';
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
  applicantsEl.innerHTML = "Загрузка…";

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
