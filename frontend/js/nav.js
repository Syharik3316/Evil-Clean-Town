if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

async function renderNav(activePage) {
  const mount = document.getElementById("app-nav");
  if (!mount) return;

  const links = [
    ["index.html", "Главная"],
    ["map.html", "Карта"],
    ["lessons.html", "Уроки"],
    ["events.html", "Мероприятия"],
    ["reports.html", "Репорты"],
    ["leaderboard.html", "Лидерборд"],
  ];

  let user = null;
  if (isLoggedIn()) {
    user = await currentUser();
  }

  const linkHtml = links
    .map(
      ([href, label]) =>
        `<a class="nav-link${activePage === href ? " active" : ""}" href="${href}">${label}</a>`
    )
    .join("");

  let authHtml;
  if (user) {
    let roleLink = "";
    if (user.role === "admin") {
      roleLink = `
        <a class="nav-link${activePage === "tickets.html" ? " active" : ""}" href="tickets.html">Тикеты</a>
        <a class="nav-link${activePage === "admin.html" ? " active" : ""}" href="admin.html">Статистика</a>
      `;
    } else if (user.role === "organizer") {
      roleLink = `<a class="nav-link${activePage === "organizer.html" ? " active" : ""}" href="organizer.html">Мои мероприятия</a>`;
    }
    authHtml = `
      ${roleLink}
      <a class="nav-link${activePage === "notifications.html" ? " active" : ""}" href="notifications.html" id="nav-bell">🔔<span id="nav-unread-badge" hidden></span></a>
      <a class="nav-link${activePage === "profile.html" ? " active" : ""}" href="profile.html">${escapeHtml(user.display_name)}</a>
      <span class="points-pill">${Math.round(user.points_total)} б.</span>
      <a class="nav-link" href="#" id="nav-logout">Выйти</a>
    `;
  } else {
    authHtml = `
      <a class="nav-link${activePage === "login.html" ? " active" : ""}" href="login.html">Войти</a>
      <a class="nav-link${activePage === "register.html" ? " active" : ""}" href="register.html">Регистрация</a>
    `;
  }

  mount.innerHTML = `
    <div class="nav-inner">
      <a class="nav-brand" href="index.html">🌊 Чистый берег</a>
      ${linkHtml}
      ${authHtml}
    </div>
  `;

  const logoutBtn = document.getElementById("nav-logout");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      clearTokens();
      window.location.href = "index.html";
    });
  }

  if (user) {
    try {
      const { count } = await api.get("/notifications/unread-count");
      const badge = document.getElementById("nav-unread-badge");
      if (badge && count > 0) {
        badge.hidden = false;
        badge.textContent = ` ${count}`;
      }
    } catch (e) {
      /* тихо игнорируем — колокольчик просто без счётчика */
    }
  }
}
