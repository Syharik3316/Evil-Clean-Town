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
    const adminLink =
      user.role === "admin" || user.role === "organizer"
        ? `<a class="nav-link${activePage === "admin.html" ? " active" : ""}" href="admin.html">Админ</a>`
        : "";
    authHtml = `
      ${adminLink}
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
}
