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

function orgStatusBadge(org) {
  if (!org) return "";
  if (org.status === "approved") return '<span class="tag tag-accent">Подтверждена</span>';
  if (org.status === "rejected") {
    return (
      '<span class="tag tag-accent-2">Отклонена</span>' +
      (org.rejection_reason ? `<p class="muted" style="font-size:12.5px;margin:6px 0 0">Причина: ${escapeHtml(org.rejection_reason)}</p>` : "")
    );
  }
  return '<span class="tag tag-neutral">Ожидает подтверждения администрацией</span>';
}

/* Кнопка «Изменить фото», встраиваемая рядом с avatarBox() в каждом из трёх профилей. */
function avatarUploadHtml() {
  return `
    <div>
      <input type="file" id="avatar-file" accept="image/jpeg,image/png,image/webp" hidden />
      <button class="btn btn-secondary btn-sm" type="button" id="avatar-upload-btn">Изменить фото</button>
    </div>`;
}

function bindAvatarUpload() {
  const btn = document.getElementById("avatar-upload-btn");
  const input = document.getElementById("avatar-file");
  if (!btn || !input) return;
  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("photo", file);
    try {
      await api.postForm("/users/me/avatar", formData);
      cachedUser = null;
      toast("Фото обновлено", "success");
      initProfilePage();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

function bioCardHtml(currentBio) {
  return `
    <h3 style="margin-top:44px">Обо мне</h3>
    <div class="field" style="max-width:520px">
      <textarea class="input" id="bio-input" rows="3" placeholder="Расскажите немного о себе…">${escapeHtml(currentBio || "")}</textarea>
    </div>
    <button class="btn btn-secondary btn-sm" id="bio-save">Сохранить</button>
    <p id="bio-status" class="muted" style="font-size:12.5px;margin-top:8px"></p>`;
}

function bindBio() {
  const btn = document.getElementById("bio-save");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const statusEl = document.getElementById("bio-status");
    try {
      await api.patch("/users/me", { bio: document.getElementById("bio-input").value.trim() || null });
      cachedUser = null;
      statusEl.textContent = "Сохранено!";
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });
}

/* ---------- Аккаунт: смена логина/пароля/email (общее для всех ролей) ---------- */

function showAccountModal({ id, title, fields, submitLabel, onSubmit }) {
  let modal = document.getElementById(id);
  if (!modal) {
    modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.id = id;
    modal.hidden = true;
    modal.innerHTML = `
      <div class="modal">
        <h2>${title}</h2>
        <div id="${id}-alert"></div>
        <form id="${id}-form">
          ${fields
            .map(
              (f) =>
                `<div class="field"><label for="${id}-${f.name}">${f.label}</label><input class="input" type="${f.type || "text"}" id="${id}-${f.name}" ${f.attrs || ""} required /></div>`
            )
            .join("")}
          <div class="dialog-actions">
            <button class="btn btn-secondary" type="button" id="${id}-cancel">Отмена</button>
            <button class="btn btn-primary" type="submit">${submitLabel}</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(modal);
  }

  document.getElementById(`${id}-alert`).innerHTML = "";
  fields.forEach((f) => {
    document.getElementById(`${id}-${f.name}`).value = "";
  });
  modal.hidden = false;

  const form = document.getElementById(`${id}-form`);
  const freshForm = form.cloneNode(true);
  form.replaceWith(freshForm);

  document.getElementById(`${id}-cancel`).addEventListener("click", () => {
    modal.hidden = true;
  });
  freshForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById(`${id}-alert`);
    alertEl.innerHTML = "";
    const values = {};
    fields.forEach((f) => {
      values[f.name] = document.getElementById(`${id}-${f.name}`).value.trim();
    });
    try {
      await onSubmit(values);
      modal.hidden = true;
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });
}

function showEmailChangeCodeModal(email) {
  showAccountModal({
    id: "acc-email-code-modal",
    title: "Подтверждение нового email",
    fields: [{ name: "code", label: `Код из письма на ${email}`, attrs: 'inputmode="numeric" maxlength="6"' }],
    submitLabel: "Подтвердить",
    onSubmit: async (v) => {
      await api.post("/users/me/email/confirm", { code: v.code });
      cachedUser = null;
      toast("Email изменён", "success");
      initProfilePage();
    },
  });
}

function accountSettingsHtml(user) {
  return `
    <h3 style="margin-top:44px">Аккаунт</h3>
    <table class="table" style="max-width:520px">
      <tbody>
        <tr><td>Логин</td><td style="text-align:right"><strong>${escapeHtml(user.username)}</strong></td></tr>
        <tr><td>Email</td><td style="text-align:right">${escapeHtml(user.email)} ${user.email_verified ? '<span class="tag tag-accent">подтверждён</span>' : '<span class="tag tag-neutral">не подтверждён</span>'}</td></tr>
      </tbody>
    </table>
    ${
      user.pending_email
        ? `<p class="muted" style="font-size:12.5px;margin-top:10px">Ожидает подтверждения новый email <strong>${escapeHtml(user.pending_email)}</strong> — <a href="#" id="acc-confirm-pending-email">ввести код</a></p>`
        : ""
    }
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
      <button class="btn btn-secondary btn-sm" type="button" id="acc-change-username">Сменить логин</button>
      <button class="btn btn-secondary btn-sm" type="button" id="acc-change-password">Сменить пароль</button>
      <button class="btn btn-secondary btn-sm" type="button" id="acc-change-email">Сменить email</button>
    </div>`;
}

function bindAccountSettings(user) {
  document.getElementById("acc-change-username").addEventListener("click", () => {
    showAccountModal({
      id: "acc-username-modal",
      title: "Смена логина",
      fields: [
        { name: "current_password", label: "Текущий пароль", type: "password" },
        { name: "new_username", label: "Новый логин" },
      ],
      submitLabel: "Сохранить",
      onSubmit: async (v) => {
        await api.patch("/users/me/username", v);
        cachedUser = null;
        toast("Логин изменён", "success");
        initProfilePage();
      },
    });
  });

  document.getElementById("acc-change-password").addEventListener("click", () => {
    showAccountModal({
      id: "acc-password-modal",
      title: "Смена пароля",
      fields: [
        { name: "current_password", label: "Текущий пароль", type: "password" },
        { name: "new_password", label: "Новый пароль (от 6 символов)", type: "password", attrs: 'minlength="6"' },
      ],
      submitLabel: "Сохранить",
      onSubmit: async (v) => {
        await api.patch("/users/me/password", v);
        toast("Пароль изменён", "success");
      },
    });
  });

  document.getElementById("acc-change-email").addEventListener("click", () => {
    showAccountModal({
      id: "acc-email-modal",
      title: "Смена email",
      fields: [
        { name: "current_password", label: "Текущий пароль", type: "password" },
        { name: "new_email", label: "Новый email", type: "email" },
      ],
      submitLabel: "Отправить код",
      onSubmit: async (v) => {
        await api.post("/users/me/email/change", v);
        toast("Код отправлен на новую почту", "success");
        showEmailChangeCodeModal(v.new_email);
      },
    });
  });

  const confirmLink = document.getElementById("acc-confirm-pending-email");
  if (confirmLink) {
    confirmLink.addEventListener("click", (e) => {
      e.preventDefault();
      showEmailChangeCodeModal(user.pending_email);
    });
  }
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
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          <span class="tag tag-accent">${ROLE_LABELS[user.role] || user.role}</span>
          ${team ? `<span class="tag tag-neutral">${escapeHtml(team.name)}${team.city ? " · " + escapeHtml(team.city) : ""}</span>` : ""}
          <span class="tag tag-outline">${user.age_verified ? `возраст подтверждён (${AGE_METHOD_LABELS[user.age_verification_method] || user.age_verification_method})` : "возраст не подтверждён"}</span>
        </div>
        <div style="margin-bottom:18px">${avatarUploadHtml()}</div>
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
      </div>
      <div class="profile-stats">
        <div class="profile-stat"><span class="v">${Math.round(user.points_total)}</span><div class="k">баллов</div></div>
        <div class="profile-stat"><span class="v">${earned.length}</span><div class="k">ачивок</div></div>
        <div class="profile-stat"><span class="v">${user.current_streak}</span><div class="k">дней подряд</div></div>
      </div>
    </div>

    ${bioCardHtml(user.bio)}

    <div style="border-top:1px solid var(--color-divider);padding:32px 0 40px">
      <div style="display:flex;align-items:baseline;gap:16px;flex-wrap:wrap;margin-bottom:18px">
        <h3 style="margin:0">Настройки профиля</h3>
        <button type="button" class="btn btn-secondary" id="toggle-settings" style="margin-left:auto">Показать настройки</button>
      </div>
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
                      .map((f) =>
                        f.image_url
                          ? `<button class="btn btn-secondary" data-frame="${f.code}" title="Рамка ${f.code}" style="border-radius:50%;width:40px;height:40px;padding:0;background:url('${f.image_url}') center/cover"></button>`
                          : `<button class="btn btn-secondary frame-${f.code}" data-frame="${f.code}" title="Рамка ${f.code}" style="border-radius:50%;width:40px;height:40px;padding:0"></button>`
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
              const badge = a.image_url
                ? `<img src="${a.image_url}" alt="" style="width:100%;height:100%;object-fit:contain" />`
                : escapeHtml(a.icon || "★");
              return `
              <div class="ach${got ? " got" : ""}">
                ${got ? '<i class="ph-duotone ph-check-circle check"></i>' : ""}
                <div class="badge-round">${badge}</div>
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
    </div>

    ${accountSettingsHtml(user)}
  `;

  bindVolunteerProfile(user, earned);
  bindAvatarUpload();
  bindBio();
  bindAccountSettings(user);
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
  const shareText = `Мой вклад в «GoodWill»: ${Math.round(user.points_total)} баллов и ${achievements.length} ачивок! 🌊`;
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
  const orgApproved = !org || org.status === "approved";
  document.getElementById("profile-root").innerHTML = `
    <div class="profile-head">
      ${avatarBox(user)}
      <div>
        <div class="kicker">Профиль организатора</div>
        <h1>${escapeHtml(user.display_name)}</h1>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          <span class="tag tag-accent">${ROLE_LABELS[user.role]}</span>
          ${org ? `<span class="tag tag-neutral">${escapeHtml(org.name)}</span>` : ""}
        </div>
        <div style="margin-bottom:18px">${avatarUploadHtml()}</div>
        <p class="muted" style="font-size:14.5px;max-width:52ch;margin:0">
          ${org ? `ИНН ${escapeHtml(org.inn)} · ${org.legal_type === "legal_entity" ? "юридическое лицо" : "ИП"}` : "Организация не указана."}
        </p>
      </div>
      <div class="profile-stats">
        <div class="profile-stat"><span class="v">${org ? Math.round(org.points_total) : 0}</span><div class="k">баллов организации</div></div>
      </div>
    </div>

    ${org ? `<div style="margin-bottom:24px">${orgStatusBadge(org)}</div>` : ""}
    ${
      !orgApproved
        ? '<div class="note note-2" style="margin-bottom:32px">Пока организация не подтверждена администрацией, создание мероприятий и курсов недоступно.</div>'
        : ""
    }

    <div class="cells">
      <div style="${orgApproved ? "" : "opacity:.55"}">
        <i class="ph-duotone ph-broom" style="font-size:24px;color:var(--color-accent)"></i>
        <div style="font-family:var(--font-heading);font-weight:600;font-size:17px;margin:8px 0 4px">Мои мероприятия</div>
        <div class="cell-note">Создание мероприятий и заявки волонтёров.</div>
        ${orgApproved ? '<a href="/organizer" style="font-size:12.5px">Перейти →</a>' : '<span class="muted" style="font-size:12px">Недоступно до подтверждения</span>'}
      </div>
      <div style="${orgApproved ? "" : "opacity:.55"}">
        <i class="ph-duotone ph-book-open-text" style="font-size:24px;color:var(--color-accent)"></i>
        <div style="font-family:var(--font-heading);font-weight:600;font-size:17px;margin:8px 0 4px">Курсы</div>
        <div class="cell-note">Создание и отправка курсов на модерацию.</div>
        ${orgApproved ? '<a href="/lessons" style="font-size:12.5px">Перейти →</a>' : '<span class="muted" style="font-size:12px">Недоступно до подтверждения</span>'}
      </div>
      ${quickCell("ph-duotone ph-camera", "Репорты", "Просмотр очереди находок волонтёров (модерация — у администрации).", "/reports")}
    </div>

    ${
      org
        ? `<h3 style="margin-top:44px">Об организации</h3>
           <div class="field" style="max-width:520px">
             <textarea class="input" id="org-bio-input" rows="3" placeholder="Расскажите об организации…">${escapeHtml(org.bio || "")}</textarea>
           </div>
           <button class="btn btn-secondary btn-sm" id="org-bio-save">Сохранить</button>
           <p id="org-bio-status" class="muted" style="font-size:12.5px;margin-top:8px"></p>`
        : ""
    }

    ${accountSettingsHtml(user)}
  `;

  bindAvatarUpload();
  bindAccountSettings(user);

  const orgBioSave = document.getElementById("org-bio-save");
  if (orgBioSave) {
    orgBioSave.addEventListener("click", async () => {
      const statusEl = document.getElementById("org-bio-status");
      try {
        await api.patch("/organizations/me", { bio: document.getElementById("org-bio-input").value.trim() || null });
        cachedUser = null;
        statusEl.textContent = "Сохранено!";
      } catch (err) {
        statusEl.textContent = err.message;
      }
    });
  }
}

/* -------------------------------------------------------------- админ ---- */

function renderAdminProfile(user) {
  document.getElementById("profile-root").innerHTML = `
    <div class="profile-head">
      ${avatarBox(user)}
      <div>
        <div class="kicker">Профиль администратора</div>
        <h1>${escapeHtml(user.display_name)}</h1>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
          <span class="tag tag-accent">${ROLE_LABELS[user.role]}</span>
        </div>
        <div style="margin-bottom:18px">${avatarUploadHtml()}</div>
        <p class="muted" style="font-size:14.5px;max-width:52ch;margin:0">Модерация мероприятий, курсов и организаций, репорты и мониторинг фонда в Grafana.</p>
      </div>
      <div class="profile-stats"></div>
    </div>

    <div class="cells">
      ${quickCell("ph-duotone ph-ticket", "Тикеты", "Модерация мероприятий, курсов и организаций", "/tickets")}
      ${quickCell("ph-duotone ph-chart-line-up", "Мониторинг", "Дашборд фонда, Grafana и управление ачивками", "/admin")}
      ${quickCell("ph-duotone ph-camera", "Репорты", "Модерация находок волонтёров", "/reports")}
    </div>

    ${accountSettingsHtml(user)}
  `;

  bindAvatarUpload();
  bindAccountSettings(user);
}

function quickCell(icon, title, note, href) {
  return `
    <a href="${href}" style="text-decoration:none;color:inherit;display:block">
      <i class="${icon}" style="font-size:24px;color:var(--color-accent)"></i>
      <div style="font-family:var(--font-heading);font-weight:600;font-size:17px;margin:8px 0 4px">${title}</div>
      <div class="cell-note">${note}</div>
    </a>`;
}
