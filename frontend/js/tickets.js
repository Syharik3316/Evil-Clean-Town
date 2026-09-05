let activeTicketTab = "events";
let currentReasonHandler = null;
let currentEditHandler = null;
let editModalMode = "event";

async function initTicketsPage() {
  requireAuth();
  const user = await currentUser(true);
  if (!user || user.role !== "admin") {
    document.getElementById("ticket-root").innerHTML = '<div class="alert error">Доступно только администраторам.</div>';
    return;
  }

  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.getElementById("reason-cancel").addEventListener("click", () => {
    document.getElementById("reason-modal").hidden = true;
  });
  document.getElementById("reason-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const reason = document.getElementById("reason-text").value.trim();
    document.getElementById("reason-modal").hidden = true;
    if (currentReasonHandler) await currentReasonHandler(reason);
  });

  document.getElementById("edit-event-cancel").addEventListener("click", () => {
    document.getElementById("edit-event-modal").hidden = true;
  });
  document.getElementById("edit-event-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = { title: document.getElementById("edit-title").value.trim() };
    if (editModalMode === "event") {
      payload.description = document.getElementById("edit-description").value.trim();
      payload.address = document.getElementById("edit-address").value.trim() || null;
      payload.region = document.getElementById("edit-region").value.trim() || null;
    } else {
      payload.summary = document.getElementById("edit-description").value.trim();
    }
    document.getElementById("edit-event-modal").hidden = true;
    if (currentEditHandler) await currentEditHandler(payload);
  });

  switchTab("events");
}

function switchTab(tab) {
  activeTicketTab = tab;
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.classList.toggle("secondary", btn.dataset.tab !== tab);
  });
  if (tab === "events") loadEventsTab();
  else if (tab === "courses") loadCoursesTab();
  else loadOrganizationsTab();
}

function openReasonModal(handler) {
  currentReasonHandler = handler;
  document.getElementById("reason-text").value = "";
  document.getElementById("reason-modal").hidden = false;
}

function openEditModal(item, handler, mode = "event") {
  editModalMode = mode;
  currentEditHandler = handler;
  document.getElementById("edit-title").value = item.title;
  document.getElementById("edit-description").value = mode === "event" ? item.description : item.summary;
  document.getElementById("edit-address").value = item.address || "";
  document.getElementById("edit-region").value = item.region || "";
  document.getElementById("edit-address-field").hidden = mode !== "event";
  document.getElementById("edit-region-field").hidden = mode !== "event";
  document.getElementById("edit-event-modal").hidden = false;
}

async function loadEventsTab() {
  const root = document.getElementById("ticket-root");
  root.innerHTML = `
    <div class="field" style="max-width:260px">
      <label for="events-sort">Сортировка</label>
      <select id="events-sort">
        <option value="created_at">По дате создания</option>
        <option value="region">По региону</option>
        <option value="organization">По организации</option>
      </select>
    </div>
    <div id="events-table">${skeletonLines(3)}</div>
  `;
  document.getElementById("events-sort").addEventListener("change", loadEventsTable);
  loadEventsTable();
}

async function loadEventsTable() {
  const el = document.getElementById("events-table");
  const sortBy = document.getElementById("events-sort").value;
  try {
    const events = await api.get(`/admin/tickets/events?sort_by=${sortBy}`);
    if (!events.length) {
      el.innerHTML = '<p class="muted">Нет мероприятий на модерации.</p>';
      return;
    }
    el.innerHTML = `<table>
      <thead><tr><th>Название</th><th>Тип</th><th>Дата</th><th>Регион</th><th>Действия</th></tr></thead>
      <tbody>${events.map(eventTicketRow).join("")}</tbody>
    </table>`;
    events.forEach(bindEventTicketRow);
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

function eventTicketRow(ev) {
  return `<tr id="event-ticket-${ev.id}">
    <td>${escapeHtml(ev.title)}</td>
    <td>${escapeHtml(ev.event_type)}</td>
    <td>${formatDate(ev.starts_at)}</td>
    <td>${escapeHtml(ev.region || "—")}</td>
    <td style="display:flex; gap:6px; flex-wrap:wrap">
      <button class="btn" data-approve>Принять</button>
      <button class="btn secondary" data-edit>Редактировать и принять</button>
      <button class="btn danger" data-reject>Отклонить</button>
    </td>
  </tr>`;
}

function bindEventTicketRow(ev) {
  const row = document.getElementById(`event-ticket-${ev.id}`);
  row.querySelector("[data-approve]").addEventListener("click", async () => {
    await api.post(`/admin/tickets/events/${ev.id}/approve`);
    loadEventsTable();
  });
  row.querySelector("[data-reject]").addEventListener("click", () => {
    openReasonModal(async (reason) => {
      await api.post(`/admin/tickets/events/${ev.id}/reject`, { reason });
      loadEventsTable();
    });
  });
  row.querySelector("[data-edit]").addEventListener("click", () => {
    openEditModal(ev, async (payload) => {
      await api.post(`/admin/tickets/events/${ev.id}/edit-approve`, payload);
      loadEventsTable();
    }, "event");
  });
}

async function loadCoursesTab() {
  const root = document.getElementById("ticket-root");
  root.innerHTML = `<div id="courses-table">${skeletonLines(3)}</div>`;
  loadCoursesTable();
}

async function loadCoursesTable() {
  const el = document.getElementById("courses-table");
  try {
    const courses = await api.get("/admin/tickets/courses");
    if (!courses.length) {
      el.innerHTML = '<p class="muted">Нет курсов на модерации.</p>';
      return;
    }
    el.innerHTML = `<table>
      <thead><tr><th>Название</th><th>Баллы</th><th>Действия</th></tr></thead>
      <tbody>${courses.map(courseTicketRow).join("")}</tbody>
    </table>`;
    courses.forEach(bindCourseTicketRow);
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

function courseTicketRow(c) {
  return `<tr id="course-ticket-${c.id}">
    <td><a href="/lessons?id=${c.id}" target="_blank">${escapeHtml(c.title)}</a></td>
    <td>${c.points_reward}</td>
    <td style="display:flex; gap:6px; flex-wrap:wrap">
      <button class="btn" data-approve>Принять</button>
      <button class="btn secondary" data-edit>Редактировать и принять</button>
      <button class="btn danger" data-reject>Отклонить</button>
    </td>
  </tr>`;
}

function bindCourseTicketRow(c) {
  const row = document.getElementById(`course-ticket-${c.id}`);
  row.querySelector("[data-approve]").addEventListener("click", async () => {
    await api.post(`/admin/tickets/courses/${c.id}/approve`);
    loadCoursesTable();
  });
  row.querySelector("[data-reject]").addEventListener("click", () => {
    openReasonModal(async (reason) => {
      await api.post(`/admin/tickets/courses/${c.id}/reject`, { reason });
      loadCoursesTable();
    });
  });
  row.querySelector("[data-edit]").addEventListener("click", async () => {
    const full = await api.get(`/lessons/${c.id}`);
    openEditModal(full, async (payload) => {
      await api.post(`/admin/tickets/courses/${c.id}/edit-approve`, payload);
      loadCoursesTable();
    }, "course");
  });
}

async function loadOrganizationsTab() {
  const root = document.getElementById("ticket-root");
  root.innerHTML = `<div id="organizations-table">${skeletonLines(3)}</div>`;
  loadOrganizationsTable();
}

async function loadOrganizationsTable() {
  const el = document.getElementById("organizations-table");
  try {
    const orgs = await api.get("/admin/tickets/organizations?status=pending");
    if (!orgs.length) {
      el.innerHTML = '<p class="muted">Нет организаций, ожидающих подтверждения.</p>';
      return;
    }
    el.innerHTML = `<table>
      <thead><tr><th>Название</th><th>ИНН</th><th>Тип</th><th>Контактная почта</th><th>Действия</th></tr></thead>
      <tbody>${orgs.map(organizationTicketRow).join("")}</tbody>
    </table>`;
    orgs.forEach(bindOrganizationTicketRow);
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

function organizationTicketRow(o) {
  return `<tr id="org-ticket-${o.id}">
    <td>${escapeHtml(o.name)}</td>
    <td>${escapeHtml(o.inn)}</td>
    <td>${o.legal_type === "legal_entity" ? "Юр. лицо" : "ИП"}</td>
    <td>${escapeHtml(o.contact_email)}</td>
    <td style="display:flex; gap:6px; flex-wrap:wrap">
      <button class="btn" data-approve>Подтвердить</button>
      <button class="btn danger" data-reject>Отклонить</button>
    </td>
  </tr>`;
}

function bindOrganizationTicketRow(o) {
  const row = document.getElementById(`org-ticket-${o.id}`);
  row.querySelector("[data-approve]").addEventListener("click", async () => {
    await api.post(`/admin/tickets/organizations/${o.id}/approve`);
    loadOrganizationsTable();
  });
  row.querySelector("[data-reject]").addEventListener("click", () => {
    openReasonModal(async (reason) => {
      await api.post(`/admin/tickets/organizations/${o.id}/reject`, { reason });
      loadOrganizationsTable();
    });
  });
}
