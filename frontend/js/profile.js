async function initProfilePage() {
  requireAuth();
  const root = document.getElementById("profile-root");

  const [user, achievements, points, teams] = await Promise.all([
    currentUser(true),
    api.get("/users/me/achievements"),
    api.get("/users/me/points"),
    api.get("/teams"),
  ]);

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

  root.innerHTML = `
    <h1>${escapeHtml(user.display_name)}</h1>
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
      <button class="btn secondary" id="share-btn">Поделиться результатом</button>
      <p id="share-status" class="muted"></p>
    </div>

    <h2>История баллов</h2>
    <div class="card">${pointsHtml}</div>
  `;

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
