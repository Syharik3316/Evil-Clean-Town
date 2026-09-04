const REPORT_STATUS_LABELS = { pending: "На модерации", approved: "Принято", rejected: "Отклонено" };

function initReportsPage() {
  if (!isLoggedIn()) {
    document.getElementById("report-form-card").innerHTML =
      '<p class="muted">Чтобы отправить репорт, сначала <a href="login.html">войдите</a>.</p>';
  } else {
    bindReportForm();
  }
  loadMyReports();
}

function bindReportForm() {
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
    formData.append("photo", document.getElementById("photo").files[0]);

    try {
      await api.postForm("/reports", formData);
      alertEl.innerHTML = '<div class="alert success">Репорт отправлен на модерацию. Спасибо!</div>';
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
