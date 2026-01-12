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
let userMarker1 = null; // First location marker
let userMarker2 = null; // Second location marker
let selectedLineId = null;
let currentFilter = 'all';
let searchTimeout1 = null;
let searchTimeout2 = null;

// DOM Elements
const lineSelect = document.getElementById('line-select');
const searchInput1 = document.getElementById('location-input-1');
const searchInput2 = document.getElementById('location-input-2');
const searchResults1 = document.getElementById('search-results-1');
const searchResults2 = document.getElementById('search-results-2');
const resetBtn1 = document.getElementById('reset-btn-1');
const resetBtn2 = document.getElementById('reset-btn-2');
const geoBtn1 = document.getElementById('geo-btn-1');
const geoBtn2 = document.getElementById('geo-btn-2');
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

            // Bind tooltip for hover (desktop)
            circleMarker.bindTooltip(station.name, {
                permanent: false,
                direction: 'top',
                className: 'station-tooltip',
                offset: [0, -5]
            });

            // Add click handler for mobile to show popup
            circleMarker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                circleMarker.bindPopup(station.name, {
                    closeButton: true,
                    autoClose: true,
                    closeOnClick: true
                }).openPopup();
            });

            // Store station data for later use
            circleMarker.stationData = station;

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
    // Ensure both search results are closed when a line is selected
    searchResults1.style.display = 'none';
    searchResults2.style.display = 'none';
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
            // Offset view on mobile
            const latLng = [station.lat, station.lng];
            const zoom = 15;

            if (window.innerWidth <= 768) {
                // Determine pixel offset based on panel height approx
                const targetPoint = map.project(latLng, zoom);
                targetPoint.y += 150; // Shift center down so point appears up
                const targetLatLng = map.unproject(targetPoint, zoom);

                map.flyTo(targetLatLng, zoom, {
                    animate: true,
                    duration: 1
                });
            } else {
                map.flyTo(latLng, zoom, {
                    animate: true,
                    duration: 1
                });
            }
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

    // === LOCATION INPUT 1 HANDLERS ===
    searchInput1.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchTimeout1);

        // Show/hide reset button
        resetBtn1.style.display = query ? 'block' : 'none';

        if (query.length < 3) {
            searchResults1.style.display = 'none';
            return;
        }
        searchTimeout1 = setTimeout(() => {
            performSearch(query, 1); // Pass input number
        }, 800);
    });

    resetBtn1.addEventListener('click', () => {
        searchInput1.value = '';
        searchResults1.style.display = 'none';
        resetBtn1.style.display = 'none';
        if (userMarker1) {
            map.removeLayer(userMarker1);
            userMarker1 = null;
        }
        calculateDistanceIfReady();
    });

    geoBtn1.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert("Tarayıcınız konum servisini desteklemiyor.");
            return;
        }
        geoBtn1.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                geoBtn1.innerHTML = '<i class="fas fa-location-arrow"></i>';
                selectLocation(pos.coords.latitude, pos.coords.longitude, "Konumunuz (Başlangıç)", 1);
            },
            (err) => {
                geoBtn1.innerHTML = '<i class="fas fa-location-arrow"></i>';
                alert("Konum alınamadı. Lütfen izinleri kontrol edin.");
            },
            { enableHighAccuracy: true }
        );
    });

    // === LOCATION INPUT 2 HANDLERS ===
    searchInput2.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchTimeout2);

        // Show/hide reset button
        resetBtn2.style.display = query ? 'block' : 'none';

        if (query.length < 3) {
            searchResults2.style.display = 'none';
            return;
        }
        searchTimeout2 = setTimeout(() => {
            performSearch(query, 2); // Pass input number
        }, 800);
    });

    resetBtn2.addEventListener('click', () => {
        searchInput2.value = '';
        searchResults2.style.display = 'none';
        resetBtn2.style.display = 'none';
        if (userMarker2) {
            map.removeLayer(userMarker2);
            userMarker2 = null;
        }
        calculateDistanceIfReady();
    });

    geoBtn2.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert("Tarayıcınız konum servisini desteklemiyor.");
            return;
        }
        geoBtn2.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                geoBtn2.innerHTML = '<i class="fas fa-location-arrow"></i>';
                selectLocation(pos.coords.latitude, pos.coords.longitude, "Konumunuz (Bitiş)", 2);
            },
            (err) => {
                geoBtn2.innerHTML = '<i class="fas fa-location-arrow"></i>';
                alert("Konum alınamadı. Lütfen izinleri kontrol edin.");
            },
            { enableHighAccuracy: true }
        );
    });

    // Simple: close search when clicking map
    map.on('click', () => {
        searchResults1.style.display = 'none';
        searchResults2.style.display = 'none'; // Force hide

        if (selectedLineId) {
            selectedLineId = null;
            lineSelect.value = "";
            highlightLine(null);
        }
    });

    map.on('dragstart', () => {
        // Hide keyboard/results on mobile map drag
        searchResults1.style.display = 'none';
        searchResults2.style.display = 'none';
    });
}

async function performSearch(query, inputNumber) {
    const searchResults = inputNumber === 1 ? searchResults1 : searchResults2;

    searchResults.style.display = 'block';
    searchResults.innerHTML = '<div class="result-item">Aranıyor...</div>';

    try {
        // Use viewbox for Istanbul boundaries instead of appending "Istanbul" text which can confuse results
        // Viewbox covering Istanbul roughly: 27.9, 40.8 to 29.9, 41.6
        const viewbox = "27.9,41.6,29.9,40.8";
        // Add accept-language=tr for Turkish results
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${viewbox}&bounded=1&limit=5&accept-language=tr`);
        const data = await response.json();

        searchResults.innerHTML = '';
        if (data.length > 0) {
            searchResults.style.display = 'block'; // Show results
            data.forEach(item => {
                const div = document.createElement('div');
                div.className = 'result-item';
                // Use display_name but maybe try to get local name if possible? Nominatim usually respects accept-language.
                div.innerHTML = `
                    <strong>${item.name || item.display_name.split(',')[0]}</strong>
                    <span class="sub">${item.display_name}</span>
                `;
                div.addEventListener('click', () => {
                    // FORCE CLOSE - use display none instead of hidden class
                    searchResults.style.display = 'none';
                    selectLocation(item.lat, item.lon, item.display_name, inputNumber);
                });
                searchResults.appendChild(div);
            });
        } else {
            searchResults.style.display = 'none';
        }
    } catch (error) {
        console.error('Arama hatası:', error);
        searchResults.innerHTML = '<div class="result-item">Hata oluştu</div>';
    }
}

function selectLocation(lat, lng, name, inputNumber) {
    const latLng = [parseFloat(lat), parseFloat(lng)];
    const searchInput = inputNumber === 1 ? searchInput1 : searchInput2;
    const searchResults = inputNumber === 1 ? searchResults1 : searchResults2;
    const resetBtn = inputNumber === 1 ? resetBtn1 : resetBtn2;

    // Determine which marker to use
    let markerRef = inputNumber === 1 ? 'userMarker1' : 'userMarker2';
    let markerColor = inputNumber === 1 ? '#28a745' : '#dc3545'; // Green for start, red for end

    // Remove old marker if exists
    if (inputNumber === 1 && userMarker1) {
        map.removeLayer(userMarker1);
    } else if (inputNumber === 2 && userMarker2) {
        map.removeLayer(userMarker2);
    }

    // Create custom icon
    const customIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: ${markerColor}; width: 24px; height: 24px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 24]
    });

    // Create marker
    const marker = L.marker(latLng, { icon: customIcon }).addTo(map);
    marker.bindPopup(`<b>${name}</b>`, {
        autoClose: true,
        closeOnClick: true
    }).openPopup();

    // Store marker
    if (inputNumber === 1) {
        userMarker1 = marker;
    } else {
        userMarker2 = marker;
    }

    // Offset view on mobile
    if (window.innerWidth <= 768) {
        const targetPoint = map.project(latLng, 14);
        targetPoint.y += 150;
        const targetLatLng = map.unproject(targetPoint, 14);
        map.setView(targetLatLng, 14);
    } else {
        map.setView(latLng, 14);
    }

    searchResults.style.display = 'none';
    searchInput.value = name;
    resetBtn.style.display = 'block'; // Show reset button
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

                    // Reset to hover-only tooltips (not permanent)
                    if (m.stationData) {
                        m.unbindTooltip();
                        m.bindTooltip(m.stationData.name, {
                            permanent: false,
                            direction: 'top',
                            className: 'station-tooltip',
                            offset: [0, -5]
                        });
                    }
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

                item.markers.forEach(m => {
                    m.setRadius(6);
                    m.bringToFront();
                    if (!map.hasLayer(m)) m.addTo(map);

                    // Show permanent station name labels when line is selected
                    if (m.stationData) {
                        m.unbindTooltip();
                        m.bindTooltip(m.stationData.name, {
                            permanent: true,  // ALWAYS VISIBLE
                            direction: 'top',
                            className: 'station-tooltip',
                            offset: [0, -8]
                        }).openTooltip();
                    }
                });

                // Smart FitBounds: Shift center up on mobile to avoid panel overlap
                const isMobile = window.innerWidth <= 768;
                const paddingOptions = isMobile
                    ? { paddingTopLeft: [20, 20], paddingBottomRight: [20, 350] } // Push content way up
                    : { padding: [50, 50] };

                map.fitBounds(item.polyline.getBounds(), paddingOptions);

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
