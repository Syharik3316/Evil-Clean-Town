// Ключи Яндекс.Карт — предназначены для использования в клиентском JS (ограничены по
// домену/реферу в кабинете developer.tech.yandex.ru), поэтому не являются секретом.
const YANDEX_MAPS_JS_API_KEY = "9a9b8309-667f-4680-b2dc-65b9a8e10ed8";
const YANDEX_SUGGEST_API_KEY = "07f9690d-cbd5-4aef-9abf-a899cc3b39c8";

// Grafana доступна на отдельном порту того же хоста (см. docker-compose.yml).
// Поменяйте здесь, если порт/схема встраивания Grafana в проде отличаются.
const GRAFANA_PORT = 3000;
const GRAFANA_DASHBOARD_UID = "chistybereg-activity";
