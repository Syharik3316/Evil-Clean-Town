const CRITERIA_LABELS = {
  lessons_completed: "Пройдено уроков",
  events_attended: "Посещено мероприятий",
  reports_approved: "Принято репортов",
  points_threshold: "Набрано баллов",
  seasonal_events_attended: "Уборок за сезон",
};

async function initAdminPage() {
  requireAuth();
  const root = document.getElementById("admin-root");
  const user = await currentUser(true);

  if (!user || user.role !== "admin") {
    root.innerHTML = '<div class="alert error">Доступно только администраторам.</div>';
    return;
  }

  const dashboardUrl = `${location.protocol}//${location.hostname}:${GRAFANA_PORT}/d/${GRAFANA_DASHBOARD_UID}/activity`;
  const embedUrl = `${dashboardUrl}?orgId=1&kiosk=tv&refresh=5m`;

  root.innerHTML = `
    <h1>Статистика фонда</h1>
    <p class="lead">Дашборд Grafana: пользователи, мероприятия, репорты, баллы, история мероприятий — обновляется каждые 5 минут.</p>
    <div class="grafana-embed">
      <iframe src="${embedUrl}" title="Grafana: активность пользователей" loading="lazy" referrerpolicy="no-referrer"></iframe>
    </div>
    <p class="muted">Не загрузилось? Откройте дашборд напрямую: <a href="${dashboardUrl}" target="_blank" rel="noopener">${dashboardUrl}</a></p>

    <h1>Ачивки</h1>
    <p class="lead">Создавайте ачивки со своими картинками/эмодзи, условиями получения и рамками аватара.</p>
    <div id="achievements-list">${skeletonCards(3)}</div>

    <h2>Новая ачивка</h2>
    <div class="card" id="achievement-form-card"></div>
  `;

  renderAchievementForm();
  loadAchievementsAdmin();
}

function achievementCardHtml(a) {
  const visual = a.image_url
    ? `<img src="${a.image_url}" alt="" style="width:40px;height:40px;object-fit:contain" />`
    : `<div style="font-size:1.8rem">${a.icon}</div>`;
  const frameVisual = a.avatar_frame_image_url
    ? `<img src="${a.avatar_frame_image_url}" alt="" style="width:28px;height:28px;object-fit:contain;border-radius:50%" title="Рамка: картинка" />`
    : a.avatar_frame_code
      ? `<span class="badge">рамка: ${escapeHtml(a.avatar_frame_code)}</span>`
      : "";

  return `
    <div class="card" id="achievement-${a.id}">
      <div style="display:flex; align-items:center; gap:10px">
        ${visual}
        <div style="flex:1">
          <strong>${escapeHtml(a.title)}</strong>
          <p class="muted" style="margin:2px 0">${escapeHtml(a.description)}</p>
          <p class="muted" style="margin:0; font-size:0.82rem">${CRITERIA_LABELS[a.criteria_type] || a.criteria_type} ≥ ${a.criteria_value} · +${a.points_reward} баллов${a.season ? ` · сезон: ${escapeHtml(a.season)}` : ""}</p>
        </div>
        ${frameVisual}
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px">
        <label class="btn secondary" style="font-size:0.78rem; padding:4px 10px; cursor:pointer">
          Значок (картинка)
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-image-upload="${a.id}" />
        </label>
        <label class="btn secondary" style="font-size:0.78rem; padding:4px 10px; cursor:pointer">
          Рамка (картинка)
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden data-frame-upload="${a.id}" />
        </label>
        <button class="btn danger" style="font-size:0.78rem; padding:4px 10px" data-delete="${a.id}">Удалить</button>
      </div>
    </div>`;
}

async function loadAchievementsAdmin() {
  const el = document.getElementById("achievements-list");
  try {
    const achievements = await api.get("/achievements");
    el.innerHTML = achievements.length
      ? `<div class="grid">${achievements.map(achievementCardHtml).join("")}</div>`
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
    <form id="achievement-form">
      <div class="field"><label for="af-code">Код (латиницей, уникальный)</label><input type="text" id="af-code" required /></div>
      <div class="field"><label for="af-title">Название</label><input type="text" id="af-title" required /></div>
      <div class="field"><label for="af-description">Описание / как получить</label><textarea id="af-description" rows="2" required></textarea></div>
      <div class="field"><label for="af-icon">Эмодзи-иконка (пока нет картинки)</label><input type="text" id="af-icon" value="🏅" maxlength="4" /></div>
      <div class="field">
        <label for="af-criteria-type">Условие получения</label>
        <select id="af-criteria-type">
          ${Object.entries(CRITERIA_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label for="af-criteria-value">Значение условия</label><input type="number" id="af-criteria-value" value="1" min="1" required /></div>
      <div class="field"><label for="af-points">Награда в баллах</label><input type="number" id="af-points" value="0" min="0" /></div>
      <div class="field"><label for="af-season">Сезон (только для «уборок за сезон»)</label>
        <select id="af-season">
          <option value="">—</option>
          <option value="winter">Зима</option>
          <option value="spring">Весна</option>
          <option value="summer">Лето</option>
          <option value="autumn">Осень</option>
        </select>
      </div>
      <div class="field"><label for="af-frame-code">Код рамки аватара (опционально, латиницей)</label><input type="text" id="af-frame-code" placeholder="например, platinum" /></div>
      <button class="btn" type="submit">Создать ачивку</button>
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
