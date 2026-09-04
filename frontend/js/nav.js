if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

const NAV_LINKS_BY_ROLE = {
  guest: [
    ["/index", "Главная"],
    ["/map", "Карта"],
    ["/lessons", "Уроки"],
    ["/events", "Мероприятия"],
    ["/reports", "Репорты"],
    ["/leaderboard", "Лидерборд"],
  ],
  volunteer: [
    ["/index", "Главная"],
    ["/map", "Карта"],
    ["/lessons", "Уроки"],
    ["/events", "Мероприятия"],
    ["/reports", "Репорты"],
    ["/leaderboard", "Лидерборд"],
  ],
  organizer: [
    ["/index", "Главная"],
    ["/map", "Карта"],
    ["/lessons", "Курсы"],
    ["/organizer", "Мои мероприятия"],
    ["/reports", "Репорты"],
    ["/leaderboard", "Лидерборд"],
  ],
  admin: [
    ["/index", "Главная"],
    ["/map", "Карта"],
    ["/tickets", "Тикеты"],
    ["/admin", "Статистика"],
    ["/reports", "Репорты"],
    ["/leaderboard", "Лидерборд"],
  ],
};

async function renderNav(activePage) {
  const mount = document.getElementById("app-nav");
  if (!mount) return;

  let user = null;
  if (isLoggedIn()) {
    user = await currentUser();
  }

  const links = NAV_LINKS_BY_ROLE[user ? user.role : "guest"] || NAV_LINKS_BY_ROLE.guest;

  const linkHtml = links
    .map(
      ([href, label]) =>
        `<a class="nav-link${activePage === href ? " active" : ""}" href="${href}">${label}</a>`
    )
    .join("");

  let authHtml;
  if (user) {
    authHtml = `
      <span class="dropdown nav-bell-wrap">
        <button class="nav-link" id="nav-bell" type="button" aria-haspopup="true" aria-expanded="false">🔔<span id="nav-unread-badge" class="nav-badge" hidden></span></button>
        <div class="dropdown-panel" id="nav-notif-panel">
          <div class="dropdown-panel-header">
            <span>Уведомления</span>
            <button class="btn secondary" id="nav-mark-all-read" style="padding:2px 8px; font-size:0.78rem">Прочитать все</button>
          </div>
          <div class="dropdown-panel-body" id="nav-notif-body"><p class="muted" style="padding:10px 0">Загрузка…</p></div>
          <div class="dropdown-panel-footer"><a href="/notifications">Показать все →</a></div>
        </div>
      </span>
      <a class="nav-link${activePage === "/profile" ? " active" : ""}" href="/profile">${escapeHtml(user.display_name)}</a>
      <span class="points-pill">${Math.round(user.points_total)} б.</span>
      <a class="nav-link" href="#" id="nav-logout">Выйти</a>
    `;
  } else {
    authHtml = `
      <a class="nav-link${activePage === "/login" ? " active" : ""}" href="/login">Войти</a>
      <a class="nav-link${activePage === "/register" ? " active" : ""}" href="/register">Регистрация</a>
    `;
  }

  mount.innerHTML = `
    <div class="nav-inner">
      <a class="nav-brand" href="/index"><img src="/logo.png" alt="GoodWill" class="brand-logo" /></a>
      ${linkHtml}
      ${authHtml}
    </div>
  `;

  const logoutBtn = document.getElementById("nav-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      clearTokens();
      window.location.href = "/index";
    });
  }

  if (user) {
    initNotificationBell();
  }
}

async function initNotificationBell() {
  const trigger = document.getElementById("nav-bell");
  const panel = document.getElementById("nav-notif-panel");
  const body = document.getElementById("nav-notif-body");
  const badge = document.getElementById("nav-unread-badge");
  if (!trigger || !panel) return;

  const dropdown = initDropdown(trigger, panel);
  let loaded = false;

  async function loadPanel() {
    body.innerHTML = skeletonLines(3);
    try {
      const notifications = await api.get("/notifications?limit=8");
      body.innerHTML = notifications.length
        ? notifications
            .map(
              (n) => `
              <div class="notification-item${n.read_at ? "" : " unread"}" id="nav-notif-${n.id}" style="cursor:default">
                <strong style="font-size:0.9rem">${escapeHtml(n.title)}</strong>
                ${n.body ? `<p class="muted" style="margin:2px 0">${escapeHtml(n.body)}</p>` : ""}
                <p class="muted" style="margin:2px 0 0">${formatDate(n.created_at)}</p>
              </div>`
            )
            .join("")
        : '<p class="muted" style="padding:10px 0">Уведомлений пока нет.</p>';
    } catch (e) {
      body.innerHTML = '<p class="muted" style="padding:10px 0">Не удалось загрузить уведомления.</p>';
    }
  }

  trigger.addEventListener("click", () => {
    if (!loaded || panel.classList.contains("show")) {
      loadPanel();
      loaded = true;
    }
  });

  document.getElementById("nav-mark-all-read").addEventListener("click", async (e) => {
    e.stopPropagation();
    await api.post("/notifications/read-all");
    await loadPanel();
    if (badge) badge.hidden = true;
  });

  try {
    const { count } = await api.get("/notifications/unread-count");
    if (badge && count > 0) {
      badge.hidden = false;
      badge.textContent = count > 9 ? "9+" : String(count);
    }
  } catch (e) {
    /* тихо игнорируем — колокольчик просто без счётчика */
  }
}

function renderFooter() {
  const mount = document.getElementById("app-footer");
  if (!mount) return;
  mount.innerHTML = `
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-top">
          <img src="logo.png" alt="GoodWill" class="footer-logo" />
          <a class="btn secondary" href="mailto:admin@syharik.ru">Связаться с нами</a>
        </div>
        <p>© 2026 GoodWill. Все права защищены. e-mail: <a href="mailto:admin@syharik.ru">admin@syharik.ru</a></p>
        <p>Проект разработан на хакатоне КосмоХакатон 2026 командой «Злая IT клиника» по мотивам кейса компании «СР Дата».</p>
      </div>
    </footer>
  `;
}
