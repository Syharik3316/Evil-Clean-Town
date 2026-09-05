/* Дашборд фонда: KPI из API, встроенное окно Grafana, карта активности
   (Яндекс.Карты), очередь модерации репортов и управление ачивками. */

let adminStats = null;
let adminRange = "now-30d";
let adminRejectHandler = null;
let adminMapCtx = null;

const GRAFANA_BASE = `${location.protocol}//${location.hostname}:${GRAFANA_PORT}/d/${GRAFANA_DASHBOARD_UID}/activity`;

const CRITERIA_LABELS = {
  lessons_completed: "Пройдено уроков",
  events_attended: "Посещено мероприятий",
  reports_approved: "Принято репортов",
  points_threshold: "Набрано баллов",
  seasonal_events_attended: "Уборок за сезон",
};

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
  renderAchievementForm();
  loadAchievementsAdmin();
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
    </div>

    <h2 style="margin-top:56px;font-size:22px">Ачивки</h2>
    <p class="muted" style="font-size:13.5px;max-width:64ch;margin:0 0 18px">Создавайте ачивки со своими картинками/эмодзи, условиями получения и рамками аватара.</p>
    <div id="achievements-list" class="grid">${skeletonCards(3)}</div>

    <h3 style="margin-top:32px">Новая ачивка</h3>
    <div id="achievement-form-card"></div>`;

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

/* ---------------------------------------------------------- ачивки ------ */

function achievementCardHtml(a) {
  const visual = a.image_url
    ? `<img src="${a.image_url}" alt="" style="width:40px;height:40px;object-fit:contain" />`
    : `<div style="font-size:1.8rem">${a.icon}</div>`;
  const frameVisual = a.avatar_frame_image_url
    ? `<img src="${a.avatar_frame_image_url}" alt="" style="width:28px;height:28px;object-fit:contain;border-radius:50%" title="Рамка: картинка" />`
    : a.avatar_frame_code
      ? `<span class="tag tag-neutral">рамка: ${escapeHtml(a.avatar_frame_code)}</span>`
      : "";

  return `
    <div class="card" id="achievement-${a.id}">
      <div style="display:flex;align-items:center;gap:10px">
        ${visual}
        <div style="flex:1">
          <strong style="font-family:var(--font-heading);font-weight:600">${escapeHtml(a.title)}</strong>
          <p class="muted" style="margin:2px 0;font-size:13px">${escapeHtml(a.description)}</p>
          <p class="muted" style="margin:0;font-size:11.5px">${CRITERIA_LABELS[a.criteria_type] || a.criteria_type} ≥ ${a.criteria_value} · +${a.points_reward} баллов${a.season ? ` · сезон: ${escapeHtml(a.season)}` : ""}</p>
        </div>
        ${frameVisual}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <label class="btn btn-secondary btn-sm" style="cursor:pointer">
          Значок (картинка)
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-image-upload="${a.id}" />
        </label>
        <label class="btn btn-secondary btn-sm" style="cursor:pointer">
          Рамка (картинка)
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-frame-upload="${a.id}" />
        </label>
        <button class="btn btn-danger btn-sm" data-delete="${a.id}">Удалить</button>
      </div>
    </div>`;
}

async function loadAchievementsAdmin() {
  const el = document.getElementById("achievements-list");
  try {
    const achievements = await api.get("/achievements");
    el.innerHTML = achievements.length
      ? achievements.map(achievementCardHtml).join("")
      : '<p class="muted">Ачивок пока нет.</p>';

    el.querySelectorAll("[data-image-upload]").forEach((input) => {
      input.addEventListener("change", () => uploadAchievementAsset(input, "image"));
    });
    el.querySelectorAll("[data-frame-upload]").forEach((input) => {
      input.addEventListener("change", () => uploadAchievementAsset(input, "frame-image"));
    });
    el.querySelectorAll("[data-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Удалить эту ачивку?")) return;
        try {
          await api.del(`/admin/achievements/${btn.dataset.delete}`);
          loadAchievementsAdmin();
        } catch (err) {
          toast(err.message, "error");
        }
      });
    });
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

async function uploadAchievementAsset(input, kind) {
  const file = input.files[0];
  if (!file) return;
  const achievementId = kind === "image" ? input.dataset.imageUpload : input.dataset.frameUpload;
  const formData = new FormData();
  formData.append("photo", file);
  try {
    await api.postForm(`/admin/achievements/${achievementId}/${kind}`, formData);
    toast("Загружено", "success");
    loadAchievementsAdmin();
  } catch (err) {
    toast(err.message, "error");
  }
}

function renderAchievementForm() {
  const card = document.getElementById("achievement-form-card");
  card.innerHTML = `
    <div id="achievement-form-alert"></div>
    <form id="achievement-form" style="max-width:520px">
      <div class="field"><label for="af-code">Код (латиницей, уникальный)</label><input class="input" type="text" id="af-code" required /></div>
      <div class="field"><label for="af-title">Название</label><input class="input" type="text" id="af-title" required /></div>
      <div class="field"><label for="af-description">Описание / как получить</label><textarea class="input" id="af-description" rows="2" required></textarea></div>
      <div class="field"><label for="af-icon">Эмодзи-иконка (пока нет картинки)</label><input class="input" type="text" id="af-icon" value="🏅" maxlength="4" /></div>
      <div class="field">
        <label for="af-criteria-type">Условие получения</label>
        <select class="input" id="af-criteria-type">
          ${Object.entries(CRITERIA_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label for="af-criteria-value">Значение условия</label><input class="input" type="number" id="af-criteria-value" value="1" min="1" required /></div>
      <div class="field"><label for="af-points">Награда в баллах</label><input class="input" type="number" id="af-points" value="0" min="0" /></div>
      <div class="field"><label for="af-season">Сезон (только для «уборок за сезон»)</label>
        <select class="input" id="af-season">
          <option value="">—</option>
          <option value="winter">Зима</option>
          <option value="spring">Весна</option>
          <option value="summer">Лето</option>
          <option value="autumn">Осень</option>
        </select>
      </div>
      <div class="field"><label for="af-frame-code">Код рамки аватара (опционально, латиницей)</label><input class="input" type="text" id="af-frame-code" placeholder="например, platinum" /></div>
      <button class="btn btn-primary" type="submit">Создать ачивку</button>
    </form>`;

  document.getElementById("achievement-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("achievement-form-alert");
    alertEl.innerHTML = "";
    try {
      await api.post("/admin/achievements", {
        code: document.getElementById("af-code").value.trim(),
        title: document.getElementById("af-title").value.trim(),
        description: document.getElementById("af-description").value.trim(),
        icon: document.getElementById("af-icon").value.trim() || "🏅",
        criteria_type: document.getElementById("af-criteria-type").value,
        criteria_value: parseInt(document.getElementById("af-criteria-value").value, 10),
        points_reward: parseInt(document.getElementById("af-points").value, 10) || 0,
        season: document.getElementById("af-season").value || null,
        avatar_frame_code: document.getElementById("af-frame-code").value.trim() || null,
      });
      toast("Ачивка создана", "success");
      document.getElementById("achievement-form").reset();
      loadAchievementsAdmin();
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });
}
