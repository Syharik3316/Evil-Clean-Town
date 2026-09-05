/* Главная страница: живые данные из API поверх статичной вёрстки лендинга. */

const LANDING_EVENT_ICONS = {
  cleanup: "ph-duotone ph-broom",
  webinar: "ph-duotone ph-laptop",
  quest: "ph-duotone ph-map-trifold",
};
const LANDING_EVENT_TYPES = { cleanup: "Уборка", webinar: "Вебинар", quest: "Квест" };

/* Демонстрационные индексы ДЗЗ: бэкенд отдаёт снимки, но не считает NDVI/мутность.
   Привязаны к порядку участков, чтобы карточки не выглядели пустыми. */
const DEMO_SITE_INDEXES = [
  [{ k: "NDVI", v: "+0.31", c: "var(--color-accent-700)" }, { k: "Мутность", v: "−12 %", c: "var(--color-accent-700)" }, { k: "Мусор", v: "610 кг", c: "var(--color-text)" }],
  [{ k: "NDVI", v: "+0.07", c: "var(--color-accent-700)" }, { k: "Мутность", v: "+5 %", c: "var(--color-accent-2-700)" }, { k: "Мусор", v: "430 кг", c: "var(--color-text)" }],
  [{ k: "NDVI", v: "+0.44", c: "var(--color-accent-700)" }, { k: "Мутность", v: "−21 %", c: "var(--color-accent-700)" }, { k: "Мусор", v: "300 кг", c: "var(--color-text)" }],
];

async function initLandingPage() {
  document.getElementById("tm-shot").textContent = new Date().toLocaleDateString("ru-RU");

  renderGreetingStrip();
  loadLandingSites();
  loadLandingLessons();
  loadLandingEvents();
  loadLandingBoard();
}

async function loadLandingSites() {
  const root = document.getElementById("landing-sites");
  root.innerHTML = `<div>${skeletonLines(6)}</div><div>${skeletonLines(6)}</div><div>${skeletonLines(6)}</div>`;
  try {
    const sites = await api.get("/sites");
    if (!sites.length) {
      root.innerHTML = '<p class="muted">Участки побережья пока не заведены.</p>';
      return;
    }

    const details = await Promise.all(
      sites.slice(0, 3).map((s) => api.get(`/sites/${s.id}`).catch(() => ({ ...s, layers: [] })))
    );

    root.innerHTML = details
      .map((site, i) => {
        const layers = site.layers || [];
        const cover = layers.length ? layers[layers.length - 1] : null;
        const idx = DEMO_SITE_INDEXES[i % DEMO_SITE_INDEXES.length];
        return `
          <div class="site-card">
            <figure>
              ${cover
                ? `<img class="site-thumb" src="${escapeHtml(cover.image_url)}" alt="Снимок участка «${escapeHtml(site.name)}»" loading="lazy" />`
                : '<div class="site-thumb" style="display:grid;place-items:center;color:var(--color-neutral-600);font-size:13px">Снимок ещё не загружен</div>'}
            </figure>
            <div style="display:flex;align-items:baseline;gap:10px;margin-top:14px">
              <span class="tag tag-accent">${escapeHtml(site.region || "Побережье")}</span>
              <span class="muted" style="font-size:11.5px;margin-left:auto">${site.lat.toFixed(4)}, ${site.lon.toFixed(4)}</span>
            </div>
            <div style="font-family:var(--font-heading);font-weight:600;font-size:21px;line-height:1.2;margin:10px 0 6px">${escapeHtml(site.name)}</div>
            <p class="muted" style="font-size:13.5px;line-height:1.5;margin:0 0 14px">${escapeHtml(site.description || "Участок побережья под спутниковым наблюдением.")}</p>
            <div class="site-idx">
              ${idx.map((m) => `<div><div class="k">${m.k}</div><div class="v" style="color:${m.c}">${m.v}</div></div>`).join("")}
            </div>
            <div style="margin-top:14px"><a class="btn btn-secondary btn-sm" href="/map?site=${site.id}">Смотреть «до/после» →</a></div>
          </div>`;
      })
      .join("");

    updateBigNum(0, String(sites.length));
  } catch (e) {
    root.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

async function loadLandingLessons() {
  const root = document.getElementById("landing-lessons");
  root.innerHTML = skeletonLines(4);
  try {
    const lessons = await api.get("/lessons");
    root.innerHTML = lessons.length
      ? lessons
          .slice(0, 5)
          .map(
            (l, i) => `
            <a class="lesson-row" href="/lessons?id=${l.id}" style="text-decoration:none;color:inherit">
              <div class="n">${String(i + 1).padStart(2, "0")}</div>
              <div style="flex:1">
                <div style="font-family:var(--font-heading);font-weight:600;font-size:18px;line-height:1.22">${escapeHtml(l.title)}</div>
                <p class="muted" style="font-size:13.5px;line-height:1.5;margin:5px 0 0">${escapeHtml(l.summary)}</p>
              </div>
              <span class="tag tag-outline" style="flex:none;align-self:flex-start">+${l.points_reward} б.</span>
            </a>`
          )
          .join("")
      : '<p class="muted">Опубликованных курсов пока нет.</p>';
  } catch (e) {
    root.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

async function loadLandingEvents() {
  const root = document.getElementById("landing-events");
  root.innerHTML = `<div>${skeletonLines(4)}</div><div>${skeletonLines(4)}</div><div>${skeletonLines(4)}</div>`;
  try {
    const events = await api.get("/events");
    if (!events.length) {
      root.innerHTML = '<div><p class="muted">Ближайших мероприятий пока нет — загляните позже.</p></div>';
      return;
    }
    root.innerHTML = events
      .slice(0, 3)
      .map(
        (ev) => `
        <a class="event-cell" href="/event?id=${ev.id}">
          <div style="display:flex;align-items:center;gap:9px">
            <i class="${LANDING_EVENT_ICONS[ev.event_type] || "ph-duotone ph-calendar-dots"}" style="font-size:20px;color:var(--color-accent)"></i>
            <span class="micro">${LANDING_EVENT_TYPES[ev.event_type] || ev.event_type}</span>
            <span class="tag tag-accent-2" style="margin-left:auto">+${ev.points_reward} б.</span>
          </div>
          <div style="font-family:var(--font-heading);font-weight:600;font-size:20px;line-height:1.2">${escapeHtml(ev.title)}</div>
          <div class="muted" style="font-size:12.5px">${formatDate(ev.starts_at)}${ev.address ? " · " + escapeHtml(ev.address) : ""}</div>
          <p class="muted" style="font-size:13.5px;line-height:1.5;margin:0;flex:1">${escapeHtml(ev.description)}</p>
          <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-accent-700)"><i class="ph-duotone ph-map-pin-area" style="font-size:16px"></i>Гео-чекин на месте проведения</div>
        </a>`
      )
      .join("");
  } catch (e) {
    root.innerHTML = `<div><div class="alert error">${escapeHtml(e.message)}</div></div>`;
  }
}

async function loadLandingBoard() {
  const root = document.getElementById("landing-board");
  try {
    const rows = await api.get("/leaderboard?scope=teams&limit=5");
    const list = rows.length ? rows : await api.get("/leaderboard?scope=users&limit=5");
    root.innerHTML = list.length
      ? list
          .map(
            (r, i) => `
            <div class="board-row">
              <span class="rank">${String(i + 1).padStart(2, "0")}</span>
              <span class="name">${escapeHtml(r.name)}</span>
              <span class="city">${escapeHtml(r.city || r.region || "")}</span>
              <span class="pts">${Math.round(r.points_total)}</span>
            </div>`
          )
          .join("")
      : '<p style="color:rgba(243,242,242,.6);font-size:13.5px">Рейтинг пока пуст — стань первым!</p>';

    // limit=100 — верхняя граница запроса, поэтому ровно сотню показываем как «100+».
    const users = await api.get("/leaderboard?scope=users&limit=100").catch(() => []);
    if (users.length) updateBigNum(2, users.length >= 100 ? "100+" : String(users.length));
  } catch (e) {
    root.innerHTML = '<p style="color:rgba(243,242,242,.6);font-size:13.5px">Не удалось загрузить лидерборд.</p>';
  }
}

function updateBigNum(index, value) {
  const cell = document.querySelectorAll("#landing-stats .bignum-v")[index];
  if (cell) cell.textContent = value;
}

async function renderGreetingStrip() {
  const root = document.getElementById("greeting-strip-root");
  if (!isLoggedIn()) return;
  const user = await currentUser();
  if (!user) return;

  const shell = (text, href, label) => `
    <section class="section" style="padding-top:44px;padding-bottom:0">
      <div class="note" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <p style="margin:0;flex:1;min-width:240px">${text}</p>
        <a class="btn btn-secondary btn-sm" href="${href}">${label}</a>
      </div>
    </section>`;

  try {
    if (user.role === "volunteer") {
      root.innerHTML = shell(
        `Привет, <strong>${escapeHtml(user.display_name)}</strong>! Серия участия: ${user.current_streak} дн. · <strong>${Math.round(user.points_total)}</strong> баллов`,
        "/profile",
        "Мой профиль"
      );
    } else if (user.role === "organizer") {
      const events = await api.get("/events?mine_only=true");
      let pending = 0;
      for (const ev of events.slice(0, 20)) {
        try {
          const applicants = await api.get(`/events/${ev.id}/applicants`);
          pending += applicants.filter((a) => a.status === "pending").length;
        } catch (e) {
          /* пропускаем недоступное мероприятие */
        }
      }
      root.innerHTML = shell(
        `Привет, <strong>${escapeHtml(user.display_name)}</strong>! У вас ${events.length} мероприятий, ${pending} заявок ждут решения`,
        "/organizer",
        "Мои мероприятия"
      );
    } else if (user.role === "admin") {
      const [eventsTickets, courseTickets, pendingReports] = await Promise.all([
        api.get("/admin/tickets/events"),
        api.get("/admin/tickets/courses"),
        api.get("/reports?status_filter=pending"),
      ]);
      root.innerHTML = shell(
        `Привет, <strong>${escapeHtml(user.display_name)}</strong>! На модерации: ${eventsTickets.length} мероприятий · ${courseTickets.length} курсов · ${pendingReports.length} репортов`,
        "/tickets",
        "Тикеты"
      );
    }
  } catch (e) {
    /* плашка необязательна для главной страницы */
  }
}
