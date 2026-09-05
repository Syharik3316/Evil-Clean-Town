/* Дашборд фонда: KPI из API, встроенное окно Grafana, карта активности
   (Яндекс.Карты) и очередь модерации репортов. */

let adminStats = null;
let adminRange = "now-30d";
let adminRejectHandler = null;
let adminMapCtx = null;

const GRAFANA_BASE = `${location.protocol}//${location.hostname}:${GRAFANA_PORT}/d/${GRAFANA_DASHBOARD_UID}/activity`;

async function initAdminPage() {
  const root = document.getElementById("admin-root");
  requireAuth();
  const user = await currentUser(true);

  if (!user || user.role !== "admin") {
    root.innerHTML = '<div class="alert error">Раздел мониторинга доступен только администраторам фонда.</div>';
    return;
  }

  document.getElementById("reason-cancel").addEventListener("click", () => {
    document.getElementById("reason-modal").hidden = true;
  });
  document.getElementById("reason-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const reason = document.getElementById("reason-text").value.trim();
    document.getElementById("reason-modal").hidden = true;
    if (adminRejectHandler) await adminRejectHandler(reason);
  });

  renderAdminShell();

  try {
    adminStats = await api.get("/admin/stats");
    renderKpis();
    renderRegions();
  } catch (e) {
    document.getElementById("admin-kpis").innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }

  renderGrafana();
  loadAdminQueue();
  loadAdminTickets();
  renderActivityMap();
}

function renderAdminShell() {
  document.getElementById("admin-root").innerHTML = `
    <div class="page-head">
      <div>
        <div class="kicker">Фонд защитников природы · администратор</div>
        <h1>Дашборд фонда</h1>
        <p class="muted" style="font-size:14.5px;margin:0">Вовлечённость по регионам, живая аналитика Grafana и очередь модерации.</p>
      </div>
      <div class="spacer seg" id="admin-periods">
        <button type="button" data-range="now-7d">7 дней</button>
        <button type="button" class="active" data-range="now-30d">30 дней</button>
        <button type="button" data-range="now-90d">90 дней</button>
      </div>
    </div>

    <div class="cells cells-6" id="admin-kpis">${Array.from({ length: 6 }).map(() => '<div><div class="skeleton"></div><div class="skeleton skeleton-line-short"></div></div>').join("")}</div>

    <h2 style="margin:48px 0 6px">Мониторинг в Grafana</h2>
    <p class="muted" style="font-size:13.5px;max-width:64ch;margin:0 0 18px">
      Дашборд «Активность пользователей и данные фонда» подключён напрямую к базе платформы и обновляется каждые 5 минут.
      Период переключается кнопками выше.
    </p>
    <div id="grafana-root"></div>

    <div class="cols cols-side-wide" style="margin-top:48px">
      <div>
        <h2 style="font-size:22px">Активность по регионам и городам</h2>
        <p class="muted" style="font-size:13px;margin:0 0 18px" id="regions-note">Баллы команд и школ, сгруппированные по городам.</p>
        <div id="admin-regions">${skeletonLines(4)}</div>

        <h2 style="font-size:22px;margin-top:44px">География активности</h2>
        <p class="muted" style="font-size:13px;margin:0 0 14px">Участки побережья и ближайшие мероприятия на Яндекс.Карте.</p>
        <div class="ymap" id="admin-map"></div>
      </div>

      <div class="stack">
        <div>
          <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:14px">
            <h2 style="font-size:22px;margin:0">Очередь модерации</h2>
            <span class="tag tag-accent-2" style="margin-left:auto" id="queue-count">—</span>
          </div>
          <div id="admin-queue">${skeletonLines(3)}</div>
        </div>

        <div>
          <div class="micro" style="margin-bottom:12px">Тикеты на модерации</div>
          <div id="admin-tickets">${skeletonLines(2)}</div>
          <a class="btn btn-secondary btn-block" href="/tickets" style="margin-top:12px">Открыть тикеты →</a>
        </div>
      </div>
    </div>`;

  document.querySelectorAll("#admin-periods [data-range]").forEach((btn) =>
    btn.addEventListener("click", () => {
      adminRange = btn.dataset.range;
      document.querySelectorAll("#admin-periods [data-range]").forEach((b) => b.classList.toggle("active", b === btn));
      renderGrafana();
    })
  );
}

/* ------------------------------------------------------------ KPI ------- */

function renderKpis() {
  const s = adminStats;
  // Ровно шесть ячеек: сетка .cells-6 раскладывает их без «осиротевшей» строки.
  const cells = [
    { k: "Пользователей", v: s.users_total, delta: "всего в системе" },
    { k: "Мероприятий", v: s.events_total, delta: "создано организаторами" },
    { k: "Чекинов", v: s.checkins_total, delta: "подтверждённых участий" },
    { k: "Уроков пройдено", v: s.lessons_completed_total, delta: "модулей завершено" },
    {
      k: "Репортов",
      v: s.reports_total,
      delta: `${s.reports_approved} принято · ${s.reports_pending} на модерации`,
      color: s.reports_pending ? "var(--color-accent-2-700)" : "var(--color-accent-700)",
    },
    { k: "Баллов начислено", v: Math.round(s.points_awarded_total), delta: "суммарно у пользователей" },
  ];

  document.getElementById("admin-kpis").innerHTML = cells
    .map(
      (c) => `
      <div>
        <div class="cell-k">${c.k}</div>
        <div class="cell-v">${c.v}</div>
        <div style="font-size:11.5px;color:${c.color || "var(--color-neutral-600)"}">${c.delta}</div>
      </div>`
    )
    .join("");
}

function renderRegions() {
  const rows = adminStats.points_by_city || [];
  document.getElementById("regions-note").textContent =
    `Баллы команд и школ по городам. Всего в рейтинге: ${adminStats.teams_total} команд и школ.`;
  document.getElementById("admin-regions").innerHTML = rows.length
    ? `<table class="table">
        <thead><tr><th>Город</th><th style="text-align:right">Баллы команд</th><th style="text-align:right">Доля</th></tr></thead>
        <tbody>
          ${(() => {
            const total = rows.reduce((sum, r) => sum + r.points, 0) || 1;
            return rows
              .map(
                (r) => `<tr>
                  <td>${escapeHtml(r.city)}</td>
                  <td style="text-align:right;font-family:var(--font-heading);font-weight:600">${Math.round(r.points)}</td>
                  <td style="text-align:right">
                    <span style="display:inline-block;height:8px;width:${Math.max(Math.round((r.points / total) * 90), 2)}px;background:var(--color-accent);vertical-align:middle"></span>
                    <span class="muted" style="font-size:11.5px;margin-left:6px">${Math.round((r.points / total) * 100)} %</span>
                  </td>
                </tr>`
              )
              .join("");
          })()}
        </tbody>
      </table>`
    : '<p class="muted">Пока нет команд с баллами.</p>';
}

/* ---------------------------------------------------------- Grafana ----- */

function renderGrafana() {
  const embedUrl = `${GRAFANA_BASE}?orgId=1&kiosk=tv&refresh=5m&from=${encodeURIComponent(adminRange)}&to=now`;
  const openUrl = `${GRAFANA_BASE}?orgId=1&from=${encodeURIComponent(adminRange)}&to=now`;

  document.getElementById("grafana-root").innerHTML = `
    <div class="grafana-window">
      <div class="grafana-window-bar">
        <span class="dots"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i></span>
        <span class="title">Grafana · Активность пользователей и данные фонда</span>
        <span class="url">${escapeHtml(openUrl)}</span>
        <span class="spacer"></span>
        <a href="${openUrl}" target="_blank" rel="noopener">Открыть в новой вкладке ↗</a>
      </div>
      <div class="grafana-embed">
        <div class="grafana-embed-fallback">
          Если дашборд не появился — проверьте, что контейнер Grafana запущен и порт ${GRAFANA_PORT} доступен с этого хоста.
        </div>
        <iframe src="${embedUrl}" title="Grafana: активность пользователей и данные фонда" loading="lazy" referrerpolicy="no-referrer"></iframe>
      </div>
    </div>`;
}

/* --------------------------------------------------- очередь модерации --- */

async function loadAdminQueue() {
  const el = document.getElementById("admin-queue");
  try {
    const reports = await api.get("/reports?status_filter=pending");
    document.getElementById("queue-count").textContent = reports.length
      ? `${reports.length} в очереди`
      : "очередь пуста";

    el.innerHTML = reports.length
      ? reports
          .slice(0, 6)
          .map(
            (r) => `
        <div class="queue-item" id="admin-report-${r.id}">
          <a href="${r.photo_url}" target="_blank" rel="noopener"><img src="${r.photo_url}" alt="Фото репорта" /></a>
          <div style="flex:1;min-width:0">
            <div style="font-size:13.5px;line-height:1.45;margin-bottom:5px">${escapeHtml(r.description || "Без описания")}</div>
            <div class="muted" style="font-size:11.5px;margin-bottom:10px">${formatDate(r.created_at)} · ${escapeHtml(r.region || "регион не указан")}</div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-primary btn-sm" data-approve>Принять</button>
              <button class="btn btn-secondary btn-sm" data-reject>Отклонить</button>
            </div>
          </div>
        </div>`
          )
          .join("") +
        (reports.length > 6
          ? `<p class="muted" style="font-size:12.5px;margin-top:12px">…и ещё ${reports.length - 6}. <a href="/reports">Вся очередь →</a></p>`
          : "")
      : '<p class="muted" style="border-top:1px solid var(--color-divider);padding:18px 0;font-size:13.5px">Нет репортов на модерации.</p>';

    reports.slice(0, 6).forEach((r) => {
      const card = document.getElementById(`admin-report-${r.id}`);
      card.querySelector("[data-approve]").addEventListener("click", async () => {
        await api.post(`/reports/${r.id}/moderate`, { approve: true });
        toast("Репорт принят", "success");
        loadAdminQueue();
      });
      card.querySelector("[data-reject]").addEventListener("click", () => {
        adminRejectHandler = async (reason) => {
          await api.post(`/reports/${r.id}/moderate`, { approve: false, comment: reason });
          toast("Репорт отклонён", "success");
          loadAdminQueue();
        };
        document.getElementById("reason-text").value = "";
        document.getElementById("reason-modal").hidden = false;
      });
    });
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

async function loadAdminTickets() {
  const el = document.getElementById("admin-tickets");
  try {
    const [events, courses] = await Promise.all([
      api.get("/admin/tickets/events"),
      api.get("/admin/tickets/courses"),
    ]);
    el.innerHTML = `
      <div class="board-line"><span class="name">Мероприятия</span><span class="pts">${events.length}</span></div>
      <div class="board-line"><span class="name">Курсы</span><span class="pts">${courses.length}</span></div>`;
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

/* ------------------------------------------------- карта активности ------ */

async function renderActivityMap() {
  adminMapCtx = await createYandexMap("admin-map", { zoom: 5, controls: ["zoomControl", "fullscreenControl"] });
  if (!adminMapCtx) return;

  const [sites, events] = await Promise.all([
    api.get("/sites").catch(() => []),
    api.get("/events").catch(() => []),
  ]);

  sites.forEach((s) =>
    addYandexPlacemark(adminMapCtx, [s.lat, s.lon], {
      title: s.name,
      body: `Участок побережья · ${escapeHtml(s.region || "")}`,
    })
  );
  events.forEach((ev) =>
    addYandexPlacemark(adminMapCtx, [ev.lat, ev.lon], {
      title: ev.title,
      body: `${formatDate(ev.starts_at)} · ${escapeHtml(ev.address || "")}`,
      color: "#d6006c",
    })
  );

  fitYandexGeoObjects(adminMapCtx, { maxZoom: 12 });
}
