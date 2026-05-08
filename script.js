const STORAGE_KEY = "sailTrimAdvisorScenarios";

let currentBearingSource = "manual";
let locationSuggestionTimer = null;
let currentLocationSuggestions = [];
let selectedLocation = null;

const boatProfiles = {
  masthead_cruiser: {
    label: "Masthead cruiser",
    notes: [
      "Trim the headsail first upwind, then balance with the main.",
      "Use kicker more as you bear away.",
      "Cruising rigs often reward earlier reefing for comfort and control."
    ]
  },
  fractional_rig: {
    label: "Fractional rig",
    notes: [
      "The main plays a bigger role in balance and drive.",
      "Backstay and mainsail controls usually matter more.",
      "Headsail is often less dominant than on masthead rigs."
    ]
  },
  trapper_501: {
    label: "Trapper 501",
    notes: [
      "Treat it as a masthead cruiser-racer with strong headsail influence upwind.",
      "Trim genoa first, then use the main to fine-tune helm balance.",
      "Use kicker increasingly on reaches and downwind, and reef before the helm becomes a wrestling match."
    ]
  }
};

const pointOfSailProfiles = {
  in_irons: {
    label: "In Irons",
    goal: "Recover steerage and bear away onto a sailable angle",
    main: "Ease the main and avoid trimming for drive until the boat falls onto a usable tack.",
    headsail: "Headsail may back briefly during recovery depending on manoeuvre.",
    sailShape: "Do not think about perfect sail shape yet. Think about getting the boat moving again.",
    kicker: "Kicker is not the priority here. Boat motion and steering come first.",
    watch: "Bear away, rebuild flow, and regain steerage before trimming normally."
  },
  close_hauled: {
    label: "Close-hauled",
    goal: "Point high while keeping speed",
    main: "Keep the main fairly tight with the boom near centreline.",
    headsail: "Trim jib or genoa in hard with telltales streaming.",
    sailShape: "Keep both sails relatively flat with the draft forward.",
    kicker: "Use light to moderate kicker. Upwind, mainsheet usually does most of the leech control.",
    watch: "Avoid pinching. Build speed first, then point."
  },
  close_reach: {
    label: "Close reach",
    goal: "Fast and efficient with balanced power",
    main: "Ease the mainsheet slightly from close-hauled trim.",
    headsail: "Ease the headsail a little to keep flow clean through the slot.",
    sailShape: "Use medium-flat shapes with controlled twist.",
    kicker: "Use moderate kicker as the boom goes out and mainsheet loses vertical pull.",
    watch: "This angle is fast, but over-sheeting quietly steals speed."
  },
  beam_reach: {
    label: "Beam reach",
    goal: "Maximum drive and stable power",
    main: "Ease the main well out and keep the leech working.",
    headsail: "Ease the headsail to match the apparent wind angle.",
    sailShape: "Use medium depth. Do not let the top of the main dump too much power.",
    kicker: "Use moderate to firm kicker. It matters a lot more here.",
    watch: "Watch for boom lift, heavy helm, and excess heel."
  },
  broad_reach: {
    label: "Broad reach",
    goal: "Fast reaching with control and stability",
    main: "Ease the main well out, but keep it stable rather than flogging.",
    headsail: "Ease the headsail well out. Pole or barber-hauler if available.",
    sailShape: "Use fuller shapes with supported leech tension.",
    kicker: "Use firm kicker to stop the main twisting off too much.",
    watch: "Rolling and surprise gybes get closer on this angle."
  },
  run: {
    label: "Run",
    goal: "Sail deep while keeping the rig settled",
    main: "Ease the main all the way out with care.",
    headsail: "Pole out the headsail or sail wing-on-wing if safe and appropriate.",
    sailShape: "Keep sails full and stable rather than elegant.",
    kicker: "Use firm to strong kicker. Downwind, it becomes one of the lead actors.",
    watch: "Prioritise stability and gybe prevention over pure depth."
  }
};

function isInIrons(pointOfSail) {
  return pointOfSail === "in_irons";
}

function getWindBand(knots) {
  if (knots <= 8) return "light";
  if (knots <= 16) return "moderate";
  if (knots <= 24) return "fresh";
  return "strong";
}

function getGustSpread(windSpeed, gustSpeed) {
  return Math.max(0, gustSpeed - windSpeed);
}

function normalizeDegrees(deg) {
  if (Number.isNaN(Number(deg))) return 0;
  return ((Number(deg) % 360) + 360) % 360;
}

function smallestAngleDifference(a, b) {
  const diff = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return Math.min(diff, 360 - diff);
}

function getAngleOffWind(boatBearing, windDirection) {
  return Math.round(smallestAngleDifference(boatBearing, windDirection));
}

function updatePointOfSailAngleDisplay() {
  const boatBearing = Number(document.getElementById("boatBearing").value);
  const windDirection = Number(document.getElementById("windDirection").value);
  const angleField = document.getElementById("pointOfSailAngle");

  if (Number.isNaN(boatBearing) || Number.isNaN(windDirection)) {
    angleField.value = "--";
    return;
  }

  angleField.value = `${getAngleOffWind(boatBearing, windDirection)}°`;
}

function getPointOfSailFromBearings(boatBearing, windDirection) {
  const angle = smallestAngleDifference(boatBearing, windDirection);

  if (angle <= 14) return "in_irons";
  if (angle < 45) return "close_hauled";
  if (angle < 70) return "close_reach";
  if (angle < 110) return "beam_reach";
  if (angle < 160) return "broad_reach";
  return "run";
}

function syncPointOfSailFromBearings() {
  const boatBearing = Number(document.getElementById("boatBearing").value);
  const windDirection = Number(document.getElementById("windDirection").value);

  updatePointOfSailAngleDisplay();

  if (Number.isNaN(boatBearing) || Number.isNaN(windDirection)) return;

  const pointOfSail = getPointOfSailFromBearings(boatBearing, windDirection);
  document.getElementById("pointOfSail").value = pointOfSail;
}

function degreesToCompass(deg) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const normalized = normalizeDegrees(deg);
  const index = Math.round(normalized / 22.5) % 16;
  return dirs[index];
}

function formatDirection(deg) {
  const normalized = Math.round(normalizeDegrees(deg));
  return `${normalized}° ${degreesToCompass(normalized)}`;
}

function titleCase(text) {
  return text
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function createAction(priority, control, action, detail) {
  return { priority, control, action, detail };
}

function clearFormError() {
  const existing = document.getElementById("formError");
  if (existing) existing.remove();
}

function showFormError(message) {
  clearFormError();
  const form = document.getElementById("trimForm");
  const actions = form.querySelector(".actions");
  const error = document.createElement("div");
  error.id = "formError";
  error.className = "form-error";
  error.textContent = message;
  form.insertBefore(error, actions);
}

function setLocationStatus(message) {
  document.getElementById("locationStatus").textContent = message;
}

function setBearingStatus(message) {
  document.getElementById("bearingStatus").textContent = message;
}

function hideLiveConditionsCard() {
  document.getElementById("liveConditionsCard").classList.add("hidden");
  const compass = document.getElementById("liveDirectionCompass");
  if (compass) compass.innerHTML = "";
}

function showLiveConditionsCard() {
  document.getElementById("liveConditionsCard").classList.remove("hidden");
}

function hideLocationSuggestions() {
  const box = document.getElementById("locationSuggestions");
  box.classList.add("hidden");
  box.innerHTML = "";
  currentLocationSuggestions = [];
}

function renderLocationSuggestions(results) {
  const box = document.getElementById("locationSuggestions");

  if (!results.length) {
    hideLocationSuggestions();
    return;
  }

  currentLocationSuggestions = results;

  box.innerHTML = results.map((place, index) => {
    const main = place.name || "Unknown place";
    const sub = [place.admin1, place.country].filter(Boolean).join(", ");

    return `
      <button type="button" class="suggestion-item" data-index="${index}">
        <span class="suggestion-main">${main}</span>
        <span class="suggestion-sub">${sub}</span>
      </button>
    `;
  }).join("");

  box.classList.remove("hidden");
}

async function fetchLocationSuggestions(query) {
  if (!query || query.trim().length < 2) {
    hideLocationSuggestions();
    return;
  }

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5&language=en&format=json`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      hideLocationSuggestions();
      return;
    }

    const data = await response.json();
    const results = data.results || [];
    renderLocationSuggestions(results);
  } catch {
    hideLocationSuggestions();
  }
}

async function applyLocationSuggestion(place) {
  const display = [place.name, place.admin1, place.country].filter(Boolean).join(", ");
  selectedLocation = place;
  document.getElementById("locationQuery").value = display;
  hideLocationSuggestions();
  setLocationStatus(`Selected location: ${display}`);

  await fetchLiveConditions();
}

function estimateSeaStateFromLiveData(windKnots, waveHeightMeters) {
  if (waveHeightMeters >= 1.8 || windKnots >= 24) return "rough";
  if (waveHeightMeters >= 0.6 || windKnots >= 12) return "chop";
  return "flat";
}

function estimateWindTrend(hourlyWindArray, currentIndex) {
  const now = hourlyWindArray[currentIndex] ?? null;
  const later = hourlyWindArray[currentIndex + 2] ?? null;
  if (now === null || later === null) return "steady";
  if (later >= now + 2) return "building";
  if (later <= now - 2) return "easing";
  return "steady";
}

function describeSeaState(seaState) {
  if (seaState === "flat") return "Flat";
  if (seaState === "chop") return "Slight chop";
  return "Rough";
}

function getSeaRelationship(windDirection, waveDirection) {
  const diff = smallestAngleDifference(windDirection, waveDirection);
  if (diff <= 20) return "Wind and waves aligned";
  if (diff <= 60) return "Cross sea developing";
  return "Mixed direction sea";
}

function getSeaAngleOnBoat(boatBearing, waveDirection) {
  const diff = smallestAngleDifference(boatBearing, waveDirection);
  if (diff <= 30) return "Head sea";
  if (diff <= 70) return "Forward quarter sea";
  if (diff <= 110) return "Beam sea";
  if (diff <= 150) return "Aft quarter sea";
  return "Following sea";
}

function getBearingSourceLabel(source) {
  if (source === "compass") return "Compass";
  if (source === "gps") return "GPS course";
  return "Manual";
}

function validateInput(input) {
  if (
    Number.isNaN(input.windSpeed) ||
    Number.isNaN(input.gustSpeed) ||
    Number.isNaN(input.windDirection) ||
    Number.isNaN(input.waveHeight) ||
    Number.isNaN(input.waveDirection) ||
    Number.isNaN(input.boatBearing)
  ) {
    return "Please complete all wind, wave, and bearing values.";
  }

  if (
    input.windSpeed < 0 ||
    input.gustSpeed < 0 ||
    input.waveHeight < 0
  ) {
    return "Wind and wave values cannot be negative.";
  }

  if (input.gustSpeed < input.windSpeed) {
    return "Gust speed cannot be lower than steady wind speed.";
  }

  return null;
}

async function geocodeLocation(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Could not reach geocoding service.");
  }

  const data = await response.json();
  if (!data.results || !data.results.length) {
    throw new Error("No matching location found.");
  }

  return data.results[0];
}

async function fetchForecastForLocation(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: "wind_speed_10m,wind_gusts_10m,wind_direction_10m",
    forecast_days: "2",
    timezone: "auto",
    wind_speed_unit: "kn"
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Could not fetch weather forecast.");
  }

  const data = await response.json();
  if (
    !data.hourly ||
    !data.hourly.time ||
    !data.hourly.wind_speed_10m ||
    !data.hourly.wind_gusts_10m ||
    !data.hourly.wind_direction_10m
  ) {
    throw new Error("Weather forecast data was incomplete.");
  }

  return data;
}

async function fetchMarineForecastForLocation(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: "wave_height,wave_direction",
    forecast_days: "2",
    timezone: "auto"
  });

  const response = await fetch(`https://marine-api.open-meteo.com/v1/marine?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Could not fetch marine forecast.");
  }

  const data = await response.json();
  if (
    !data.hourly ||
    !data.hourly.time ||
    !data.hourly.wave_height ||
    !data.hourly.wave_direction
  ) {
    throw new Error("Marine forecast data was incomplete.");
  }

  return data;
}

function findClosestForecastIndex(times) {
  const now = Date.now();
  let bestIndex = 0;
  let bestDiff = Infinity;

  times.forEach((timeString, index) => {
    const diff = Math.abs(new Date(timeString).getTime() - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function polarArrowPoint(cx, cy, radius, degrees) {
  const radians = (degrees - 90) * Math.PI / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians)
  };
}

function renderLiveCompass(windDirection, waveDirection, boatBearing) {
  const container = document.getElementById("liveDirectionCompass");
  if (!container) return;

  const cx = 130;
  const cy = 120;
  const windEnd = polarArrowPoint(cx, cy, 84, windDirection);
  const waveEnd = polarArrowPoint(cx, cy, 68, waveDirection);
  const boatEnd = polarArrowPoint(cx, cy, 52, boatBearing);

  const svg = `
    <svg class="compass-svg" viewBox="0 0 260 300" aria-label="Wind, wave, and boat direction compass">
      <defs>
        <marker id="windCompassArrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#8be0c8"></polygon>
        </marker>
        <marker id="waveCompassArrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#8fd3ff"></polygon>
        </marker>
        <marker id="boatCompassArrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#ffd166"></polygon>
        </marker>
      </defs>

      <circle cx="130" cy="120" r="98" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="2" />
      <circle cx="130" cy="120" r="72" fill="none" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4 6" />
      <circle cx="130" cy="120" r="46" fill="none" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4 6" />

      <text x="130" y="16" text-anchor="middle" fill="#eaf4f7" font-size="13" font-weight="700">N</text>
      <text x="130" y="242" text-anchor="middle" fill="#eaf4f7" font-size="13" font-weight="700">S</text>
      <text x="12" y="124" fill="#eaf4f7" font-size="13" font-weight="700">W</text>
      <text x="236" y="124" fill="#eaf4f7" font-size="13" font-weight="700">E</text>

      <line x1="${cx}" y1="${cy}" x2="${windEnd.x}" y2="${windEnd.y}"
            stroke="#8be0c8" stroke-width="4" marker-end="url(#windCompassArrow)" />
      <line x1="${cx}" y1="${cy}" x2="${waveEnd.x}" y2="${waveEnd.y}"
            stroke="#8fd3ff" stroke-width="4" marker-end="url(#waveCompassArrow)" />
      <line x1="${cx}" y1="${cy}" x2="${boatEnd.x}" y2="${boatEnd.y}"
            stroke="#ffd166" stroke-width="4" marker-end="url(#boatCompassArrow)" />

      <circle cx="${cx}" cy="${cy}" r="4" fill="#eaf4f7" />

      <text x="130" y="270" text-anchor="middle" fill="#a9c0c9" font-size="12">
        Wind ${formatDirection(windDirection)}
      </text>
      <text x="130" y="286" text-anchor="middle" fill="#a9c0c9" font-size="12">
        Wave ${formatDirection(waveDirection)} • Boat ${formatDirection(boatBearing)}
      </text>
    </svg>

    <div class="compass-key">
      <span class="compass-key-item"><span class="compass-dot wind"></span>Wind</span>
      <span class="compass-key-item"><span class="compass-dot wave"></span>Wave</span>
      <span class="compass-key-item"><span class="compass-dot boat"></span>Boat</span>
    </div>
  `;

  container.innerHTML = svg;
}

function updateLiveConditionsCard(placeText, timeText, windSpeed, gustSpeed, windDirection, waveHeight, waveDirection, seaState, boatBearing, bearingSource) {
  const seaRelationship = getSeaRelationship(windDirection, waveDirection);
  const seaAngle = getSeaAngleOnBoat(boatBearing, waveDirection);

  document.getElementById("liveConditionsPlace").textContent = placeText;
  document.getElementById("liveWindSpeed").textContent = `${windSpeed} kt`;
  document.getElementById("liveGustSpeed").textContent = `${gustSpeed} kt`;
  document.getElementById("liveWindDirection").textContent = formatDirection(windDirection);
  document.getElementById("liveWaveHeight").textContent = `${waveHeight.toFixed(1)} m`;
  document.getElementById("liveWaveDirection").textContent = formatDirection(waveDirection);
  document.getElementById("liveSeaState").textContent = describeSeaState(seaState);
  document.getElementById("liveBoatBearing").textContent = formatDirection(boatBearing);
  document.getElementById("liveBearingSource").textContent = `Source: ${getBearingSourceLabel(bearingSource)}`;
  document.getElementById("liveSeaRelationship").textContent = seaRelationship;
  document.getElementById("liveSeaAngle").textContent = seaAngle;
  document.getElementById("liveConditionsTime").textContent = `Forecast time: ${timeText}`;

  renderLiveCompass(windDirection, waveDirection, boatBearing);
  showLiveConditionsCard();
}

function getDeviceOrientationHeading(event) {
  if (typeof event.webkitCompassHeading === "number") {
    return normalizeDegrees(event.webkitCompassHeading);
  }

  if (typeof event.alpha === "number") {
    return normalizeDegrees(360 - event.alpha);
  }

  return null;
}

function requestCompassBearing() {
  return new Promise((resolve, reject) => {
    const finish = (heading, source) => {
      resolve({ heading: normalizeDegrees(heading), source });
    };

    const onOrientation = (event) => {
      const heading = getDeviceOrientationHeading(event);
      window.removeEventListener("deviceorientation", onOrientation);
      window.removeEventListener("deviceorientationabsolute", onOrientation);

      if (heading === null) {
        reject(new Error("Compass heading was unavailable on this device."));
        return;
      }

      finish(heading, "compass");
    };

    const tryOrientation = () => {
      window.addEventListener("deviceorientation", onOrientation, { once: true });
      window.addEventListener("deviceorientationabsolute", onOrientation, { once: true });

      setTimeout(() => {
        window.removeEventListener("deviceorientation", onOrientation);
        window.removeEventListener("deviceorientationabsolute", onOrientation);
        reject(new Error("Compass heading was not returned."));
      }, 2500);
    };

    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission()
        .then((permissionState) => {
          if (permissionState !== "granted") {
            reject(new Error("Compass permission was denied."));
            return;
          }
          tryOrientation();
        })
        .catch(() => reject(new Error("Compass permission request failed.")));
      return;
    }

    if (typeof DeviceOrientationEvent !== "undefined") {
      tryOrientation();
      return;
    }

    reject(new Error("Compass sensors are not supported in this browser."));
  });
}

function requestGpsCourseBearing() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported in this browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const heading = position.coords.heading;
        if (heading === null || Number.isNaN(heading)) {
          reject(new Error("GPS course heading is unavailable. The device may need to be moving."));
          return;
        }
        resolve({ heading: normalizeDegrees(heading), source: "gps" });
      },
      () => reject(new Error("Could not read GPS heading.")),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

async function detectBoatBearing() {
  const button = document.getElementById("detectBearingBtn");
  button.disabled = true;
  clearFormError();
  setBearingStatus("Detecting bearing...");

  try {
    let result;

    try {
      result = await requestCompassBearing();
    } catch {
      result = await requestGpsCourseBearing();
    }

    document.getElementById("boatBearing").value = Math.round(result.heading);
    currentBearingSource = result.source;
    syncPointOfSailFromBearings();
    setBearingStatus(`Bearing source: ${getBearingSourceLabel(result.source)} (${formatDirection(result.heading)}).`);
  } catch (error) {
    currentBearingSource = "manual";
    setBearingStatus("Bearing source: Manual entry.");
    showFormError(error.message || "Could not detect boat bearing.");
  } finally {
    button.disabled = false;
  }
}

async function fetchLiveConditions() {
  const button = document.getElementById("fetchConditionsBtn");
  const query = document.getElementById("locationQuery").value.trim();

  if (!query) {
    showFormError("Please enter a location before fetching conditions.");
    return;
  }

  clearFormError();
  button.disabled = true;
  setLocationStatus("Searching location and fetching live forecast...");

  try {
    let location;

    if (selectedLocation && document.getElementById("locationQuery").value.trim() === [selectedLocation.name, selectedLocation.admin1, selectedLocation.country].filter(Boolean).join(", ")) {
      location = selectedLocation;
    } else {
      location = await geocodeLocation(query);
      selectedLocation = location;
    }

    const [forecast, marine] = await Promise.all([
      fetchForecastForLocation(location.latitude, location.longitude),
      fetchMarineForecastForLocation(location.latitude, location.longitude)
    ]);

    const weatherIndex = findClosestForecastIndex(forecast.hourly.time);
    const marineIndex = findClosestForecastIndex(marine.hourly.time);

    const steadyWind = Math.round(forecast.hourly.wind_speed_10m[weatherIndex] ?? 0);
    const gustWind = Math.round(forecast.hourly.wind_gusts_10m[weatherIndex] ?? steadyWind);
    const windDirection = Math.round(forecast.hourly.wind_direction_10m[weatherIndex] ?? 0);
    const waveHeight = Number(marine.hourly.wave_height[marineIndex] ?? 0);
    const waveDirection = Math.round(marine.hourly.wave_direction[marineIndex] ?? 0);

    const correctedGust = Math.max(gustWind, steadyWind);
    const seaState = estimateSeaStateFromLiveData(steadyWind, waveHeight);
    const gustSpread = getGustSpread(steadyWind, correctedGust);

    document.getElementById("windSpeed").value = steadyWind;
    document.getElementById("gustSpeed").value = correctedGust;
    document.getElementById("windDirection").value = windDirection;
    document.getElementById("waveHeight").value = waveHeight.toFixed(1);
    document.getElementById("waveDirection").value = waveDirection;
    document.getElementById("seaState").value = seaState;
    document.getElementById("windTrend").value = estimateWindTrend(forecast.hourly.wind_speed_10m, weatherIndex);
    document.getElementById("gusty").checked = gustSpread >= 4;

    syncPointOfSailFromBearings();

    const placeParts = [location.name, location.admin1, location.country].filter(Boolean);
    const placeText = placeParts.join(", ");
    const timeText = forecast.hourly.time[weatherIndex];
    const boatBearing = Number(document.getElementById("boatBearing").value) || 0;

    setLocationStatus(`Live forecast loaded for ${placeText}.`);
    updateLiveConditionsCard(
      placeText,
      timeText,
      steadyWind,
      correctedGust,
      windDirection,
      waveHeight,
      waveDirection,
      seaState,
      boatBearing,
      currentBearingSource
    );
  } catch (error) {
    showFormError(error.message || "Could not fetch live conditions.");
    setLocationStatus("No live location selected yet.");
    hideLiveConditionsCard();
  } finally {
    button.disabled = false;
  }
}

function getBaseActions(input) {
  const actions = [];

  switch (input.pointOfSail) {
    case "in_irons":
      actions.push(
        createAction(1, "Helm", "Bear away and regain steerage", "Turn the boat onto a sailable angle before worrying about perfect trim."),
        createAction(2, "Mainsheet", "Ease", "Do not keep the main pinned while the boat is stuck head-to-wind."),
        createAction(3, "Headsail", "Use recovery trim if needed", "A backed headsail can help push the bow off depending on the manoeuvre.")
      );
      break;

    case "close_hauled":
      actions.push(
        createAction(1, "Mainsheet", "Trim in", "Bring the boom near centreline without strangling the sail."),
        createAction(2, "Headsail sheet", "Trim in", "Keep telltales flowing and the slot clean."),
        createAction(3, "Kicker / vang", "Light to moderate", "Support leech tension, but let the mainsheet do most of the upwind work.")
      );
      break;

    case "close_reach":
      actions.push(
        createAction(1, "Mainsheet", "Ease slightly", "Free the main from full upwind trim."),
        createAction(2, "Headsail sheet", "Ease slightly", "Open the slot and keep flow attached."),
        createAction(3, "Kicker / vang", "Moderate", "Control upper twist as the boom moves out.")
      );
      break;

    case "beam_reach":
      actions.push(
        createAction(1, "Mainsheet", "Ease well out", "Set the main for drive rather than pointing."),
        createAction(2, "Headsail sheet", "Ease to match", "Keep the luff full without collapsing."),
        createAction(3, "Kicker / vang", "Moderate to firm", "Stop the boom lifting and the top of the main twisting away.")
      );
      break;

    case "broad_reach":
      actions.push(
        createAction(1, "Mainsheet", "Ease well out", "Keep the main drawing and stable."),
        createAction(2, "Kicker / vang", "Firm", "Support leech tension and reduce excessive twist."),
        createAction(3, "Headsail sheet", "Ease well out", "Trim for stable flow rather than a bar-tight leech.")
      );
      break;

    case "run":
      actions.push(
        createAction(1, "Kicker / vang", "Firm to strong", "Hold boom height and keep the upper leech useful."),
        createAction(2, "Mainsheet", "Ease fully", "Let the boom out while keeping the sail stable."),
        createAction(3, "Headsail setup", "Pole out or wing-on-wing", "Use a stable downwind arrangement if safe and available.")
      );
      break;
  }

  return actions;
}

function getWindActions(input, windBand) {
  const actions = [];

  if (windBand === "light") {
    actions.push(
      createAction(4, "Outhaul", "Ease slightly", "Add a little depth for power in lighter air."),
      createAction(5, "Halyard / Cunningham", "Keep light", "Do not over-flatten the sails in soft breeze.")
    );
  }

  if (windBand === "moderate") {
    actions.push(
      createAction(4, "Outhaul", "Set medium", "Keep shape controlled without draining all the power."),
      createAction(5, "Trim mode", "Balanced", "Aim for speed first, then tidy up for angle.")
    );
  }

  if (windBand === "fresh") {
    actions.push(
      createAction(4, "Outhaul", "Tighten", "Flatten the main to reduce heel."),
      createAction(5, "Backstay", "Increase", "Reduce fullness and move draft forward if your rig allows it.")
    );
  }

  if (windBand === "strong") {
    actions.push(
      createAction(4, "Reefing", "Reef early", "Control and balance beat raw stubbornness every time."),
      createAction(5, "Outhaul / Cunningham / Backstay", "Tighten", "Flatten the sails hard and spill gust power cleanly.")
    );
  }

  return actions;
}

function getSymptomActions(input, windBand) {
  const actions = [];
  const gustSpread = getGustSpread(input.windSpeed, input.gustSpeed);

  if (input.heel === "high") {
    actions.push(
      createAction(1, "Traveller", "Lower slightly", "Reduce angle of attack without completely emptying the main."),
      createAction(2, "Outhaul", "Tighten", "Flatten the lower main and calm the boat down.")
    );

    if (windBand === "fresh" || windBand === "strong" || input.windTrend === "building") {
      actions.push(
        createAction(1, "Reefing", "Consider reef now", "The boat is already talking. Better to listen before it starts shouting.")
      );
    }
  }

  if (input.helm === "weather") {
    actions.push(
      createAction(1, "Main depower", "Depower main first", "Heavy weather helm usually means the main is driving the boat over too hard."),
      createAction(2, "Traveller", "Ease down a touch", "Reduce helm load while keeping useful shape."),
      createAction(3, "Headsail sheet", "Ease one small step if slot is tight", "Let the front of the rig breathe.")
    );
  }

  if (input.helm === "lee") {
    actions.push(
      createAction(1, "Balance", "Bring power aft carefully", "Lee helm needs balance correction, not brute force."),
      createAction(2, "Main trim", "Trim in slightly", "Add a little aft-driving force."),
      createAction(3, "Headsail", "Avoid overpowering the foretriangle", "Too much forward drive can worsen lee helm.")
    );
  }

  if (input.gusty) {
    actions.push(
      createAction(2, "Twist control", "Leave enough twist to spill gusts", "A little breathing room saves drama."),
      createAction(3, "Traveller", "Use actively", "Traveller is often kinder than big sheeting changes in gusts.")
    );
  }

  if (gustSpread >= 4) {
    actions.push(
      createAction(2, "Gust response", "Prepare to depower in gusts", "The gust range is wide enough to need active trimming rather than set-and-forget sailing."),
      createAction(3, "Twist control", "Keep enough twist to spill gusts", "Do not trap all the power high in the sail when gusts are jumping.")
    );
  }

  if (gustSpread >= 8) {
    actions.push(
      createAction(1, "Reefing", "Consider earlier reefing", "A large gap between steady wind and gusts often means reef for the gusts, not the average."),
      createAction(2, "Traveller", "Use actively in gusts", "Traveller adjustments are often smoother than large sheet dumps.")
    );
  }

  if (input.seaState === "rough") {
    actions.push(
      createAction(2, "Sail shape", "Keep a touch more depth", "In rougher water, the boat often needs punch more than knife-edge pointing."),
      createAction(3, "Steering", "Sail for speed through waves", "Foot slightly if needed instead of pinching into every lump.")
    );
  }

  if (input.seaState === "chop") {
    actions.push(
      createAction(3, "Trim mode", "Slightly more open and forgiving", "A little extra flow helps the boat stay moving through chop.")
    );
  }

  if ((input.pointOfSail === "broad_reach" || input.pointOfSail === "run") && (windBand === "fresh" || windBand === "strong")) {
    actions.push(
      createAction(1, "Gybe control", "Use a preventer if appropriate", "Downwind in breeze is where surprise tends to arrive."),
      createAction(2, "Course choice", "Consider sailing a touch hotter", "Often faster and more stable than a dead run.")
    );
  }

  return actions;
}

function getSailPlanActions(input, windBand) {
  const actions = [];

  if (input.mainsailSetup === "full" && (windBand === "fresh" || windBand === "strong")) {
    actions.push(
      createAction(2, "Main plan", "Review reefing choice", "A full main in stronger breeze is often the first suspect.")
    );
  }

  if (input.headsailSetup === "genoa_full" && (windBand === "fresh" || windBand === "strong")) {
    actions.push(
      createAction(2, "Headsail plan", "Part-furl or change down", "A large genoa in breeze can crowd the slot and load the helm.")
    );
  }

  if (input.headsailSetup === "jib" && windBand === "light") {
    actions.push(
      createAction(4, "Headsail power", "Use fuller trim", "A smaller headsail needs gentle encouragement in light air.")
    );
  }

  return actions;
}

function getBoatProfileActions(input, windBand) {
  const actions = [];

  if (input.boatProfile === "masthead_cruiser") {
    actions.push(
      createAction(2, "Rig balance", "Trim headsail first upwind", "Masthead boats often take their cue from the headsail."),
      createAction(4, "Reefing style", "Favour comfort and control", "Cruisers usually reward earlier, calmer reefing choices.")
    );
  }

  if (input.boatProfile === "fractional_rig") {
    actions.push(
      createAction(2, "Main controls", "Use main actively", "Fractional rigs often lean harder on main trim for balance."),
      createAction(4, "Backstay", "Use as a key depower tool", "Backstay changes can matter more on this rig type.")
    );
  }

  if (input.boatProfile === "trapper_501") {
    actions.push(
      createAction(2, "Headsail priority", "Trim genoa first upwind", "The Trapper 501 likes the genoa working properly before fine-tuning elsewhere."),
      createAction(3, "Main balance", "Use main to tune helm", "After the headsail is set, use the main to settle balance rather than force the boat."),
      createAction(4, "Kicker / vang", "Increase importance on reaches", "As a masthead cruiser-racer, it benefits from firmer vang support off the wind.")
    );

    if ((windBand === "fresh" || windBand === "strong") && input.helm === "weather") {
      actions.push(
        createAction(1, "Reefing", "Reef before helm gets heavy", "The Trapper 501 is happier when you act before the boat turns into a sideways argument.")
      );
    }
  }

  return actions;
}

function getUrgency(input, windBand) {
  const gustSpread = getGustSpread(input.windSpeed, input.gustSpeed);

  if (
    input.heel === "high" &&
    (windBand === "fresh" || windBand === "strong" || input.gustSpeed >= 25)
  ) {
    return { label: "High priority", className: "danger" };
  }

  if (
    input.gusty ||
    input.windTrend === "building" ||
    windBand === "fresh" ||
    gustSpread >= 6 ||
    input.seaState === "rough"
  ) {
    return { label: "Watch closely", className: "warn" };
  }

  return { label: "Routine trim", className: "safe" };
}

function getWatchNext(input, windBand) {
  const notes = [];
  const gustSpread = getGustSpread(input.windSpeed, input.gustSpeed);
  const seaRelationship = getSeaRelationship(input.windDirection, input.waveDirection);
  const seaAngle = getSeaAngleOnBoat(input.boatBearing, input.waveDirection);

  if (input.pointOfSail === "in_irons") {
    notes.push("Focus on getting the bow off the wind and restoring flow over the sails.");
    notes.push("Once the boat is moving again, the app will automatically shift to a normal point of sail.");
  }
  if (input.helm === "weather") notes.push("If helm stays heavy after depowering the main, reef sooner rather than later.");
  if (input.heel === "high") notes.push("Reduce heel before chasing more pointing angle.");
  if (input.pointOfSail === "beam_reach" || input.pointOfSail === "broad_reach") {
    notes.push("Look at the top of the main. If it is dumping too much air, add more kicker.");
  }
  if (input.pointOfSail === "run") {
    notes.push("Guard against accidental gybes and prioritise stability over sailing deepest.");
  }
  if (input.seaState !== "flat") {
    notes.push("In waves, preserve speed. A slow boat becomes a grumpy boat very quickly.");
  }
  if (input.windTrend === "building") {
    notes.push("Conditions are rising. Set up early rather than trimming reactively later.");
  }
  if (windBand === "light") {
    notes.push("Avoid overtrimming. In light air, kindness beats force.");
  }
  if (gustSpread >= 6) {
    notes.push("The gust spread is significant. Trim for the gusts, not just the average wind.");
  }
  if (input.waveHeight >= 1.8) {
    notes.push("Wave height is substantial. Keep the boat moving and avoid over-pointing into the sea state.");
  }

  notes.push(`${seaRelationship}.`);
  notes.push(`Relative to the boat, the waves are a ${seaAngle.toLowerCase()}.`);

  return notes;
}

function sortAndDeduplicate(actions) {
  const seen = new Set();

  return actions
    .sort((a, b) => a.priority - b.priority)
    .filter((action) => {
      const key = `${action.control}|${action.action}|${action.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildRecommendation(input) {
  const profile = pointOfSailProfiles[input.pointOfSail];
  const boatProfile = boatProfiles[input.boatProfile];
  const windBand = getWindBand(input.windSpeed);
  const gustSpread = getGustSpread(input.windSpeed, input.gustSpeed);
  const urgency = getUrgency(input, windBand);
  const seaRelationship = getSeaRelationship(input.windDirection, input.waveDirection);
  const seaAngle = getSeaAngleOnBoat(input.boatBearing, input.waveDirection);

  const actions = sortAndDeduplicate([
    ...getBaseActions(input),
    ...getWindActions(input, windBand),
    ...getSymptomActions(input, windBand),
    ...getSailPlanActions(input, windBand),
    ...getBoatProfileActions(input, windBand)
  ]);

  const reasoning = [
    `Goal for this point of sail: ${profile.goal}.`,
    `Base trim: ${profile.main} ${profile.headsail}`,
    `Shape target: ${profile.sailShape}`,
    `Kicker note: ${profile.kicker}`,
    `Live wind direction: ${formatDirection(input.windDirection)}.`,
    `Wave direction: ${formatDirection(input.waveDirection)}.`,
    `Wave height: ${input.waveHeight.toFixed(1)} m.`,
    `Boat bearing: ${formatDirection(input.boatBearing)}.`,
    `Angle off the wind: ${getAngleOffWind(input.boatBearing, input.windDirection)}°.`,
    `Sea relationship: ${seaRelationship}.`,
    `Sea on boat: ${seaAngle}.`
  ];

  if (windBand === "light") reasoning.push("Wind strength is light, so preserve power and avoid over-flattening.");
  if (windBand === "moderate") reasoning.push("Wind strength is moderate, so aim for balanced power and clean flow.");
  if (windBand === "fresh") reasoning.push("Wind strength is fresh, so depowering and balance move higher up the ladder.");
  if (windBand === "strong") reasoning.push("Wind strength is strong, so control, reefing, and reduced heel take priority.");

  if (gustSpread >= 4) {
    reasoning.push(`Gust spread is ${gustSpread} kt, so the boat will need more active trimming through gusts.`);
  }

  if (gustSpread >= 8) {
    reasoning.push("The gust range is large enough that you should think about reefing and depowering for the gusts, not just the average wind.");
  }

  if (input.seaState === "rough") {
    reasoning.push("Sea state is rough enough that speed and control matter more than chasing angle.");
  }

  if (isInIrons(input.pointOfSail)) {
    reasoning.push("The boat is effectively too close to head-to-wind to generate proper sail drive.");
    reasoning.push("Recovery comes before trim. Bear away, rebuild flow, then trim once steerage returns.");
  }

  return {
    profile,
    boatProfile,
    windBand,
    gustSpread,
    urgency,
    actions,
    reasoning,
    watchNext: getWatchNext(input, windBand)
  };
}

function renderActionCards(actions) {
  return actions.slice(0, 6).map((action, index) => `
    <div class="action-card">
      <div class="action-card-top">
        <div class="action-control">${action.control}</div>
        <div class="action-priority">Step ${index + 1}</div>
      </div>
      <div class="action-main">${action.action}</div>
      <div class="action-detail">${action.detail}</div>
    </div>
  `).join("");
}

function renderNoteCards(recommendation, input) {
  return `
    <div class="note-grid">
      <div class="note-card">
        <h4>Point of sail angle</h4>
        <p>${getAngleOffWind(input.boatBearing, input.windDirection)}° off the wind.</p>
      </div>
      <div class="note-card">
        <h4>Main trim</h4>
        <p>${recommendation.profile.main}</p>
      </div>
      <div class="note-card">
        <h4>Headsail trim</h4>
        <p>${recommendation.profile.headsail}</p>
      </div>
      <div class="note-card">
        <h4>Sail shape</h4>
        <p>${recommendation.profile.sailShape}</p>
      </div>
      <div class="note-card">
        <h4>Kicker / vang</h4>
        <p>${recommendation.profile.kicker}</p>
      </div>
      <div class="note-card">
        <h4>Wind direction</h4>
        <p>${formatDirection(input.windDirection)}</p>
      </div>
      <div class="note-card">
        <h4>Wave picture</h4>
        <p>${input.waveHeight.toFixed(1)} m from ${formatDirection(input.waveDirection)}. Sea state: ${describeSeaState(input.seaState)}.</p>
      </div>
      <div class="note-card">
        <h4>Boat bearing</h4>
        <p>${formatDirection(input.boatBearing)} (${getBearingSourceLabel(currentBearingSource)})</p>
      </div>
      <div class="note-card">
        <h4>Sea relationship</h4>
        <p>${getSeaRelationship(input.windDirection, input.waveDirection)}. Relative to the boat: ${getSeaAngleOnBoat(input.boatBearing, input.waveDirection)}.</p>
      </div>
    </div>
  `;
}

function getDiagramConfig(pointOfSail) {
  const configs = {
    in_irons: {
      label: "In Irons",
      boomAngle: 8,
      jibAngle: 6,
      windFrom: 0,
      caption: "The boat is too close to head-to-wind to generate proper drive. Recover steerage first."
    },
    close_hauled: {
      label: "Close-hauled",
      boomAngle: 18,
      jibAngle: 14,
      windFrom: 320,
      caption: "Sails are trimmed fairly tight. Flat shape and modest vang support."
    },
    close_reach: {
      label: "Close reach",
      boomAngle: 32,
      jibAngle: 24,
      windFrom: 300,
      caption: "Main and headsail eased a little. Controlled power with moderate twist."
    },
    beam_reach: {
      label: "Beam reach",
      boomAngle: 58,
      jibAngle: 45,
      windFrom: 270,
      caption: "Boom and headsail eased well. Vang becomes more important to support the leech."
    },
    broad_reach: {
      label: "Broad reach",
      boomAngle: 78,
      jibAngle: 66,
      windFrom: 225,
      caption: "Sails are fuller and more open. Keep the main stable and supported."
    },
    run: {
      label: "Run",
      boomAngle: 92,
      jibAngle: 86,
      windFrom: 180,
      caption: "Deep downwind trim. Stability matters more than elegance. Stronger vang support helps."
    }
  };

  return configs[pointOfSail] || configs.close_hauled;
}

function polarPoint(cx, cy, radius, degrees) {
  const radians = (degrees - 90) * Math.PI / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians)
  };
}

function renderDiagram(pointOfSail) {
  const config = getDiagramConfig(pointOfSail);
  const container = document.getElementById("diagramInner");
  if (!container) return;

  const cx = 170;
  const cy = 170;
  const mastTop = { x: 170, y: 120 };
  const mastBase = { x: 170, y: 190 };

  const boomEnd = polarPoint(mastBase.x, mastBase.y, 92, 180 - config.boomAngle);
  const jibClew = polarPoint(170, 145, 70, 180 - config.jibAngle);
  const windStart = polarPoint(cx, cy, 132, config.windFrom);
  const windMid = polarPoint(cx, cy, 82, config.windFrom);

  const svg = `
    <svg viewBox="0 0 340 340" width="100%" height="100%" aria-label="Sail trim diagram">
      <defs>
        <marker id="windArrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#8be0c8"></polygon>
        </marker>
      </defs>

      <circle cx="170" cy="170" r="132" fill="none" stroke="rgba(255,255,255,0.08)" stroke-dasharray="5 7"/>
      <circle cx="170" cy="170" r="82" fill="none" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4 6"/>

      <text x="170" y="26" text-anchor="middle" fill="#a9c0c9" font-size="12">Bow</text>
      <text x="170" y="334" text-anchor="middle" fill="#a9c0c9" font-size="12">Stern</text>
      <text x="14" y="174" fill="#a9c0c9" font-size="12">Port</text>
      <text x="296" y="174" fill="#a9c0c9" font-size="12">Starboard</text>

      <line x1="${windStart.x}" y1="${windStart.y}" x2="${windMid.x}" y2="${windMid.y}"
            stroke="#8be0c8" stroke-width="4" marker-end="url(#windArrow)" />
      <text x="${windStart.x + 8}" y="${windStart.y - 8}" fill="#8be0c8" font-size="12">Wind</text>

      <path d="M170 60
               C188 82, 198 110, 198 170
               C198 230, 188 258, 170 280
               C152 258, 142 230, 142 170
               C142 110, 152 82, 170 60 Z"
            fill="#dceff4" fill-opacity="0.9" stroke="#0b1720" stroke-width="2"/>

      <line x1="${mastTop.x}" y1="${mastTop.y}" x2="${mastBase.x}" y2="${mastBase.y}" stroke="#0b1720" stroke-width="4"/>

      <polygon points="170,120 170,190 ${boomEnd.x},${boomEnd.y}"
               fill="rgba(86,194,163,0.35)"
               stroke="#56c2a3"
               stroke-width="2"/>

      <polygon points="170,120 170,145 ${jibClew.x},${jibClew.y}"
               fill="rgba(139,224,200,0.22)"
               stroke="#8be0c8"
               stroke-width="2"/>

      <line x1="170" y1="190" x2="${boomEnd.x}" y2="${boomEnd.y}" stroke="#56c2a3" stroke-width="3"/>
      <line x1="170" y1="145" x2="${jibClew.x}" y2="${jibClew.y}" stroke="#8be0c8" stroke-width="3"/>

      <circle cx="170" cy="190" r="4" fill="#56c2a3"/>
      <circle cx="170" cy="145" r="4" fill="#8be0c8"/>

      <text x="170" y="315" text-anchor="middle" fill="#eaf4f7" font-size="14" font-weight="700">${config.label}</text>
    </svg>
  `;

  container.innerHTML = svg;
}

function renderResults(recommendation, input) {
  const results = document.getElementById("results");

  const reasoningItems = recommendation.reasoning
    .map((item) => `<li>${item}</li>`)
    .join("");

  const boatNotes = recommendation.boatProfile.notes
    .map((item) => `<li>${item}</li>`)
    .join("");

  const watchItems = recommendation.watchNext.length
    ? recommendation.watchNext.map((item) => `<li>${item}</li>`).join("")
    : "<li>Keep checking helm balance, heel, and sail flow after each change.</li>";

  const diagramConfig = getDiagramConfig(input.pointOfSail);

  results.innerHTML = `
    <div class="summary-cards">
      <div class="mini-card">
        <div class="label">Boat profile</div>
        <div class="value">${recommendation.boatProfile.label}</div>
      </div>
      <div class="mini-card">
        <div class="label">Point of sail</div>
        <div class="value">${recommendation.profile.label}</div>
      </div>
      <div class="mini-card">
        <div class="label">Angle off wind</div>
        <div class="value">${getAngleOffWind(input.boatBearing, input.windDirection)}°</div>
      </div>
      <div class="mini-card">
        <div class="label">Steady / gust</div>
        <div class="value">${input.windSpeed} / ${input.gustSpeed} kt</div>
      </div>
    </div>

    <div class="pill ${recommendation.urgency.className}">${recommendation.urgency.label}</div>

    <div class="section">
      <h3>Visual trim diagram</h3>
      <div class="diagram-card">
        <div class="diagram-wrap" id="diagramInner"></div>
        <div class="diagram-caption">${diagramConfig.caption}</div>
      </div>
    </div>

    <div class="section">
      <h3>Best actions now</h3>
      <div class="action-grid">
        ${renderActionCards(recommendation.actions)}
      </div>
    </div>

    <div class="section">
      <h3>Trim picture</h3>
      ${renderNoteCards(recommendation, input)}
    </div>

    <div class="section">
      <h3>Why</h3>
      <ul class="result-list">${reasoningItems}</ul>
    </div>

    <div class="section">
      <h3>${recommendation.boatProfile.label} notes</h3>
      <ul class="result-list">${boatNotes}</ul>
    </div>

    <div class="section">
      <h3>Watch next</h3>
      <ul class="result-list">${watchItems}</ul>
    </div>

    <div class="footer-tip">
      <strong>Trim memory card:</strong>
      upwind tends toward flat and tidy,
      reaching wants power with control,
      and downwind wants fuller sails with stronger vang support.
      In building breeze, reefing early is often the smartest move.
    </div>

    <div class="disclaimer">
      This app gives practical starting advice, not gospel carved into a boom.
      Use judgment for your boat, crew, sea room, and conditions.
    </div>
  `;

  renderDiagram(input.pointOfSail);
}

function getFormInput() {
  return {
    boatProfile: document.getElementById("boatProfile").value,
    pointOfSail: document.getElementById("pointOfSail").value,
    windSpeed: Number(document.getElementById("windSpeed").value),
    gustSpeed: Number(document.getElementById("gustSpeed").value),
    windDirection: Number(document.getElementById("windDirection").value),
    waveHeight: Number(document.getElementById("waveHeight").value),
    waveDirection: Number(document.getElementById("waveDirection").value),
    boatBearing: Number(document.getElementById("boatBearing").value),
    windTrend: document.getElementById("windTrend").value,
    seaState: document.getElementById("seaState").value,
    heel: document.getElementById("heel").value,
    helm: document.getElementById("helm").value,
    mainsailSetup: document.getElementById("mainsailSetup").value,
    headsailSetup: document.getElementById("headsailSetup").value,
    gusty: document.getElementById("gusty").checked,
    locationQuery: document.getElementById("locationQuery").value.trim(),
    bearingSource: currentBearingSource
  };
}

function setFormInput(data) {
  document.getElementById("boatProfile").value = data.boatProfile;
  document.getElementById("pointOfSail").value = data.pointOfSail;
  document.getElementById("windSpeed").value = data.windSpeed;
  document.getElementById("gustSpeed").value = data.gustSpeed ?? data.windSpeed;
  document.getElementById("windDirection").value = data.windDirection ?? 240;
  document.getElementById("waveHeight").value = data.waveHeight ?? 0.8;
  document.getElementById("waveDirection").value = data.waveDirection ?? 250;
  document.getElementById("boatBearing").value = data.boatBearing ?? 120;
  document.getElementById("windTrend").value = data.windTrend;
  document.getElementById("seaState").value = data.seaState;
  document.getElementById("heel").value = data.heel;
  document.getElementById("helm").value = data.helm;
  document.getElementById("mainsailSetup").value = data.mainsailSetup;
  document.getElementById("headsailSetup").value = data.headsailSetup;
  document.getElementById("gusty").checked = data.gusty;
  document.getElementById("locationQuery").value = data.locationQuery ?? "";
  currentBearingSource = data.bearingSource ?? "manual";
  syncPointOfSailFromBearings();
  setBearingStatus(`Bearing source: ${getBearingSourceLabel(currentBearingSource)}.`);
}

function loadScenarios() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveScenarios(scenarios) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
}

function scenarioTitle(data) {
  const locationText = data.locationQuery ? ` • ${data.locationQuery}` : "";
  return `${boatProfiles[data.boatProfile].label}${locationText} • ${titleCase(data.pointOfSail)} • ${data.windSpeed} kt steady, ${data.gustSpeed ?? data.windSpeed} kt gusts`;
}

function renderSavedScenarios() {
  const container = document.getElementById("savedScenarios");
  const scenarios = loadScenarios();

  if (!scenarios.length) {
    container.className = "saved-list empty-state";
    container.innerHTML = "No saved scenarios yet.";
    return;
  }

  container.className = "saved-list";
  container.innerHTML = scenarios
    .map((scenario, index) => `
      <div class="saved-item">
        <div class="saved-item-title">${scenarioTitle(scenario)}</div>
        <div class="saved-item-meta">
          ${titleCase(scenario.windTrend)} wind, ${titleCase(scenario.seaState)} sea, ${titleCase(scenario.heel)} heel,
          ${titleCase(scenario.helm)} helm, ${scenario.gusty ? "gusty" : "not gusty"}
        </div>
        <div class="saved-item-actions">
          <button type="button" class="btn-secondary" onclick="loadScenario(${index})">Load</button>
          <button type="button" class="btn-secondary" onclick="deleteScenario(${index})">Delete</button>
        </div>
      </div>
    `)
    .join("");
}

function saveCurrentScenario() {
  const data = getFormInput();
  const scenarios = loadScenarios();
  scenarios.unshift(data);
  saveScenarios(scenarios.slice(0, 8));
  renderSavedScenarios();
}

function loadScenario(index) {
  const scenarios = loadScenarios();
  const scenario = scenarios[index];
  if (!scenario) return;

  setFormInput(scenario);
  clearFormError();

  if (scenario.locationQuery) {
    setLocationStatus(`Loaded saved scenario for ${scenario.locationQuery}.`);
  } else {
    setLocationStatus("Loaded saved scenario with manual conditions.");
  }

  updateLiveConditionsCard(
    scenario.locationQuery || "Saved scenario",
    "Saved values",
    scenario.windSpeed,
    scenario.gustSpeed ?? scenario.windSpeed,
    scenario.windDirection ?? 240,
    Number(scenario.waveHeight ?? 0.8),
    scenario.waveDirection ?? 250,
    scenario.seaState ?? "chop",
    scenario.boatBearing ?? 120,
    scenario.bearingSource ?? "manual"
  );

  const payload = {
    ...scenario,
    boatBearing: scenario.boatBearing ?? 120,
    pointOfSail: getPointOfSailFromBearings(scenario.boatBearing ?? 120, scenario.windDirection ?? 240)
  };

  document.getElementById("pointOfSail").value = payload.pointOfSail;
  updatePointOfSailAngleDisplay();
  const recommendation = buildRecommendation(payload);
  renderResults(recommendation, payload);
}

function deleteScenario(index) {
  const scenarios = loadScenarios();
  scenarios.splice(index, 1);
  saveScenarios(scenarios);
  renderSavedScenarios();
}

function clearScenarios() {
  localStorage.removeItem(STORAGE_KEY);
  renderSavedScenarios();
}

document.getElementById("fetchConditionsBtn").addEventListener("click", async function () {
  await fetchLiveConditions();
});

document.getElementById("detectBearingBtn").addEventListener("click", async function () {
  await detectBoatBearing();

  if (!document.getElementById("liveConditionsCard").classList.contains("hidden")) {
    const input = getFormInput();
    updateLiveConditionsCard(
      document.getElementById("liveConditionsPlace").textContent || "Live conditions",
      document.getElementById("liveConditionsTime").textContent.replace("Forecast time: ", "") || "Current",
      input.windSpeed,
      input.gustSpeed,
      input.windDirection,
      input.waveHeight,
      input.waveDirection,
      input.seaState,
      input.boatBearing,
      currentBearingSource
    );
  }
});

document.getElementById("boatBearing").addEventListener("input", function () {
  currentBearingSource = "manual";
  setBearingStatus("Bearing source: Manual entry.");
  syncPointOfSailFromBearings();

  if (!document.getElementById("liveConditionsCard").classList.contains("hidden")) {
    const input = getFormInput();
    updateLiveConditionsCard(
      document.getElementById("liveConditionsPlace").textContent || "Live conditions",
      document.getElementById("liveConditionsTime").textContent.replace("Forecast time: ", "") || "Current",
      input.windSpeed,
      input.gustSpeed,
      input.windDirection,
      input.waveHeight,
      input.waveDirection,
      input.seaState,
      input.boatBearing,
      currentBearingSource
    );
  }
});

document.getElementById("windDirection").addEventListener("input", function () {
  syncPointOfSailFromBearings();

  if (!document.getElementById("liveConditionsCard").classList.contains("hidden")) {
    const input = getFormInput();
    updateLiveConditionsCard(
      document.getElementById("liveConditionsPlace").textContent || "Live conditions",
      document.getElementById("liveConditionsTime").textContent.replace("Forecast time: ", "") || "Current",
      input.windSpeed,
      input.gustSpeed,
      input.windDirection,
      input.waveHeight,
      input.waveDirection,
      input.seaState,
      input.boatBearing,
      currentBearingSource
    );
  }
});

document.getElementById("locationQuery").addEventListener("input", function (event) {
  const query = event.target.value;
  selectedLocation = null;

  clearTimeout(locationSuggestionTimer);
  locationSuggestionTimer = setTimeout(() => {
    fetchLocationSuggestions(query);
  }, 250);
});

document.getElementById("locationQuery").addEventListener("focus", function (event) {
  const query = event.target.value;
  if (query.trim().length >= 2) {
    fetchLocationSuggestions(query);
  }
});

document.getElementById("locationSuggestions").addEventListener("click", async function (event) {
  const button = event.target.closest(".suggestion-item");
  if (!button) return;

  const index = Number(button.dataset.index);
  const place = currentLocationSuggestions[index];
  if (!place) return;

  await applyLocationSuggestion(place);
});

document.addEventListener("click", function (event) {
  const input = document.getElementById("locationQuery");
  const suggestions = document.getElementById("locationSuggestions");

  if (!input.contains(event.target) && !suggestions.contains(event.target)) {
    hideLocationSuggestions();
  }
});

document.getElementById("trimForm").addEventListener("submit", function (event) {
  event.preventDefault();

  syncPointOfSailFromBearings();

  const input = getFormInput();
  const validationError = validateInput(input);

  if (validationError) {
    showFormError(validationError);
    return;
  }

  clearFormError();
  const recommendation = buildRecommendation(input);
  renderResults(recommendation, input);
});

document.getElementById("saveScenarioBtn").addEventListener("click", function () {
  syncPointOfSailFromBearings();

  const input = getFormInput();
  const validationError = validateInput(input);

  if (validationError) {
    showFormError(validationError);
    return;
  }

  clearFormError();
  saveCurrentScenario();
});

document.getElementById("resetBtn").addEventListener("click", function () {
  document.getElementById("trimForm").reset();
  document.getElementById("windSpeed").value = 14;
  document.getElementById("gustSpeed").value = 18;
  document.getElementById("windDirection").value = 240;
  document.getElementById("waveHeight").value = 0.8;
  document.getElementById("waveDirection").value = 250;
  document.getElementById("boatBearing").value = 120;
  document.getElementById("heel").value = "medium";
  document.getElementById("helm").value = "weather";

  currentBearingSource = "manual";
  selectedLocation = null;
  syncPointOfSailFromBearings();
  clearFormError();
  setLocationStatus("No live location selected yet.");
  setBearingStatus("Bearing source: Manual entry.");
  hideLiveConditionsCard();
  hideLocationSuggestions();

  document.getElementById("results").innerHTML =
    'Search a location or enter the conditions manually, then click <strong>Get trim advice</strong>.';
});

document.getElementById("clearScenariosBtn").addEventListener("click", function () {
  clearScenarios();
});

renderSavedScenarios();
hideLiveConditionsCard();
hideLocationSuggestions();
syncPointOfSailFromBearings();
setBearingStatus("Bearing source: Manual entry.");