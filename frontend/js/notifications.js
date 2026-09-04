async function initNotificationsPage() {
  requireAuth();
  document.getElementById("mark-all-read-btn").addEventListener("click", async () => {
    await api.post("/notifications/read-all");
    loadNotifications();
  });
  loadNotifications();
}

async function loadNotifications() {
  const root = document.getElementById("notifications-root");
  try {
    const notifications = await api.get("/notifications");
    if (!notifications.length) {
      root.innerHTML = '<p class="muted">Уведомлений пока нет.</p>';
      return;
    }
    root.innerHTML = notifications
      .map(
        (n) => `
        <div class="notification-item${n.read_at ? "" : " unread"}" id="notif-${n.id}">
          <strong>${escapeHtml(n.title)}</strong>
          ${n.body ? `<p class="muted">${escapeHtml(n.body)}</p>` : ""}
          <p class="muted">${formatDate(n.created_at)}</p>
          ${n.read_at ? "" : `<button class="btn secondary" data-read="${n.id}">Отметить прочитанным</button>`}
        </div>`
      )
      .join("");

    root.querySelectorAll("[data-read]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        await api.post(`/notifications/${btn.dataset.read}/read`);
        loadNotifications();
      })
    );
  } catch (e) {
    root.innerHTML = `<div class="alert error">${escapeHtml(e.message)}</div>`;
  }
}
