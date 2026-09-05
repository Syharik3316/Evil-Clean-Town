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
  `;
}
