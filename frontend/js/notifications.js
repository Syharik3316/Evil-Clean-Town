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
  root.innerHTML = skeletonLines(5);
  try {
    const notifications = await api.get("/notifications");
    if (!notifications.length) {
      root.innerHTML = '<p class="muted" style="border-top:1px solid var(--color-divider);padding-top:20px">Уведомлений пока нет.</p>';
      return;
    }
    root.innerHTML = notifications
      .map(
        (n) => `
        <div class="notification-item${n.read_at ? "" : " unread"}" id="notif-${n.id}">
          <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
            <strong style="font-family:var(--font-heading);font-size:15.5px">${escapeHtml(n.title)}</strong>
            <span class="muted" style="font-size:11.5px;margin-left:auto">${formatDate(n.created_at)}</span>
          </div>
          ${n.body ? `<p class="muted" style="margin:5px 0 0;font-size:13.5px">${escapeHtml(n.body)}</p>` : ""}
          ${n.read_at ? "" : `<button class="btn btn-secondary btn-sm" style="margin-top:8px" data-read="${n.id}">Отметить прочитанным</button>`}
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
