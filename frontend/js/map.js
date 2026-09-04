let leafletMap = null;
let currentOverlay = null;
let currentLayers = [];

function initMap() {
  leafletMap = L.map("map").setView([45, 37], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(leafletMap);

  const select = document.getElementById("site-select");
  const slider = document.getElementById("layer-slider");

  select.addEventListener("change", () => loadSite(select.value));
  slider.addEventListener("input", () => showLayer(parseInt(slider.value, 10)));

  loadSites();
}

async function loadSites() {
  const select = document.getElementById("site-select");
  try {
    const sites = await api.get("/sites");
    select.innerHTML = sites.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
    if (sites.length) loadSite(sites[0].id);
  } catch (e) {
    select.innerHTML = "<option>Не удалось загрузить участки</option>";
  }
}

async function loadSite(siteId) {
  const site = await api.get(`/sites/${siteId}`);
  document.getElementById("site-description").textContent = site.description || "";
  currentLayers = site.layers || [];

  const slider = document.getElementById("layer-slider");
  slider.max = Math.max(currentLayers.length - 1, 0);
  slider.value = 0;

  if (!currentLayers.length) {
    document.getElementById("slider-label").textContent = "Для этого участка пока нет снимков";
    if (currentOverlay) {
      leafletMap.removeLayer(currentOverlay);
      currentOverlay = null;
    }
    leafletMap.setView([site.lat, site.lon], 13);
    return;
  }

  showLayer(0);
}

function showLayer(index) {
  const layer = currentLayers[index];
  if (!layer) return;

  document.getElementById("slider-label").textContent = `${layer.label} (${layer.captured_at})`;

  const bounds = layer.bounds;
  if (currentOverlay) leafletMap.removeLayer(currentOverlay);
  currentOverlay = L.imageOverlay(layer.image_url, bounds).addTo(leafletMap);
  leafletMap.fitBounds(bounds);
}
