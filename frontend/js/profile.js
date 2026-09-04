async function initProfilePage() {
  requireAuth();
  const root = document.getElementById("profile-root");

  const [user, achievements, points, teams, framesRes] = await Promise.all([
    currentUser(true),
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
            <div style="font-size:1.6rem">${a.achievement.icon}</div>
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
    <div style="display:flex; align-items:center; gap:16px">
      <div class="${frameClass}" style="width:64px;height:64px;border-radius:50%;background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700">
        ${escapeHtml((user.display_name || "?").slice(0, 1).toUpperCase())}
      </div>
      <h1 style="margin:0">${escapeHtml(user.display_name)}</h1>
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

    <h2>Рамка аватара</h2>
    <div class="card">
      ${unlockedFrames.length
        ? `<div style="display:flex; gap:10px; flex-wrap:wrap">
            <button class="btn secondary" data-frame="">Без рамки</button>
            ${unlockedFrames
              .map(
                (f) =>
                  `<button class="btn secondary frame-${f}" data-frame="${f}" style="border-radius:50%;width:44px;height:44px;padding:0"></button>`
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
      <div style="display:flex; gap:8px; flex-wrap:wrap">
        <button class="btn secondary" id="gosuslugi-btn" ${user.age_verified ? "disabled" : ""}>Подтвердить через Госуслуги</button>
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
  `;

  const shareText = `Мой вклад в «Чистый берег»: ${Math.round(user.points_total)} баллов и ${achievements.length} ачивок! 🌊`;
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
    const text = `Мой вклад в «Чистый берег»: ${Math.round(user.points_total)} баллов и ${achievements.length} ачивок! 🌊`;
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
      statusEl.textContent = "Текст скопирован в буфер обмена!";
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

  bindLeaderboard();
}

function roleLabel(role) {
  return { volunteer: "Волонтёр", organizer: "Организатор", admin: "Администратор" }[role] || role;
}

function ageMethodLabel(method) {
  return { gosuslugi: "Госуслуги", manual: "вручную" }[method] || method;
}

function bindLeaderboard() {
  const buttons = document.querySelectorAll("[data-scope]");
  buttons.forEach((btn) => btn.addEventListener("click", () => loadLeaderboard(btn.dataset.scope)));
  loadLeaderboard("users");
}

async function loadLeaderboard(scope) {
  const el = document.getElementById("leaderboard-table");
  el.innerHTML = "Загрузка…";
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
