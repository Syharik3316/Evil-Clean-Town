/* ============================================================================
   Единая обёртка над Яндекс.Картами.
   ВАЖНО: во всём проекте карты — только Яндекс (никакого OSM/Leaflet).
   Требует /js/config.js (YANDEX_MAPS_JS_API_KEY) — подключайте его раньше.
   ========================================================================== */

const YANDEX_DEFAULT_CENTER = [45.0, 37.5]; // Черноморское побережье — центр пилота
let _ymapsPromise = null;

/** Загружает API Яндекс.Карт 2.1 один раз на страницу. */
function loadYandexMaps() {
  if (_ymapsPromise) return _ymapsPromise;

  _ymapsPromise = new Promise((resolve, reject) => {
    if (window.ymaps && window.ymaps.Map) {
      window.ymaps.ready(() => resolve(window.ymaps));
      return;
    }
    const existing = document.querySelector("script[data-yandex-maps]");
    if (existing) {
      existing.addEventListener("load", () => window.ymaps.ready(() => resolve(window.ymaps)));
      existing.addEventListener("error", () => reject(new Error("Не удалось загрузить Яндекс.Карты")));
      return;
    }
    const script = document.createElement("script");
    script.dataset.yandexMaps = "1";
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_MAPS_JS_API_KEY}&lang=ru_RU`;
    script.onload = () => window.ymaps.ready(() => resolve(window.ymaps));
    script.onerror = () => reject(new Error("Не удалось загрузить Яндекс.Карты"));
    document.head.appendChild(script);
  });

  return _ymapsPromise;
}

/**
 * Создаёт карту в контейнере с id = elId.
 * Возвращает { ymaps, map } либо null, если API недоступен (в контейнер
 * подставляется человекочитаемая заглушка, страница продолжает работать).
 */
async function createYandexMap(elId, options = {}) {
  const el = typeof elId === "string" ? document.getElementById(elId) : elId;
  if (!el) return null;

  try {
    const ymaps = await loadYandexMaps();
    el.innerHTML = "";
    const map = new ymaps.Map(
      el,
      {
        center: options.center || YANDEX_DEFAULT_CENTER,
        zoom: options.zoom != null ? options.zoom : 12,
        controls: options.controls || ["zoomControl", "geolocationControl", "typeSelector", "fullscreenControl"],
      },
      { suppressMapOpenBlock: true, yandexMapDisablePoiInteractivity: true, ...(options.mapOptions || {}) }
    );
    if (options.behaviors === false) map.behaviors.disable(["scrollZoom"]);
    else map.behaviors.disable("scrollZoom"); // колесо мыши не «крадёт» скролл страницы
    return { ymaps, map };
  } catch (e) {
    el.innerHTML =
      '<div class="ymap-fallback">Карта Яндекса сейчас недоступна.<br />Проверьте подключение к сети или ключ API.</div>';
    return null;
  }
}

/** Метка мероприятия/участка с подписью. */
function addYandexPlacemark(ctx, coords, { title = "", body = "", color = "#0088b0", draggable = false } = {}) {
  if (!ctx) return null;
  const placemark = new ctx.ymaps.Placemark(
    coords,
    { balloonContentHeader: title, balloonContentBody: body, hintContent: title },
    { preset: "islands#circleIcon", iconColor: color, draggable }
  );
  ctx.map.geoObjects.add(placemark);
  return placemark;
}

/** Круг допустимого радиуса гео-чекина вокруг точки сбора. */
function addYandexRadius(ctx, coords, radiusMeters, { color = "#0088b0" } = {}) {
  if (!ctx) return null;
  const circle = new ctx.ymaps.Circle([coords, radiusMeters], {}, {
    fillColor: color + "22",
    strokeColor: color,
    strokeOpacity: 0.7,
    strokeWidth: 1,
  });
  ctx.map.geoObjects.add(circle);
  return circle;
}

/**
 * Накладывает картинку ДЗЗ (снимок участка) на карту по географическим границам.
 * bounds приходят с бэкенда в формате [[south, west], [north, east]].
 * У Яндекс.Карт нет готового ImageOverlay, поэтому позиционируем DOM-слой
 * через проекцию карты и пересчитываем его при любом изменении вида.
 */
class YandexImageOverlay {
  constructor(ctx, imageUrl, bounds, { opacity = 0.85 } = {}) {
    this.ctx = ctx;
    this.bounds = bounds;
    this.el = document.createElement("div");
    this.el.className = "ymap-overlay";
    this.el.style.opacity = String(opacity);
    this.img = document.createElement("img");
    this.img.src = imageUrl;
    this.img.alt = "Спутниковый снимок участка";
    this.el.appendChild(this.img);

    ctx.map.container.getElement().appendChild(this.el);

    this._update = () => this.update();
    ctx.map.events.add(["boundschange", "sizechange", "actiontick", "actionend", "typechange"], this._update);
    this.update();
  }

  setImage(imageUrl) {
    this.img.src = imageUrl;
  }

  setOpacity(value) {
    this.el.style.opacity = String(value);
  }

  update() {
    const map = this.ctx.map;
    const projection = map.options.get("projection");
    if (!projection) return;

    const zoom = map.getZoom();
    const size = map.container.getSize();
    // Левый верхний угол видимой области в глобальных пикселях: центр минус
    // половина контейнера. Так координаты сразу получаются относительно
    // контейнера карты, в который вложен наш DOM-слой.
    const center = projection.toGlobalPixels(map.getCenter(), zoom);
    const originX = center[0] - size[0] / 2;
    const originY = center[1] - size[1] / 2;

    const [[south, west], [north, east]] = this.bounds;
    const topLeft = projection.toGlobalPixels([north, west], zoom);
    const bottomRight = projection.toGlobalPixels([south, east], zoom);

    this.el.style.left = `${topLeft[0] - originX}px`;
    this.el.style.top = `${topLeft[1] - originY}px`;
    this.el.style.width = `${Math.max(bottomRight[0] - topLeft[0], 1)}px`;
    this.el.style.height = `${Math.max(bottomRight[1] - topLeft[1], 1)}px`;
  }

  destroy() {
    this.ctx.map.events.remove(["boundschange", "sizechange", "actiontick", "actionend", "typechange"], this._update);
    this.el.remove();
  }
}

/** Подгоняет вид карты под bounds [[south, west], [north, east]]. */
function fitYandexBounds(ctx, bounds, { zoomMargin = 20 } = {}) {
  if (!ctx) return;
  ctx.map.setBounds(bounds, { checkZoomRange: true, zoomMargin }).catch(() => {});
}

/**
 * Подгоняет вид карты под все метки. Для одной метки setBounds даёт вырожденный
 * прямоугольник и максимальный зум — поэтому ограничиваем зум сверху.
 */
function fitYandexGeoObjects(ctx, { zoomMargin = 40, maxZoom = 14 } = {}) {
  if (!ctx) return;
  const bounds = ctx.map.geoObjects.getBounds();
  if (!bounds) return;
  ctx.map.setBounds(bounds, { checkZoomRange: true, zoomMargin }).then(
    () => {
      if (ctx.map.getZoom() > maxZoom) ctx.map.setZoom(maxZoom);
    },
    () => {}
  );
}

/** Геокодирование адреса через Яндекс. Возвращает [lat, lon] либо null. */
async function geocodeYandex(text) {
  if (!text) return null;
  try {
    const ymaps = await loadYandexMaps();
    const res = await ymaps.geocode(text, { results: 1 });
    const first = res.geoObjects.get(0);
    return first ? first.geometry.getCoordinates() : null;
  } catch (e) {
    return null;
  }
}

/** Обратное геокодирование: координаты → человекочитаемый адрес. */
async function reverseGeocodeYandex(coords) {
  try {
    const ymaps = await loadYandexMaps();
    const res = await ymaps.geocode(coords, { results: 1 });
    const first = res.geoObjects.get(0);
    return first ? first.getAddressLine() : null;
  } catch (e) {
    return null;
  }
}

/** Ссылка на маршрут в Яндекс.Картах (мобильное приложение/сайт). */
function yandexRouteUrl(lat, lon) {
  return `https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=auto`;
}

/** Расстояние между двумя точками в метрах (та же формула, что и на бэкенде). */
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
