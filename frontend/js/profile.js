/* Профиль: ачивки, история баллов, календарь активности и лидерборд.
   Разметка — по дизайну newfront (Broadsheet). */

const ROLE_LABELS = { volunteer: "Волонтёр", organizer: "Организатор", admin: "Администратор" };
const AGE_METHOD_LABELS = { gosuslugi: "Госуслуги", manual: "вручную" };

let profileUser = null;
let profileBoardScope = "users";

async function initProfilePage() {
  requireAuth();
  profileUser = await currentUser(true);
  if (!profileUser) return;

  if (profileUser.role === "organizer") renderOrganizerProfile(profileUser);
  else if (profileUser.role === "admin") renderAdminProfile(profileUser);
  else await renderVolunteerProfile(profileUser);
}

function avatarBox(user) {
  const frame = user.selected_avatar_frame ? `frame-${user.selected_avatar_frame}` : "frame-none";
  return user.avatar_url
    ? `<figure class="avatar-box ${frame}" style="margin:0"><img src="${escapeHtml(user.avatar_url)}" alt="Фото профиля" /></figure>`
    : `<figure class="avatar-box ${frame}" style="margin:0">${escapeHtml((user.display_name || "?").slice(0, 1).toUpperCase())}</figure>`;
}

/* ------------------------------------------------------------ волонтёр --- */

async function renderVolunteerProfile(user) {
  const root = document.getElementById("profile-root");

  const [earned, allAchievements, points, teams, framesRes] = await Promise.all([
    api.get("/users/me/achievements").catch(() => []),
    api.get("/achievements").catch(() => []),
    api.get("/users/me/points").catch(() => []),
    api.get("/teams").catch(() => []),
    api.get("/users/me/avatar-frames").catch(() => ({ frames: [] })),
  ]);

  const earnedCodes = new Set(earned.map((a) => a.achievement.code));
  const unlockedFrames = framesRes.frames || [];
  const team = teams.find((t) => t.id === user.team_id);

  root.innerHTML = `
    <div class="profile-head">
      ${avatarBox(user)}
      <div style="min-width:280px">
        <div class="kicker">Профиль волонтёра</div>
        <h1>${escapeHtml(user.display_name)}</h1>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
          <span class="tag tag-accent">${ROLE_LABELS[user.role] || user.role}</span>
          ${team ? `<span class="tag tag-neutral">${escapeHtml(team.name)}${team.city ? " · " + escapeHtml(team.city) : ""}</span>` : ""}
          <span class="tag tag-outline">${user.age_verified ? `возраст подтверждён (${AGE_METHOD_LABELS[user.age_verification_method] || user.age_verification_method})` : "возраст не подтверждён"}</span>
        </div>
        <p class="muted" style="font-size:14.5px;max-width:52ch;margin:0">
          Мой уровень эко-грамотности: ${Math.round(user.points_total)} баллов, ачивок: ${earned.length} из ${allAchievements.length || earned.length}.
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px">
          <button type="button" class="btn btn-primary" id="share-btn"><i class="ph-duotone ph-share-network" style="font-size:17px"></i>Поделиться результатом</button>
          <a class="btn btn-secondary" id="share-vk" target="_blank" rel="noopener">ВКонтакте</a>
          <a class="btn btn-secondary" id="share-tg" target="_blank" rel="noopener">Telegram</a>
        </div>
        <div id="share-status" style="margin-top:14px"></div>
      </div>
      <div class="profile-stats">
        <div class="profile-stat"><span class="v">${Math.round(user.points_total)}</span><div class="k">баллов</div></div>
        <div class="profile-stat"><span class="v">${earned.length}</span><div class="k">ачивок</div></div>
        <div class="profile-stat"><span class="v">${user.current_streak}</span><div class="k">дней подряд</div></div>
      </div>
    </div>

    <div style="border-top:1px solid var(--color-divider);padding:32px 0 40px">
      <div style="display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:18px">
        <h3 style="margin:0">Настройки профиля</h3>
        <button type="button" class="btn btn-secondary" id="toggle-settings" style="margin-left:auto">Показать настройки</button>
      </div>
      <div id="profile-settings" hidden>
        <div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:28px">
          <div>
            <div class="micro" style="margin-bottom:14px">Верификация возраста</div>
            <p class="muted" style="font-size:12.5px;line-height:1.5;max-width:44ch">Подтверждение возраста (14+) нужно для записи на уборки побережья.</p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
              <button class="gos-btn" id="gosuslugi-btn" ${user.age_verified ? "disabled" : ""}><img src="/icons/gos.png" alt="Войти через Госуслуги" /></button>
              <button class="btn btn-secondary" id="manual-verify-btn" ${user.age_verified ? "disabled" : ""}>Ручная верификация</button>
            </div>
            <p class="muted" style="font-size:12.5px" id="verify-status">${user.age_verified ? "Возраст подтверждён." : "Возраст пока не подтверждён."}</p>
          </div>

          <div>
            <div class="micro" style="margin-bottom:14px">Внешние сервисы</div>
            <div class="link-row">
              <div class="logo"><i class="ph-duotone ph-identification-badge"></i></div>
              <div style="flex:1">
                <div class="t">Госуслуги</div>
                <div class="s">${user.age_verification_method === "gosuslugi" ? "личность подтверждена" : "не подключены"}</div>
              </div>
            </div>
            <div class="link-row">
              <div class="logo"><i class="ph-duotone ph-hand-heart"></i></div>
              <div style="flex:1">
                <div class="t">Добро.рф</div>
                <div class="s">${user.dobro_ru_linked ? "привязан" : "не привязан"}</div>
              </div>
              <button class="btn btn-secondary btn-sm" id="dobro-btn" ${user.dobro_ru_linked ? "disabled" : ""}>${user.dobro_ru_linked ? "✓" : "Привязать"}</button>
            </div>
            <div class="link-row">
              <div class="logo"><i class="ph-duotone ph-users-three"></i></div>
              <div style="flex:1">
                <div class="t">Движение Первых</div>
                <div class="s">${user.dvizhenie_pervyh_linked ? "привязано" : "не привязано"}</div>
              </div>
              <button class="btn btn-secondary btn-sm" id="dvizhenie-btn" ${user.dvizhenie_pervyh_linked ? "disabled" : ""}>${user.dvizhenie_pervyh_linked ? "✓" : "Привязать"}</button>
            </div>
          </div>

          <div>
            <div class="micro" style="margin-bottom:14px">Команда и рамка аватара</div>
            <div class="field">
              <label for="team-select">Команда, клуб или школа</label>
              <select class="input" id="team-select">
                <option value="">— не выбрано —</option>
                ${teams
                  .map(
                    (t) =>
                      `<option value="${t.id}" ${user.team_id === t.id ? "selected" : ""}>${escapeHtml(t.name)}${t.city ? " · " + escapeHtml(t.city) : ""}</option>`
                  )
                  .join("")}
              </select>
            </div>
            <p class="muted" style="font-size:12.5px" id="team-status"></p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
              ${
                unlockedFrames.length
                  ? `<button class="btn btn-secondary btn-sm" data-frame="">Без рамки</button>` +
                    unlockedFrames
                      .map(
                        (f) =>
                          `<button class="btn btn-secondary frame-${f}" data-frame="${f}" title="Рамка ${f}" style="border-radius:50%;width:40px;height:40px;padding:0"></button>`
                      )
                      .join("")
                  : '<p class="muted" style="font-size:12.5px;margin:0">Получайте ачивки, чтобы открывать рамки для аватара.</p>'
              }
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="cols cols-side-wide">
      <div>
        <h3>Ачивки</h3>
        <p class="muted" style="font-size:13.5px;margin:0 0 18px">Получено ${earned.length} из ${allAchievements.length || earned.length}.</p>
        <div class="ach-grid">
          ${(allAchievements.length ? allAchievements : earned.map((e) => e.achievement))
            .map((a) => {
              const got = earnedCodes.has(a.code);
              return `
              <div class="ach${got ? " got" : ""}">
                ${got ? '<i class="ph-duotone ph-check-circle check"></i>' : ""}
                <div class="badge-round">${escapeHtml(a.icon || "★")}</div>
                <div class="t">${escapeHtml(a.title)}</div>
                <div class="d">${escapeHtml(a.description)}</div>
                <div class="s">${got ? "получена" : `+${a.points_reward} б. за получение`}</div>
              </div>`;
            })
            .join("")}
        </div>

        <h3 style="margin:44px 0 10px">История баллов</h3>
        ${
          points.length
            ? `<table class="table">
                <thead><tr><th>Дата</th><th>За что</th><th style="text-align:right">Баллы</th></tr></thead>
                <tbody>
                  ${points
                    .map(
                      (p) => `<tr>
                        <td style="white-space:nowrap">${formatDate(p.created_at)}</td>
                        <td>${escapeHtml(p.reason)}</td>
                        <td style="text-align:right;font-family:var(--font-heading);font-weight:600;white-space:nowrap">+${Math.round(p.amount)}</td>
                      </tr>`
                    )
                    .join("")}
                </tbody>
              </table>`
            : '<p class="muted">Пока нет начислений баллов — пройди урок или отправь репорт.</p>'
        }
      </div>

      <div>
        <h3>Календарь активности</h3>
        <p class="muted" style="font-size:12.5px;margin:0 0 12px">Когда вы были на площадке и когда занимались на сайте.</p>
        <div class="cal-grid">${activityCalendar(points)}</div>
        <div class="cal-legend">
          <span><i style="background:var(--color-accent)"></i>на площадке</span>
          <span><i style="background:var(--color-accent-2-400)"></i>урок на сайте</span>
          <span><i style="background:var(--color-neutral-200)"></i>нет активности</span>
        </div>

        <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:14px">
          <h3 style="margin:0">Лидерборд</h3>
          <div class="seg" style="margin-left:auto" id="board-scopes">
            <button type="button" class="active" data-scope="users">Люди</button>
            <button type="button" data-scope="teams">Команды</button>
          </div>
        </div>
        <div id="leaderboard-table">${skeletonLines(5)}</div>
      </div>
    </div>`;

  bindVolunteerProfile(user, earned);
  loadProfileBoard("users");
}

function activityCalendar(points) {
  const days = 70;
  const byDay = new Map();
  points.forEach((p) => {
    const key = new Date(p.created_at).toDateString();
    const kind = /мероприят/i.test(p.reason) ? "site" : "lesson";
    byDay.set(key, byDay.get(key) === "site" ? "site" : kind);
  });

  const cells = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const kind = byDay.get(d.toDateString()) || "";
    cells.push(
      `<div class="${kind}" title="${d.toLocaleDateString("ru-RU")}${kind ? (kind === "site" ? " — на площадке" : " — занятие на сайте") : ""}"></div>`
    );
  }
  return cells.join("");
}

function bindVolunteerProfile(user, achievements) {
  const shareText = `Мой вклад в «Чистый берег»: ${Math.round(user.points_total)} баллов и ${achievements.length} ачивок! 🌊`;
  const shareUrl = window.location.origin;
  document.getElementById("share-vk").href =
    `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`;
  document.getElementById("share-tg").href =
    `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;

  document.getElementById("toggle-settings").addEventListener("click", (e) => {
    const panel = document.getElementById("profile-settings");
    panel.hidden = !panel.hidden;
    e.target.textContent = panel.hidden ? "Показать настройки" : "Скрыть настройки";
  });

  document.getElementById("share-btn").addEventListener("click", async () => {
    const statusEl = document.getElementById("share-status");
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText, url: shareUrl });
        return;
      } catch (e) {
        /* пользователь отменил — попробуем скопировать в буфер */
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      statusEl.innerHTML = `<div class="note">Текст скопирован: «${escapeHtml(shareText)}»</div>`;
      toast("Текст скопирован в буфер обмена", "success");
    } catch (e) {
      statusEl.innerHTML = `<div class="note">${escapeHtml(shareText)}</div>`;
    }
  });

  document.querySelectorAll("[data-frame]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      await api.post("/users/me/avatar-frame", { frame_code: btn.dataset.frame || null });
      cachedUser = null;
      initProfilePage();
    })
  );

  document.getElementById("gosuslugi-btn").addEventListener("click", async () => {
    const statusEl = document.getElementById("verify-status");
    try {
      await api.post("/users/me/age-verification/gosuslugi/start");
      statusEl.textContent = "Перенаправление на Госуслуги…";
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });

  document.getElementById("manual-verify-btn").addEventListener("click", () => {
    document.getElementById("manual-verify-modal").hidden = false;
  });
  document.getElementById("manual-verify-cancel").addEventListener("click", () => {
    document.getElementById("manual-verify-modal").hidden = true;
  });
  document.getElementById("manual-verify-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("manual-verify-alert");
    alertEl.innerHTML = "";
    try {
      await api.post("/users/me/age-verification/manual", {
        full_name: document.getElementById("mv-full-name").value.trim(),
        birth_date: document.getElementById("mv-birth-date").value,
        passport_series: document.getElementById("mv-passport-series").value.trim(),
        passport_number: document.getElementById("mv-passport-number").value.trim(),
        issued_by: document.getElementById("mv-issued-by").value.trim(),
        issued_date: document.getElementById("mv-issued-date").value,
      });
      document.getElementById("manual-verify-modal").hidden = true;
      cachedUser = null;
      initProfilePage();
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });

  document.getElementById("dobro-btn").addEventListener("click", async () => {
    await api.post("/users/me/link/dobro-ru");
    cachedUser = null;
    initProfilePage();
  });
  document.getElementById("dvizhenie-btn").addEventListener("click", async () => {
    await api.post("/users/me/link/dvizhenie-pervyh");
    cachedUser = null;
    initProfilePage();
  });

  document.getElementById("team-select").addEventListener("change", async (e) => {
    const statusEl = document.getElementById("team-status");
    const teamId = e.target.value ? parseInt(e.target.value, 10) : null;
    try {
      await api.patch("/users/me", { team_id: teamId });
      statusEl.textContent = "Команда обновлена.";
      cachedUser = null;
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });

  document.querySelectorAll("#board-scopes [data-scope]").forEach((btn) =>
    btn.addEventListener("click", () => {
      profileBoardScope = btn.dataset.scope;
      document.querySelectorAll("#board-scopes [data-scope]").forEach((b) => b.classList.toggle("active", b === btn));
      loadProfileBoard(profileBoardScope);
    })
  );
}

async function loadProfileBoard(scope) {
  const el = document.getElementById("leaderboard-table");
  el.innerHTML = skeletonLines(5);
  try {
    const rows = await api.get(`/leaderboard?scope=${scope}&limit=10`);
    el.innerHTML = rows.length
      ? rows
          .map(
            (r, i) => `
        <div class="board-line${scope === "users" && r.id === profileUser.id ? " me" : ""}">
          <span class="rank">${String(i + 1).padStart(2, "0")}</span>
          <span class="name">${escapeHtml(r.name)}</span>
          <span class="city">${escapeHtml(r.city || r.region || "")}</span>
          <span class="pts">${Math.round(r.points_total)}</span>
        </div>`
          )
          .join("")
      : '<p class="muted">Пока пусто.</p>';
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

/* --------------------------------------------------------- организатор --- */

function renderOrganizerProfile(user) {
  const org = user.organization;
  document.getElementById("profile-root").innerHTML = `
    <div class="profile-head">
      ${avatarBox(user)}
      <div>
        <div class="kicker">Профиль организатора</div>
        <h1>${escapeHtml(user.display_name)}</h1>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
          <span class="tag tag-accent">${ROLE_LABELS[user.role]}</span>
          ${org ? `<span class="tag tag-neutral">${escapeHtml(org.name)}</span>` : ""}
        </div>
        <p class="muted" style="font-size:14.5px;max-width:52ch;margin:0">
          ${org ? `ИНН ${escapeHtml(org.inn)} · ${org.legal_type === "legal_entity" ? "юридическое лицо" : "ИП"}` : "Организация не указана."}
        </p>
      </div>
      <div class="profile-stats">
        <div class="profile-stat"><span class="v">${org ? Math.round(org.points_total) : 0}</span><div class="k">баллов организации</div></div>
      </div>
    </div>

    <div class="cells">
      ${quickCell("ph-duotone ph-broom", "Мои мероприятия", "Создание мероприятий и заявки волонтёров", "/organizer")}
      ${quickCell("ph-duotone ph-book-open-text", "Курсы", "Создание и отправка курсов на модерацию", "/lessons")}
      ${quickCell("ph-duotone ph-camera", "Репорты", "Модерация находок волонтёров", "/reports")}
    </div>

    <h3 style="margin-top:44px">Аккаунт</h3>
    <table class="table" style="max-width:520px">
      <tbody>
        <tr><td>Логин</td><td style="text-align:right"><strong>${escapeHtml(user.username)}</strong></td></tr>
        <tr><td>Email</td><td style="text-align:right">${escapeHtml(user.email)} ${user.email_verified ? '<span class="tag tag-accent">подтверждён</span>' : '<span class="tag tag-neutral">не подтверждён</span>'}</td></tr>
      </tbody>
    </table>`;
}

/* -------------------------------------------------------------- админ ---- */

function renderAdminProfile(user) {
  document.getElementById("profile-root").innerHTML = `
    <div class="profile-head">
      ${avatarBox(user)}
      <div>
        <div class="kicker">Профиль администратора</div>
        <h1>${escapeHtml(user.display_name)}</h1>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">
          <span class="tag tag-accent">${ROLE_LABELS[user.role]}</span>
        </div>
        <p class="muted" style="font-size:14.5px;max-width:52ch;margin:0">Модерация мероприятий и курсов, репорты и мониторинг фонда в Grafana.</p>
      </div>
      <div class="profile-stats"></div>
    </div>

    <div class="cells">
      ${quickCell("ph-duotone ph-ticket", "Тикеты", "Модерация мероприятий и курсов", "/tickets")}
      ${quickCell("ph-duotone ph-chart-line-up", "Мониторинг", "Дашборд фонда и Grafana", "/admin")}
      ${quickCell("ph-duotone ph-camera", "Репорты", "Модерация находок волонтёров", "/reports")}
    </div>

    <h3 style="margin-top:44px">Аккаунт</h3>
    <table class="table" style="max-width:520px">
      <tbody>
        <tr><td>Логин</td><td style="text-align:right"><strong>${escapeHtml(user.username)}</strong></td></tr>
        <tr><td>Email</td><td style="text-align:right">${escapeHtml(user.email)}</td></tr>
      </tbody>
    </table>`;
}

function quickCell(icon, title, note, href) {
  return `
    <a href="${href}" style="text-decoration:none;color:inherit;display:block">
      <i class="${icon}" style="font-size:24px;color:var(--color-accent)"></i>
      <div style="font-family:var(--font-heading);font-weight:600;font-size:17px;margin:8px 0 4px">${title}</div>
      <div class="cell-note">${note}</div>
    </a>`;
}
