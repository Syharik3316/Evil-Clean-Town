/* Календарь мероприятий. Карточка ведёт на страницу мероприятия (/event?id=…),
   где есть подробности, Яндекс.Карта с меткой и гео-чекин. */

const EVENT_TYPE_LABELS = { cleanup: "Уборка", webinar: "Вебинар", quest: "Квест" };
const EVENT_TYPE_ICONS = {
  cleanup: "ph-duotone ph-broom",
  webinar: "ph-duotone ph-laptop",
  quest: "ph-duotone ph-map-trifold",
};
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

let allEvents = [];
let eventsFilter = "all";
let eventsUser = null;

async function initEventsPage() {
  document.querySelectorAll("#event-filters [data-filter]").forEach((btn) =>
    btn.addEventListener("click", () => {
      eventsFilter = btn.dataset.filter;
      document
        .querySelectorAll("#event-filters [data-filter]")
        .forEach((b) => b.classList.toggle("active", b === btn));
      renderEventRows();
    })
  );

  const root = document.getElementById("events-root");
  root.innerHTML = skeletonLines(8);

  eventsUser = isLoggedIn() ? await currentUser() : null;

  try {
    allEvents = await api.get("/events");
  } catch (e) {
    root.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
    return;
  }

  renderEventRows();
  renderMyRegistrations();
}

function renderEventRows() {
  const root = document.getElementById("events-root");
  const list = eventsFilter === "all" ? allEvents : allEvents.filter((e) => e.event_type === eventsFilter);

  document.getElementById("events-count").textContent = list.length
    ? `${list.length} ${plural(list.length, "мероприятие", "мероприятия", "мероприятий")}`
    : "";

  if (!list.length) {
    root.innerHTML = '<p class="muted" style="border-top:1px solid var(--color-divider);padding-top:24px">По этому фильтру мероприятий пока нет.</p>';
    return;
  }

  root.innerHTML = list.map(eventRowHtml).join("");
}

function eventRowHtml(ev) {
  const d = new Date(ev.starts_at);
  const closed = !!ev.applications_closed_at;
  const canRegister = !eventsUser || eventsUser.role === "volunteer";

  return `
    <div class="event-row">
      <div class="event-date">
        <div class="d">${String(d.getDate()).padStart(2, "0")}</div>
        <div class="m">${MONTHS_SHORT[d.getMonth()]}</div>
        <div class="t">${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</div>
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:7px;flex-wrap:wrap">
          <i class="${EVENT_TYPE_ICONS[ev.event_type] || "ph-duotone ph-calendar-dots"}" style="font-size:19px;color:var(--color-accent)"></i>
          <span class="micro">${EVENT_TYPE_LABELS[ev.event_type] || ev.event_type}</span>
          <span class="tag tag-accent-2">+${ev.points_reward} б. за чекин</span>
          ${closed ? '<span class="tag tag-neutral">Набор закрыт</span>' : ""}
        </div>
        <h3 style="font-size:23px;margin:0 0 6px"><a class="event-title-link" href="/event?id=${ev.id}">${escapeHtml(ev.title)}</a></h3>
        <p class="muted" style="font-size:14.5px;line-height:1.55;margin:0 0 10px;max-width:60ch">${escapeHtml(ev.description)}</p>
        <div class="event-meta">
          <span><i class="ph-duotone ph-map-pin" style="font-size:15px"></i>${escapeHtml(ev.address || ev.region || "Место уточняется")}</span>
          <span><i class="ph-duotone ph-users-three" style="font-size:15px"></i>${ev.capacity ? `до ${ev.capacity} участников` : "без лимита мест"}</span>
          <span><i class="ph-duotone ph-crosshair-simple" style="font-size:15px"></i>${ev.lat.toFixed(4)}, ${ev.lon.toFixed(4)}</span>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
          <a class="btn btn-primary" href="/event?id=${ev.id}">Открыть мероприятие</a>
          ${canRegister ? `<a class="btn btn-secondary" href="/event?id=${ev.id}#checkin">Подтвердить участие (гео-чекин)</a>` : ""}
        </div>
      </div>
    </div>`;
}

async function renderMyRegistrations() {
  const root = document.getElementById("my-registrations");
  if (!eventsUser) return;

  if (eventsUser.role !== "volunteer") {
    root.innerHTML = `
      <div class="micro" style="margin-bottom:10px">${eventsUser.role === "organizer" ? "Организатору" : "Администратору"}</div>
      <p style="font-size:12.5px;margin:0 0 14px">Управление мероприятиями и заявками — в отдельном разделе.</p>
      <a class="btn btn-primary btn-block" href="${eventsUser.role === "organizer" ? "/organizer" : "/tickets"}">Перейти</a>`;
    return;
  }

  // Отдельного «списка моих заявок» в API нет, поэтому спрашиваем по мероприятию,
  // но параллельно и только по ближайшим — иначе на длинном календаре это десятки
  // последовательных запросов ради боковой врезки.
  const checked = await Promise.all(
    allEvents.slice(0, 10).map((ev) =>
      api
        .get(`/events/${ev.id}/my-registration`)
        .then((reg) => (reg ? { ev, reg } : null))
        .catch(() => null)
    )
  );
  const mine = checked.filter(Boolean);

  const statusLabels = {
    pending: "на рассмотрении",
    approved: "заявка одобрена",
    rejected: "заявка отклонена",
    checked_in: "участие подтверждено",
    cancelled: "отменена",
  };

  root.innerHTML = `
    <div class="micro" style="margin-bottom:10px">Мои регистрации</div>
    ${
      mine.length
        ? mine
            .map(
              ({ ev, reg }) => `
        <div style="margin-bottom:14px">
          <a href="/event?id=${ev.id}" style="font-family:var(--font-heading);font-weight:600;font-size:15px;color:#f3f2f2;text-decoration:none">${escapeHtml(ev.title)}</a>
          <div style="font-size:12.5px;color:rgba(243,242,242,.7)">${formatDate(ev.starts_at)} · ${statusLabels[reg.status] || reg.status}</div>
        </div>`
            )
            .join("")
        : '<p style="font-size:12.5px;margin:0 0 14px">Заявок пока нет — выберите мероприятие слева.</p>'
    }
    <div style="height:1px;background:rgba(243,242,242,.16);margin-bottom:14px"></div>
    <div style="font-size:12.5px;color:rgba(243,242,242,.7)">Баллов в профиле: ${Math.round(eventsUser.points_total)} · серия участия: ${eventsUser.current_streak} дн.</div>`;
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
