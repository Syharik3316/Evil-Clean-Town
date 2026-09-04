const REPORT_STATUS_LABELS = { pending: "На модерации", approved: "Принято", rejected: "Отклонено" };
let currentReportRejectHandler = null;

async function initReportsPage() {
  const root = document.getElementById("reports-root");
  const user = isLoggedIn() ? await currentUser() : null;

  document.getElementById("reason-cancel").addEventListener("click", () => {
    document.getElementById("reason-modal").hidden = true;
  });
  document.getElementById("reason-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const reason = document.getElementById("reason-text").value.trim();
    document.getElementById("reason-modal").hidden = true;
    if (currentReportRejectHandler) await currentReportRejectHandler(reason);
  });

  if (user && (user.role === "organizer" || user.role === "admin")) {
    renderModerationView(root);
  } else {
    renderSubmissionView(root, user);
  }
}

/* ---------- Волонтёр: отправка репортов ---------- */

function renderSubmissionView(root, user) {
  root.innerHTML = `
    <h1>Citizen science: репорты о мусоре</h1>
    <p class="lead">Нашёл замусоренный участок берега? Сфотографируй и отправь — после модерации тебе начислят баллы.</p>

    <div class="card" id="report-form-card"></div>

    <h2>Мои репорты</h2>
    <div id="reports-list" class="grid">${skeletonCards(2)}</div>
  `;

  if (!user) {
    document.getElementById("report-form-card").innerHTML =
      '<p class="muted">Чтобы отправить репорт, сначала <a href="/login">войдите</a>.</p>';
  } else {
    renderReportForm();
  }
  loadMyReports();
}

function renderReportForm() {
  document.getElementById("report-form-card").innerHTML = `
    <h2 style="margin-top:0">Новый репорт</h2>
    <div id="report-alert"></div>
    <form id="report-form">
      <div class="field">
        <label for="photo">Фото (JPEG/PNG/WebP)</label>
        <input type="file" id="photo" accept="image/jpeg,image/png,image/webp" required />
      </div>
      <div class="field">
        <label for="description">Описание</label>
        <textarea id="description" rows="3" placeholder="Что и где вы обнаружили?"></textarea>
      </div>
      <div class="field">
        <label for="region">Регион</label>
        <input type="text" id="region" placeholder="Например, Краснодарский край" />
      </div>
      <div class="field">
        <button type="button" class="btn secondary" id="geo-btn">📍 Определить моё местоположение</button>
        <p class="muted" id="geo-status">Координаты не определены</p>
        <input type="hidden" id="lat" />
        <input type="hidden" id="lon" />
      </div>
      <button class="btn" type="submit">Отправить репорт</button>
    </form>`;

  document.getElementById("geo-btn").addEventListener("click", () => {
    const status = document.getElementById("geo-status");
    if (!navigator.geolocation) {
      status.textContent = "Геолокация не поддерживается браузером.";
      return;
    }
    status.textContent = "Определяем местоположение…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.getElementById("lat").value = pos.coords.latitude;
        document.getElementById("lon").value = pos.coords.longitude;
        status.textContent = `Координаты: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      },
      () => {
        status.textContent = "Не удалось определить местоположение.";
      }
    );
  });

  document.getElementById("report-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById("report-alert");
    alertEl.innerHTML = "";

    const lat = document.getElementById("lat").value;
    const lon = document.getElementById("lon").value;
    if (!lat || !lon) {
      alertEl.innerHTML = '<div class="alert error">Сначала определите местоположение.</div>';
      return;
    }

    const formData = new FormData();
    formData.append("lat", lat);
    formData.append("lon", lon);
    formData.append("description", document.getElementById("description").value);
    formData.append("region", document.getElementById("region").value);
    formData.append("photo", document.getElementById("photo").files[0]);

    try {
      await api.postForm("/reports", formData);
      alertEl.innerHTML = '<div class="alert success">Репорт отправлен на модерацию. Спасибо!</div>';
      toast("Репорт отправлен", "success");
      document.getElementById("report-form").reset();
      document.getElementById("geo-status").textContent = "Координаты не определены";
      loadMyReports();
    } catch (err) {
      alertEl.innerHTML = `<div class="alert error">${escapeHtml(err.message)}</div>`;
    }
  });
}

async function loadMyReports() {
  const list = document.getElementById("reports-list");
  if (!isLoggedIn()) {
    list.innerHTML = '<p class="muted">Войдите, чтобы увидеть свои репорты.</p>';
    return;
  }
  try {
    const reports = await api.get("/reports?mine_only=true");
    if (!reports.length) {
      list.innerHTML = '<p class="muted">У вас пока нет отправленных репортов.</p>';
      return;
    }
    list.innerHTML = reports
      .map(
        (r) => `
        <div class="card">
          <img src="${r.photo_url}" alt="Фото репорта" style="width:100%;border-radius:8px;margin-bottom:8px" />
          <span class="badge ${r.status}">${REPORT_STATUS_LABELS[r.status] || r.status}</span>
          <p>${escapeHtml(r.description || "")}</p>
          <p class="muted">${formatDate(r.created_at)}</p>
        </div>`
      )
      .join("");
  } catch (e) {
    list.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

/* ---------- Организатор/админ: модерация репортов ---------- */

function renderModerationView(root) {
  root.innerHTML = `
    <h1>Модерация репортов</h1>
    <p class="lead">Репорты волонтёров о найденном мусоре, ожидающие решения.</p>
    <div class="field" style="max-width:260px">
      <label for="reports-sort">Сортировка</label>
      <select id="reports-sort">
        <option value="created_at">По дате создания</option>
        <option value="region">По региону</option>
      </select>
    </div>
    <div id="reports-mod-table">${skeletonCards(3)}</div>
  `;
  document.getElementById("reports-sort").addEventListener("change", loadModerationTable);
  loadModerationTable();
}

async function loadModerationTable() {
  const el = document.getElementById("reports-mod-table");
  const sortBy = document.getElementById("reports-sort").value;
  try {
    const reports = await api.get(`/reports?status_filter=pending&sort_by=${sortBy}`);
    if (!reports.length) {
      el.innerHTML = '<p class="muted">Нет репортов на модерации.</p>';
      return;
    }
    el.innerHTML = `<div class="grid">${reports.map(moderationCard).join("")}</div>`;
    reports.forEach(bindModerationCard);
  } catch (e) {
    el.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}

function moderationCard(r) {
  return `
    <div class="card" id="report-mod-${r.id}">
      <img src="${r.photo_url}" style="width:100%;border-radius:8px;margin-bottom:8px" alt="Фото репорта" />
      <p>${escapeHtml(r.description || "Без описания")}</p>
      <p class="muted">${formatDate(r.created_at)} · ${escapeHtml(r.region || "регион не указан")} · ${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}</p>
      <div style="display:flex; gap:8px">
        <button class="btn" data-approve>Принять</button>
        <button class="btn danger" data-reject>Отклонить</button>
      </div>
    </div>`;
}

function bindModerationCard(r) {
  const card = document.getElementById(`report-mod-${r.id}`);
  card.querySelector("[data-approve]").addEventListener("click", async () => {
    await api.post(`/reports/${r.id}/moderate`, { approve: true });
    toast("Репорт принят", "success");
    loadModerationTable();
  });
  card.querySelector("[data-reject]").addEventListener("click", () => {
    currentReportRejectHandler = async (reason) => {
      await api.post(`/reports/${r.id}/moderate`, { approve: false, comment: reason });
      toast("Репорт отклонён", "success");
      loadModerationTable();
    };
    document.getElementById("reason-text").value = "";
    document.getElementById("reason-modal").hidden = false;
  });
}
