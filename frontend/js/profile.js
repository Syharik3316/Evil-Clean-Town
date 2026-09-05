async function initProfilePage() {
  requireAuth();
  const user = await currentUser(true);

  if (user.role === "organizer") {
    document.getElementById("leaderboard-section").remove();
    renderOrganizerProfile(user);
  } else if (user.role === "admin") {
    document.getElementById("leaderboard-section").remove();
    renderAdminProfile(user);
  } else {
    await renderVolunteerProfile(user);
    bindLeaderboard();
  }
}

function roleLabel(role) {
  return { volunteer: "Волонтёр", organizer: "Организатор", admin: "Администратор" }[role] || role;
}

function ageMethodLabel(method) {
  return { gosuslugi: "Госуслуги", manual: "вручную" }[method] || method;
}

function orgStatusBadge(org) {
  if (!org) return "";
  if (org.status === "approved") return '<span class="badge approved">Подтверждена</span>';
  if (org.status === "rejected") {
    return `<span class="badge rejected">Отклонена</span>${org.rejection_reason ? `<p class="muted">Причина: ${escapeHtml(org.rejection_reason)}</p>` : ""}`;
  }
  return '<span class="badge pending">Ожидает подтверждения администрацией</span>';
}

function avatarCircleHtml(user, frameClass = "frame-none", size = 64) {
  const inner = user.avatar_url
    ? `<img src="${user.avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%" />`
    : escapeHtml((user.display_name || "?").slice(0, 1).toUpperCase());
  return `<div class="${frameClass}" style="width:${size}px;height:${size}px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;overflow:hidden">
    ${inner}
  </div>`;
}

function avatarUploadHtml() {
  return `
    <div>
      <input type="file" id="avatar-file" accept="image/jpeg,image/png,image/webp" hidden />
      <button class="btn secondary" type="button" id="avatar-upload-btn" style="font-size:0.8rem; padding:4px 10px">Изменить фото</button>
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
    <h2>Обо мне</h2>
    <div class="card">
      <textarea id="bio-input" rows="3" placeholder="Расскажите немного о себе…">${escapeHtml(currentBio || "")}</textarea>
      <button class="btn secondary" id="bio-save" style="margin-top:8px">Сохранить</button>
      <p id="bio-status" class="muted"></p>
    </div>`;
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
                `<div class="field"><label for="${id}-${f.name}">${f.label}</label><input type="${f.type || "text"}" id="${id}-${f.name}" ${f.attrs || ""} required /></div>`
            )
            .join("")}
          <div style="display:flex; gap:8px">
            <button class="btn" type="submit" style="flex:1">${submitLabel}</button>
            <button class="btn secondary" type="button" id="${id}-cancel">Отмена</button>
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
    <h2>Аккаунт</h2>
    <div class="card">
      <p>Логин: <strong>${escapeHtml(user.username)}</strong></p>
      <p>Email: <strong>${escapeHtml(user.email)}</strong> ${user.email_verified ? '<span class="badge approved">подтверждён</span>' : '<span class="badge pending">не подтверждён</span>'}</p>
      ${
        user.pending_email
          ? `<p class="muted">Ожидает подтверждения новый email <strong>${escapeHtml(user.pending_email)}</strong> — <a href="#" id="acc-confirm-pending-email">ввести код</a></p>`
          : ""
      }
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px">
        <button class="btn secondary" type="button" id="acc-change-username" style="font-size:0.85rem">Сменить логин</button>
        <button class="btn secondary" type="button" id="acc-change-password" style="font-size:0.85rem">Сменить пароль</button>
        <button class="btn secondary" type="button" id="acc-change-email" style="font-size:0.85rem">Сменить email</button>
      </div>
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

/* ---------- Организатор: компактный профиль организации ---------- */

function renderOrganizerProfile(user) {
  const root = document.getElementById("profile-root");
  const org = user.organization;
  const orgApproved = !org || org.status === "approved";

  root.innerHTML = `
    <div style="display:flex; align-items:center; gap:16px">
      ${avatarCircleHtml(user)}
      <div>
        <h1 style="margin:0">${escapeHtml(user.display_name)}</h1>
        <span class="badge">${roleLabel(user.role)}</span>
      </div>
      ${avatarUploadHtml()}
    </div>

    <h2>Организация</h2>
    <div class="card">
      ${
        org
          ? `<p><strong>${escapeHtml(org.name)}</strong></p>
             <p class="muted">ИНН ${escapeHtml(org.inn)} · ${org.legal_type === "legal_entity" ? "Юридическое лицо" : "ИП"}</p>
             <p>${orgStatusBadge(org)}</p>
             <p class="badge">${Math.round(org.points_total)} баллов организации</p>
             <div class="field" style="margin-top:10px">
               <label for="org-bio-input">Обо мне (организация)</label>
               <textarea id="org-bio-input" rows="3" placeholder="Расскажите об организации…">${escapeHtml(org.bio || "")}</textarea>
             </div>
             <button class="btn secondary" id="org-bio-save">Сохранить</button>
             <p id="org-bio-status" class="muted"></p>`
          : '<p class="muted">Организация не указана.</p>'
      }
    </div>

    ${
      !orgApproved
        ? '<div class="alert info">Пока организация не подтверждена администрацией, создание мероприятий и курсов недоступно.</div>'
        : ""
    }

    <h2>Быстрые действия</h2>
    <div class="grid">
      <div class="card" ${orgApproved ? "" : 'style="opacity:0.55"'}>
        <h2 style="margin-top:0">🧹 Мои мероприятия</h2>
        <p class="muted">Создание мероприятий и заявки волонтёров.</p>
        ${orgApproved ? '<a href="/organizer">Перейти →</a>' : '<span class="muted">Недоступно до подтверждения</span>'}
      </div>
      <div class="card" ${orgApproved ? "" : 'style="opacity:0.55"'}>
        <h2 style="margin-top:0">📘 Курсы</h2>
        <p class="muted">Создание и модерация обучающих курсов.</p>
        ${orgApproved ? '<a href="/lessons">Перейти →</a>' : '<span class="muted">Недоступно до подтверждения</span>'}
      </div>
      <div class="card">
        <h2 style="margin-top:0">📸 Репорты</h2>
        <p class="muted">Модерация репортов о мусоре от волонтёров.</p>
        <a href="/reports">Перейти →</a>
      </div>
    </div>

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

/* ---------- Админ: минимальный аккаунт-профиль ---------- */

function renderAdminProfile(user) {
  const root = document.getElementById("profile-root");

  root.innerHTML = `
    <div style="display:flex; align-items:center; gap:16px">
      ${avatarCircleHtml(user)}
      <div>
        <h1 style="margin:0">${escapeHtml(user.display_name)}</h1>
        <span class="badge">${roleLabel(user.role)}</span>
      </div>
      ${avatarUploadHtml()}
    </div>

    <h2>Быстрые действия</h2>
    <div class="grid">
      <div class="card">
        <h2 style="margin-top:0">🎫 Тикеты</h2>
        <p class="muted">Модерация предложенных мероприятий, курсов и организаций.</p>
        <a href="/tickets">Перейти →</a>
      </div>
      <div class="card">
        <h2 style="margin-top:0">📊 Статистика</h2>
        <p class="muted">Сводная статистика фонда и управление ачивками.</p>
        <a href="/admin">Перейти →</a>
      </div>
      <div class="card">
        <h2 style="margin-top:0">📸 Репорты</h2>
        <p class="muted">Модерация репортов о мусоре.</p>
        <a href="/reports">Перейти →</a>
      </div>
    </div>

    ${accountSettingsHtml(user)}
  `;

  bindAvatarUpload();
  bindAccountSettings(user);
}

/* ---------- Волонтёр: геймификация ---------- */

async function renderVolunteerProfile(user) {
  const root = document.getElementById("profile-root");

  const [achievements, points, teams, framesRes] = await Promise.all([
    api.get("/users/me/achievements"),
    api.get("/users/me/points"),
    api.get("/teams"),
    api.get("/users/me/avatar-frames"),
  ]);
  const unlockedFrames = framesRes.frames || [];

  const achievementsHtml = achievements.length
    ? `<div class="grid">${achievements
        .map(
          (a) => `
          <div class="card">
            ${
              a.achievement.image_url
                ? `<img src="${a.achievement.image_url}" alt="" style="width:48px;height:48px;object-fit:contain" />`
                : `<div style="font-size:1.6rem">${a.achievement.icon}</div>`
            }
            <strong>${escapeHtml(a.achievement.title)}</strong>
            <p class="muted">${escapeHtml(a.achievement.description)}</p>
          </div>`
        )
        .join("")}</div>`
    : '<p class="muted">Пока нет ачивок — пройди урок или мероприятие, чтобы получить первую!</p>';

  const pointsHtml = points.length
    ? `<table><tbody>${points
        .map(
          (p) => `<tr><td>${formatDate(p.created_at)}</td><td>${escapeHtml(p.reason)}</td><td>+${Math.round(p.amount)}</td></tr>`
        )
        .join("")}</tbody></table>`
    : '<p class="muted">Пока нет начислений баллов.</p>';

  const frameClass = `frame-${user.selected_avatar_frame || "none"}`;

  root.innerHTML = `
    <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap">
      ${avatarCircleHtml(user, frameClass)}
      <h1 style="margin:0">${escapeHtml(user.display_name)}</h1>
      ${avatarUploadHtml()}
    </div>
    <div class="grid">
      <div class="card">
        <p class="muted">Баллы</p>
        <h2 style="margin:0">${Math.round(user.points_total)}</h2>
      </div>
      <div class="card">
        <p class="muted">Роль</p>
        <h2 style="margin:0">${roleLabel(user.role)}</h2>
      </div>
      <div class="card">
        <p class="muted">Ачивок получено</p>
        <h2 style="margin:0">${achievements.length}</h2>
      </div>
      <div class="card">
        <p class="muted">Огонёк участия</p>
        <h2 style="margin:0">🔥 ${user.current_streak} <span class="muted" style="font-size:0.8rem">(рекорд: ${user.longest_streak})</span></h2>
      </div>
    </div>

    ${bioCardHtml(user.bio)}

    <h2>Рамка аватара</h2>
    <div class="card">
      ${unlockedFrames.length
        ? `<div style="display:flex; gap:10px; flex-wrap:wrap">
            <button class="btn secondary" data-frame="">Без рамки</button>
            ${unlockedFrames
              .map((f) =>
                f.image_url
                  ? `<button class="btn secondary" data-frame="${f.code}" style="border-radius:50%;width:44px;height:44px;padding:0;background:url('${f.image_url}') center/cover"></button>`
                  : `<button class="btn secondary frame-${f.code}" data-frame="${f.code}" style="border-radius:50%;width:44px;height:44px;padding:0"></button>`
              )
              .join("")}
          </div>`
        : '<p class="muted">Получайте ачивки, чтобы открывать рамки для аватара.</p>'}
    </div>

    <h2>Верификация возраста</h2>
    <div class="card">
      <p>
        Статус:
        ${user.age_verified
          ? `<span class="badge approved">Подтверждён (${ageMethodLabel(user.age_verification_method)})</span>`
          : '<span class="badge pending">Не подтверждён</span>'}
      </p>
      <p class="muted">Верификация возраста (от 14 лет) нужна для записи на мероприятия и полного доступа к платформе.</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
        <button class="gos-btn" id="gosuslugi-btn" ${user.age_verified ? "disabled" : ""}><img src="/icons/gos.png" alt="Войти через Госуслуги" /></button>
        <button class="btn secondary" id="manual-verify-btn" ${user.age_verified ? "disabled" : ""}>Ручная верификация</button>
      </div>
      <p id="verify-status" class="muted"></p>
    </div>

    <h2>Внешние сервисы</h2>
    <div class="card">
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn secondary" id="dobro-btn" ${user.dobro_ru_linked ? "disabled" : ""}>${user.dobro_ru_linked ? "Добро.рф привязан ✓" : "Привязать Добро.рф"}</button>
        <button class="btn secondary" id="dvizhenie-btn" ${user.dvizhenie_pervyh_linked ? "disabled" : ""}>${user.dvizhenie_pervyh_linked ? "Движение Первых привязано ✓" : "Привязать «Движение Первых»"}</button>
      </div>
    </div>

    <h2>Моя команда/школа</h2>
    <div class="card">
      <div class="field">
        <label for="team-select">Команда, клуб или школа</label>
        <select id="team-select">
          <option value="">— не выбрано —</option>
          ${teams
            .map(
              (t) =>
                `<option value="${t.id}" ${user.team_id === t.id ? "selected" : ""}>${escapeHtml(t.name)}${t.city ? " · " + escapeHtml(t.city) : ""}</option>`
            )
            .join("")}
        </select>
      </div>
      <p class="muted" id="team-status"></p>
    </div>

    <h2>Мои ачивки</h2>
    ${achievementsHtml}

    <h2>Соц-шеринг</h2>
    <div class="card">
      <p>Мой уровень эко-грамотности: <strong>${Math.round(user.points_total)} баллов</strong>, ачивок: <strong>${achievements.length}</strong>.</p>
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn secondary" id="share-btn">Поделиться результатом</button>
        <a class="btn secondary" id="share-vk" target="_blank" rel="noopener">Поделиться ВКонтакте</a>
        <a class="btn secondary" id="share-tg" target="_blank" rel="noopener">Поделиться в Telegram</a>
      </div>
      <p id="share-status" class="muted"></p>
    </div>

    <h2>История баллов</h2>
    <div class="card">${pointsHtml}</div>

    ${accountSettingsHtml(user)}
  `;

  bindAvatarUpload();
  bindBio();
  bindAccountSettings(user);

  const shareText = `Мой вклад в «GoodWill»: ${Math.round(user.points_total)} баллов и ${achievements.length} ачивок! 🌊`;
  const shareUrl = window.location.origin;
  document.getElementById("share-vk").href = `https://vk.com/share.php?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}`;
  document.getElementById("share-tg").href = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;

  document.querySelectorAll("[data-frame]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api.post("/users/me/avatar-frame", { frame_code: btn.dataset.frame || null });
      cachedUser = null;
      initProfilePage();
    });
  });

  document.getElementById("share-btn").addEventListener("click", async () => {
    const text = `Мой вклад в «GoodWill»: ${Math.round(user.points_total)} баллов и ${achievements.length} ачивок! 🌊`;
    const statusEl = document.getElementById("share-status");
    if (navigator.share) {
      try {
        await navigator.share({ text, url: window.location.origin });
        return;
      } catch (e) {
        /* пользователь отменил — попробуем скопировать в буфер */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Текст скопирован в буфер обмена!", "success");
    } catch (e) {
      statusEl.textContent = text;
    }
  });

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
      statusEl.textContent = "Команда обновлена!";
      cachedUser = null;
    } catch (err) {
      statusEl.textContent = err.message;
    }
  });
}

function bindLeaderboard() {
  const buttons = document.querySelectorAll("[data-scope]");
  buttons.forEach((btn) => btn.addEventListener("click", () => loadLeaderboard(btn.dataset.scope)));
  loadLeaderboard("users");
}

async function loadLeaderboard(scope) {
  const el = document.getElementById("leaderboard-table");
  el.innerHTML = skeletonLines(4);
  try {
    const rows = await api.get(`/leaderboard?scope=${scope}&limit=20`);
    if (!rows.length) {
      el.innerHTML = '<p class="muted">Пока пусто.</p>';
      return;
    }
    el.innerHTML = `<table><tbody>${rows
      .map(
        (r, i) =>
          `<tr><td>#${i + 1}</td><td>${escapeHtml(r.name)}${r.city ? " · " + escapeHtml(r.city) : ""}</td><td>${Math.round(r.points_total)} б.</td></tr>`
      )
      .join("")}</tbody></table>`;
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}
