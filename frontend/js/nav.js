if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

/* ------------------------------------------------ Web Push уведомления --- */

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

async function getPushAvailability() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || typeof Notification === "undefined") {
    return { supported: false };
  }
  if (Notification.permission === "denied") return { supported: true, blocked: true };

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return { supported: true, subscribed: true };
  } catch (e) {
    return { supported: false };
  }

  try {
    const { public_key } = await api.get("/notifications/push/public-key");
    if (!public_key) return { supported: true, configured: false };
    return { supported: true, configured: true, publicKey: public_key };
  } catch (e) {
    return { supported: false };
  }
}

async function enablePushNotifications(publicKey) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Уведомления не разрешены в браузере");

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  await api.post("/notifications/push/subscribe", sub.toJSON());
}

const NAV_LINKS_BY_ROLE = {
  guest: [
    ["/index", "Главная"],
    ["/map", "Карта ДЗЗ"],
    ["/lessons", "Уроки"],
    ["/events", "Мероприятия"],
    ["/reports", "Репорты"],
    ["/leaderboard", "Лидерборд"],
  ],
  volunteer: [
    ["/index", "Главная"],
    ["/map", "Карта ДЗЗ"],
    ["/lessons", "Уроки"],
    ["/events", "Мероприятия"],
    ["/reports", "Репорты"],
    ["/leaderboard", "Лидерборд"],
  ],
  organizer: [
    ["/index", "Главная"],
    ["/map", "Карта ДЗЗ"],
    ["/lessons", "Курсы"],
    ["/events", "Мероприятия"],
    ["/organizer", "Мои мероприятия"],
    ["/reports", "Репорты"],
    ["/leaderboard", "Лидерборд"],
  ],
  admin: [
    ["/index", "Главная"],
    ["/map", "Карта ДЗЗ"],
    ["/events", "Мероприятия"],
    ["/tickets", "Тикеты"],
    ["/admin", "Мониторинг"],
    ["/admin-sites", "Конструктор карты"],
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
    .map(([href, label]) => `<a href="${href}"${activePage === href ? ' class="active"' : ""}>${label}</a>`)
    .join("");

  let authHtml;
  if (user) {
    authHtml = `
      <span class="dropdown">
        <button id="nav-bell" type="button" aria-haspopup="true" aria-expanded="false" title="Уведомления">
          <i class="ph-duotone ph-bell" style="font-size:17px"></i><span id="nav-unread-badge" class="nav-badge" hidden></span>
        </button>
        <div class="dropdown-panel" id="nav-notif-panel">
          <div class="dropdown-panel-header">
            <span>Уведомления</span>
            <button class="btn btn-secondary btn-sm" id="nav-mark-all-read" style="padding:3px 9px;font-size:11px">Прочитать все</button>
          </div>
          <div id="nav-push-row" hidden style="padding:8px 14px;border-bottom:1px solid var(--color-divider)">
            <button class="btn btn-secondary btn-sm" id="nav-enable-push" style="width:100%">Включить уведомления на компьютере</button>
          </div>
          <div class="dropdown-panel-body" id="nav-notif-body">${skeletonLines(3)}</div>
          <div class="dropdown-panel-footer"><a href="/notifications">Показать все →</a></div>
        </div>
      </span>
      <a href="/profile"${activePage === "/profile" ? ' class="active"' : ""}>${escapeHtml(user.display_name)}</a>
      <span class="points-pill">${Math.round(user.points_total)} б.</span>
      <a href="#" id="nav-logout" title="Выйти"><i class="ph-duotone ph-sign-out" style="font-size:16px"></i></a>
    `;
  } else {
    authHtml = `
      <a href="/login"${activePage === "/login" ? ' class="active"' : ""}>Войти</a>
      <a href="/register"${activePage === "/register" ? ' class="active"' : ""}>Регистрация</a>
    `;
  }

  mount.innerHTML = `
    <div class="topbar-inner">
      <a class="topbar-brand" href="/index">
        <img class="topbar-logo" src="/logo.png" alt="GoodWill" />
      </a>
      <div class="topbar-links">${linkHtml}</div>
      <div class="topbar-links topbar-auth">${authHtml}</div>
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

  initDropdown(trigger, panel);
  let loaded = false;

  async function loadPanel() {
    body.innerHTML = skeletonLines(3);
    try {
      const notifications = await api.get("/notifications?limit=8");
      body.innerHTML = notifications.length
        ? notifications
            .map(
              (n) => `
              <div class="notification-item${n.read_at ? "" : " unread"}">
                <strong style="font-size:13.5px">${escapeHtml(n.title)}</strong>
                ${n.body ? `<p class="muted" style="margin:2px 0;font-size:12.5px">${escapeHtml(n.body)}</p>` : ""}
                <p class="muted" style="margin:2px 0 0;font-size:11.5px">${formatDate(n.created_at)}</p>
              </div>`
            )
            .join("")
        : '<p class="muted" style="padding:14px 0;font-size:13px">Уведомлений пока нет.</p>';
    } catch (e) {
      body.innerHTML = '<p class="muted" style="padding:14px 0;font-size:13px">Не удалось загрузить уведомления.</p>';
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

  const pushRow = document.getElementById("nav-push-row");
  const pushBtn = document.getElementById("nav-enable-push");
  if (pushRow && pushBtn) {
    try {
      const availability = await getPushAvailability();
      if (availability.supported && availability.configured && !availability.subscribed) {
        pushRow.hidden = false;
        pushBtn.addEventListener("click", async () => {
          pushBtn.disabled = true;
          pushBtn.textContent = "Включаем…";
          try {
            await enablePushNotifications(availability.publicKey);
            pushRow.hidden = true;
            toast("Уведомления включены", "success");
          } catch (err) {
            pushBtn.disabled = false;
            pushBtn.textContent = "Включить уведомления на компьютере";
            toast(err.message, "error");
          }
        });
      }
    } catch (e) {
      /* тихо игнорируем — просто не показываем переключатель */
    }
  }
}

function renderFooter() {
  const mount = document.getElementById("app-footer");
  if (!mount) return;
  mount.innerHTML = `
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-top">
          <span class="brand">Чистый берег</span>
          <img src="/logo.png" alt="GoodWill" class="footer-logo" />
          <span class="spacer"></span>
          <a class="btn btn-on-dark btn-sm" href="mailto:admin@syharik.ru">Связаться с нами</a>
        </div>
        <p>© 2026 GoodWill. Все права защищены. e-mail: <a href="mailto:admin@syharik.ru">admin@syharik.ru</a></p>
        <p>Проект разработан на хакатоне КосмоХакатон 2026 командой «Злая IT клиника» по мотивам кейса компании «СР Дата».</p>
        <div class="footer-partners">
          <span>Фонд защитников природы</span>
          <span>СР Дата — данные ДЗЗ</span>
          <span>Яндекс.Облако — инфраструктура</span>
          <span>Яндекс.Карты — картография</span>
          <span class="spacer"></span>
          <span>Демо-датасет снимков · PWA · 2026</span>
        </div>
      </div>
    </footer>
  `;
}
