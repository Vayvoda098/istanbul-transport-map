// Map Initialization
const map = L.map('map', {
    zoomControl: false // Disable default zoom control
}).setView([41.0082, 28.9784], 11);

// Dark themed tile layer
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20
}).addTo(map);

// State
let allLayers = [];
let userMarker = null;
let selectedLineId = null;
let currentFilter = 'all';
let searchTimeout = null;

// DOM Elements
const lineSelect = document.getElementById('line-select');
const searchInput = document.getElementById('location-search');
const searchResults = document.getElementById('search-results');
const infoBox = document.getElementById('info-box');
const infoLineName = document.getElementById('info-line-name');
const infoDistance = document.getElementById('info-distance');
const filterButtons = document.querySelectorAll('.filter-btn');
const stationListContainer = document.getElementById('station-list-container');
const stationList = document.getElementById('station-list');

function init() {
    renderMapObjects();
    populateSelect();
    setupEventListeners();
    // Mobile Panel Toggle & Swipe
    const panelHandle = document.getElementById('panel-handle');
    const controlPanel = document.getElementById('control-panel');

    if (panelHandle && controlPanel) {
        // Toggle on click
        panelHandle.addEventListener('click', () => {
            controlPanel.classList.toggle('collapsed');
        });

        // Swipe Detection
        let startY = 0;
        let currentY = 0;

        panelHandle.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            currentY = startY;
        }, { passive: true });

        panelHandle.addEventListener('touchmove', (e) => {
            currentY = e.touches[0].clientY;
            // Optional: Real-time drag effect could go here
        }, { passive: true });

        panelHandle.addEventListener('touchend', () => {
            const diff = currentY - startY;
            const threshold = 50; // min swipe distance

            if (diff > threshold) {
                // Swiped Down -> Collapse
                controlPanel.classList.add('collapsed');
            } else if (diff < -threshold) {
                // Swiped Up -> Expand
                controlPanel.classList.remove('collapsed');
            }
        });
    }
}

function renderMapObjects() {
    // Cleanup old layers
    allLayers.forEach(l => {
        map.removeLayer(l.polyline);
        map.removeLayer(l.clickPolyline);
        l.markers.forEach(m => map.removeLayer(m));
    });
    allLayers = [];

    transportLines.forEach(line => {
        const latLngs = line.stations.map(s => [s.lat, s.lng]);

        // 1. VISUAL LINE
        const polyline = L.polyline(latLngs, {
            color: line.color,
            weight: 4,
            opacity: 0.8,
            smoothFactor: 1
        }).addTo(map);

        // 2. CLICK/HIT LINE
        const clickPolyline = L.polyline(latLngs, {
            color: 'transparent',
            weight: 20,
            opacity: 0,
            zIndexOffset: 1000
        }).addTo(map);

        // Bind Sticky Tooltip (The "Bubble" for hover)
        // We bind it to clickPolyline so it triggers easily
        clickPolyline.bindTooltip(line.name, {
            sticky: true,
            className: 'line-hover-tooltip',
            offset: [0, -10],
            direction: 'top'
        });

        // Click Handler
        clickPolyline.on('click', function (e) {
            L.DomEvent.stopPropagation(e);
            selectLine(line.id);
        });

        // Also attach to visual line to be safe
        polyline.on('click', function (e) {
            L.DomEvent.stopPropagation(e);
            selectLine(line.id);
        });

        // Hover Effects
        clickPolyline.on('mouseover', function () {
            // Prevent highlight if ANY line is currently selected
            if (selectedLineId) return;

            polyline.setStyle({ weight: 6, opacity: 1 });
        });

        clickPolyline.on('mouseout', function () {
            // Prevent style reset if ANY line is currently selected (handled by highlightLine logic)
            if (selectedLineId) return;

            polyline.setStyle({ weight: 4, opacity: 0.8 });
        });

        const markers = line.stations.map(station => {
            const circleMarker = L.circleMarker([station.lat, station.lng], {
                radius: 4,
                fillColor: "white",
                color: line.color,
                weight: 2,
                opacity: 1,
                fillOpacity: 1
            });
            circleMarker.addTo(map);
            circleMarker.bindTooltip(station.name, {
                permanent: false,
                direction: 'top',
                className: 'station-tooltip',
                offset: [0, -5]
            });
            return circleMarker;
        });

        allLayers.push({
            id: line.id,
            type: line.type,
            lineObj: line,
            polyline: polyline,
            clickPolyline: clickPolyline,
            markers: markers
        });
    });
}

function selectLine(id) {
    lineSelect.value = id;
    selectedLineId = id;
    highlightLine(selectedLineId);
    calculateDistanceIfReady();
}

function populateSelect() {
    lineSelect.innerHTML = '<option value="">Tüm Hatları Göster</option>';
    const linesToShow = currentFilter === 'all'
        ? transportLines
        : transportLines.filter(l => l.type === currentFilter);

    linesToShow.forEach(line => {
        const option = document.createElement('option');
        option.value = line.id;
        option.textContent = line.name;
        lineSelect.appendChild(option);
    });
}

function populateStationList(lineObj) {
    stationList.innerHTML = '';
    stationListContainer.classList.remove('hidden');

    lineObj.stations.forEach(station => {
        const li = document.createElement('li');
        li.textContent = station.name;
        li.style.setProperty('--primary-color', lineObj.color);

        li.addEventListener('click', () => {
            map.flyTo([station.lat, station.lng], 15, {
                animate: true,
                duration: 1
            });
        });

        stationList.appendChild(li);
    });
}

function setupEventListeners() {
    lineSelect.addEventListener('change', (e) => {
        selectLine(e.target.value);
    });

    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.type;
            applyFilter();
            lineSelect.value = "";
            selectedLineId = null;
            highlightLine(null);
            populateSelect();
        });
    });

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchTimeout);
        if (query.length < 3) {
            searchResults.classList.add('hidden');
            return;
        }
        searchTimeout = setTimeout(() => {
            performSearch(query);
        }, 800);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchResults.classList.add('hidden');
        }
    });

    map.on('click', () => {
        if (selectedLineId) {
            selectedLineId = null;
            lineSelect.value = "";
            highlightLine(null);
        }
    });

    // Geolocation Button Listener
    const geoBtn = document.getElementById('geo-btn');
    if (geoBtn) {
        geoBtn.addEventListener('click', () => {
            if (!navigator.geolocation) {
                alert("Tarayıcınız konum servisini desteklemiyor.");
                return;
            }
            geoBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    geoBtn.innerHTML = '<i class="fas fa-location-arrow"></i>';
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    selectLocation(lat, lng, "Konumunuz");
                    map.setView([lat, lng], 14);
                },
                (err) => {
                    geoBtn.innerHTML = '<i class="fas fa-location-arrow"></i>';
                    alert("Konum alınamadı. Lütfen izinleri kontrol edin.");
                },
                { enableHighAccuracy: true }
            );
        });
    }
}

async function performSearch(query) {
    searchResults.classList.remove('hidden');
    searchResults.innerHTML = '<div class="result-item">Aranıyor...</div>';

    try {
        // Use viewbox for Istanbul boundaries instead of appending "Istanbul" text which can confuse results
        // Viewbox covering Istanbul roughly: 27.9, 40.8 to 29.9, 41.6
        const viewbox = "27.9,41.6,29.9,40.8";
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${viewbox}&bounded=1&addressdetails=1&limit=5`;

        const response = await fetch(url);
        const data = await response.json();

        searchResults.innerHTML = '';
        if (data.length === 0) {
            searchResults.innerHTML = '<div class="result-item">Sonuç bulunamadı</div>';
            return;
        }

        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'result-item';

            const addr = item.address || {};
            // Prioritize specific landmark names or neighborhoods
            const title = addr.amenity || addr.tourism || addr.building || addr.shop || addr.leisure || addr.railway || addr.suburb || addr.neighbourhood || item.name || query;
            const fullDisplay = item.display_name;

            div.innerHTML = `
                <div style="font-weight:600; color:white;">${title}</div>
                <div class="sub" style="font-size:0.8rem; color:#aaa; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${fullDisplay}
                </div>
            `;

            div.addEventListener('click', () => {
                selectLocation(item.lat, item.lon, title);
            });

            searchResults.appendChild(div);
        });
    } catch (error) {
        searchResults.innerHTML = '<div class="result-item">Hata oluştu</div>';
    }
}

function selectLocation(lat, lng, name) {
    const latLng = [parseFloat(lat), parseFloat(lng)];
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker(latLng).addTo(map);
    userMarker.bindPopup(`<b>${name}</b>`).openPopup();
    map.setView(latLng, 14);
    searchResults.classList.add('hidden');
    searchInput.value = name;
    calculateDistanceIfReady();
}

function applyFilter() {
    allLayers.forEach(layer => {
        const shouldShow = currentFilter === 'all' || layer.type === currentFilter;
        if (shouldShow) {
            if (!map.hasLayer(layer.polyline)) {
                layer.polyline.addTo(map);
                layer.clickPolyline.addTo(map);
                layer.markers.forEach(m => m.addTo(map));
                // Rebind hover tooltip just in case
                if (!layer.polyline.getTooltip()) {
                    layer.clickPolyline.bindTooltip(layer.lineObj.name, {
                        sticky: true,
                        className: 'line-hover-tooltip',
                        offset: [0, -10],
                        direction: 'top'
                    });
                }
            }
        } else {
            map.removeLayer(layer.polyline);
            map.removeLayer(layer.clickPolyline);
            layer.markers.forEach(m => map.removeLayer(m));
            layer.polyline.unbindTooltip();
        }
    });
}

function highlightLine(lineId) {
    if (!lineId) {
        // Reset to default state
        allLayers.forEach(item => {
            if (currentFilter === 'all' || item.type === currentFilter) {
                // Restore styles
                item.polyline.setStyle({ opacity: 0.8, weight: 4 });
                item.clickPolyline.setStyle({ weight: 20 });
                item.markers.forEach(m => {
                    m.setRadius(4);
                    if (!map.hasLayer(m)) m.addTo(map);
                });

                // Unbind Permanent, Rebind Hover Tooltip
                item.polyline.unbindTooltip();
                item.clickPolyline.unbindTooltip();
                item.clickPolyline.bindTooltip(item.lineObj.name, {
                    sticky: true,
                    className: 'line-hover-tooltip',
                    offset: [0, -10],
                    direction: 'top'
                });
            }
        });
        infoBox.classList.add('hidden');
        stationListContainer.classList.add('hidden');
        return;
    }

    const selected = allLayers.find(p => p.id === lineId);
    if (selected) {
        allLayers.forEach(item => {
            if (item.id === lineId) {
                // Selected Line
                item.polyline.setStyle({ opacity: 1, weight: 7 });
                item.polyline.bringToFront();
                item.clickPolyline.bringToFront();

                // Remove Hover Tooltip from click layer to avoid overlap
                item.clickPolyline.unbindTooltip();

                // Add Permanent Label to Visual Line (or click line)
                item.polyline.unbindTooltip();
                item.polyline.bindTooltip(item.lineObj.name, {
                    permanent: true,
                    direction: 'center',
                    className: 'line-label-tooltip'
                }).openTooltip();

                // Markers
                item.markers.forEach(m => {
                    m.setRadius(6);
                    m.bringToFront();
                    if (!map.hasLayer(m)) m.addTo(map);
                });

                map.fitBounds(item.polyline.getBounds(), { padding: [50, 50] });

            } else {
                // Dim Others
                item.polyline.setStyle({ opacity: 0.1, weight: 3 });
                item.clickPolyline.bringToBack();
                item.markers.forEach(m => map.removeLayer(m));

                // Optionally remove tooltips from dimmed lines if they are distracting
                // Or keep them but they are invisible slightly?
                // The user said "do not light up". They didn't say "hide tooltips".
                // But usually better to hide tooltips on dimmed lines.
                item.clickPolyline.unbindTooltip();
            }
        });

        infoLineName.textContent = selected.lineObj.name;
        infoDistance.textContent = userMarker ? "Hesaplanıyor..." : "Konum arayın";
        infoBox.classList.remove('hidden');

        infoLineName.textContent = selected.lineObj.name;
        infoDistance.textContent = userMarker ? "Hesaplanıyor..." : "Konum arayın";
        infoBox.classList.remove('hidden');

        populateStationList(selected.lineObj);
    }
}

function calculateDistanceIfReady() {
    if (!userMarker || !selectedLineId) {
        if (selectedLineId) infoDistance.textContent = "Konum arayın";
        return;
    }

    const selectedPoly = allLayers.find(p => p.id === selectedLineId);
    if (!selectedPoly) return;

    const lineCoords = selectedPoly.lineObj.stations.map(s => [s.lng, s.lat]);
    const userPoint = turf.point([userMarker.getLatLng().lng, userMarker.getLatLng().lat]);
    const lineString = turf.lineString(lineCoords);
    const distanceKm = turf.pointToLineDistance(userPoint, lineString);

    let displayDist = "";
    if (distanceKm < 1) {
        displayDist = Math.round(distanceKm * 1000) + " metre";
    } else {
        displayDist = distanceKm.toFixed(2) + " km";
    }

    infoDistance.textContent = displayDist;
    infoBox.classList.remove('hidden');
}

init();
