/* Модерация мероприятий и курсов администратором фонда. */

let activeTicketTab = "events";
let currentReasonHandler = null;
let currentEditHandler = null;
let editModalMode = "event";
let ticketsMapCtx = null;

const TICKET_EVENT_TYPES = { cleanup: "Уборка", webinar: "Вебинар", quest: "Квест" };

async function initTicketsPage() {
  requireAuth();
  const user = await currentUser(true);
  if (!user || user.role !== "admin") {
    document.getElementById("ticket-root").innerHTML =
      '<div class="alert error">Модерация доступна только администраторам фонда.</div>';
    return;
  }

  document.querySelectorAll("#ticket-tabs [data-tab]").forEach((btn) => {
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
  document.querySelectorAll("#ticket-tabs [data-tab]").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.tab === tab)
  );
  if (tab === "events") loadEventsTab();
  else loadCoursesTab();
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

/* ------------------------------------------------------- мероприятия ---- */

function loadEventsTab() {
  document.getElementById("ticket-root").innerHTML = `
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:18px">
      <span class="micro">Сортировка</span>
      <div class="seg" id="events-sort">
        <button type="button" class="active" data-sort="created_at">По дате создания</button>
        <button type="button" data-sort="region">По региону</button>
        <button type="button" data-sort="organization">По организации</button>
      </div>
      <span class="muted" style="font-size:12.5px;margin-left:auto" id="events-count"></span>
    </div>
    <div id="events-list">${skeletonLines(4)}</div>`;

  document.querySelectorAll("#events-sort [data-sort]").forEach((btn) =>
    btn.addEventListener("click", () => {
      document.querySelectorAll("#events-sort [data-sort]").forEach((b) => b.classList.toggle("active", b === btn));
      loadEventsList(btn.dataset.sort);
    })
  );

  loadEventsList("created_at");
}

async function loadEventsList(sortBy) {
  const el = document.getElementById("events-list");
  try {
    const events = await api.get(`/admin/tickets/events?sort_by=${sortBy}`);
    document.getElementById("events-count").textContent = events.length
      ? `${events.length} на модерации`
      : "очередь пуста";

    el.innerHTML = events.length
      ? events.map(eventTicketCard).join("")
      : '<p class="muted" style="border-top:1px solid var(--color-divider);padding-top:20px">Нет мероприятий на модерации.</p>';

    events.forEach(bindEventTicketCard);
    renderTicketsMap(events);
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

function eventTicketCard(ev) {
  return `
    <div style="border-top:1px solid var(--color-divider);padding:22px 0" id="event-ticket-${ev.id}">
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:7px;flex-wrap:wrap">
        <span class="micro">${TICKET_EVENT_TYPES[ev.event_type] || ev.event_type}</span>
        <span class="tag tag-accent-2">+${ev.points_reward} б.</span>
        ${ev.site_id ? '<span class="tag tag-accent">участок ДЗЗ привязан</span>' : '<span class="tag tag-neutral">без участка</span>'}
      </div>
      <h3 style="font-size:20px;margin:0 0 6px">${escapeHtml(ev.title)}</h3>
      <p class="muted" style="font-size:14px;line-height:1.55;margin:0 0 10px;max-width:62ch">${escapeHtml(ev.description)}</p>
      <div class="event-meta" style="margin-bottom:14px">
        <span><i class="ph-duotone ph-calendar-dots" style="font-size:15px"></i>${formatDate(ev.starts_at)}</span>
        <span><i class="ph-duotone ph-map-pin" style="font-size:15px"></i>${escapeHtml(ev.address || ev.region || "адрес не указан")}</span>
        <span><i class="ph-duotone ph-crosshair-simple" style="font-size:15px"></i>${ev.lat.toFixed(4)}, ${ev.lon.toFixed(4)}</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" data-approve>Принять</button>
        <button class="btn btn-secondary btn-sm" data-edit>Редактировать и принять</button>
        <button class="btn btn-secondary btn-sm" data-reject>Отклонить</button>
        <button class="btn btn-ghost btn-sm" data-locate>Показать на карте</button>
      </div>
    </div>`;
}

function bindEventTicketCard(ev) {
  const row = document.getElementById(`event-ticket-${ev.id}`);
  const sortBy = () => document.querySelector("#events-sort .active").dataset.sort;

  row.querySelector("[data-approve]").addEventListener("click", async () => {
    await api.post(`/admin/tickets/events/${ev.id}/approve`);
    toast("Мероприятие опубликовано", "success");
    loadEventsList(sortBy());
  });
  row.querySelector("[data-reject]").addEventListener("click", () => {
    openReasonModal(async (reason) => {
      await api.post(`/admin/tickets/events/${ev.id}/reject`, { reason });
      loadEventsList(sortBy());
    });
  });
  row.querySelector("[data-edit]").addEventListener("click", () => {
    openEditModal(
      ev,
      async (payload) => {
        await api.post(`/admin/tickets/events/${ev.id}/edit-approve`, payload);
        loadEventsList(sortBy());
      },
      "event"
    );
  });
  row.querySelector("[data-locate]").addEventListener("click", () => {
    if (ticketsMapCtx) {
      ticketsMapCtx.map.setCenter([ev.lat, ev.lon], 15);
      document.getElementById("tickets-map").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

async function renderTicketsMap(events) {
  if (!ticketsMapCtx) {
    ticketsMapCtx = await createYandexMap("tickets-map", { zoom: 5, controls: ["zoomControl", "fullscreenControl"] });
  }
  if (!ticketsMapCtx) return;

  ticketsMapCtx.map.geoObjects.removeAll();
  if (!events.length) return;

  events.forEach((ev) =>
    addYandexPlacemark(ticketsMapCtx, [ev.lat, ev.lon], {
      title: ev.title,
      body: `${formatDate(ev.starts_at)} · ${escapeHtml(ev.address || "")}`,
    })
  );

  fitYandexGeoObjects(ticketsMapCtx, { maxZoom: 13 });
}

/* ------------------------------------------------------------- курсы ---- */

function loadCoursesTab() {
  document.getElementById("ticket-root").innerHTML = `<div id="courses-list">${skeletonLines(3)}</div>`;
  loadCoursesList();
}

async function loadCoursesList() {
  const el = document.getElementById("courses-list");
  try {
    const courses = await api.get("/admin/tickets/courses");
    el.innerHTML = courses.length
      ? `<table class="table">
          <thead><tr><th>Курс</th><th>Краткое описание</th><th style="text-align:right">Баллы</th><th style="width:290px">Действия</th></tr></thead>
          <tbody>${courses.map(courseTicketRow).join("")}</tbody>
        </table>`
      : '<p class="muted" style="border-top:1px solid var(--color-divider);padding-top:20px">Нет курсов на модерации.</p>';
    courses.forEach(bindCourseTicketRow);
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

function courseTicketRow(c) {
  return `<tr id="course-ticket-${c.id}">
    <td><a href="/lessons?id=${c.id}" target="_blank" rel="noopener">${escapeHtml(c.title)}</a></td>
    <td class="muted">${escapeHtml(c.summary)}</td>
    <td style="text-align:right;font-family:var(--font-heading);font-weight:600">${c.points_reward}</td>
    <td>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" data-approve>Принять</button>
        <button class="btn btn-secondary btn-sm" data-edit>Изменить</button>
        <button class="btn btn-secondary btn-sm" data-reject>Отклонить</button>
      </div>
    </td>
  </tr>`;
}

function bindCourseTicketRow(c) {
  const row = document.getElementById(`course-ticket-${c.id}`);
  row.querySelector("[data-approve]").addEventListener("click", async () => {
    await api.post(`/admin/tickets/courses/${c.id}/approve`);
    toast("Курс опубликован", "success");
    loadCoursesList();
  });
  row.querySelector("[data-reject]").addEventListener("click", () => {
    openReasonModal(async (reason) => {
      await api.post(`/admin/tickets/courses/${c.id}/reject`, { reason });
      loadCoursesList();
    });
  });
  row.querySelector("[data-edit]").addEventListener("click", async () => {
    const full = await api.get(`/lessons/${c.id}`);
    openEditModal(
      full,
      async (payload) => {
        await api.post(`/admin/tickets/courses/${c.id}/edit-approve`, payload);
        loadCoursesList();
      },
      "course"
    );
  });
}
