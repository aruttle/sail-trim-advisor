# Sail Trim Advisor

Sail Trim Advisor is a lightweight browser app that helps sailors turn live conditions into practical trim decisions.

It combines:
- live wind and wave forecast data
- boat bearing input or mobile auto-detect
- automatic point-of-sail calculation
- sail trim guidance for mainsheet, headsail, sail shape, reefing, and kicker / vang

The project is built with plain HTML, CSS, and JavaScript, so it is simple to run, easy to host, and free to deploy on GitHub Pages.

---

## Features

- Search for a location with autocomplete suggestions
- Pull live forecast data using Open-Meteo
- Show steady wind, gusts, wind direction, wave height, and wave direction
- Auto-calculate point of sail from boat bearing and wind direction
- Show angle off the wind
- Include **In Irons** detection
- Give practical trim advice for different sailing conditions
- Show a live wind / wave / boat direction compass
- Save and reload scenarios in local storage
- Auto-detect bearing on supported mobile devices using:
  - device compass / orientation sensors
  - GPS heading fallback where available

---

## Live Site

GitHub Pages URL:

`https://aruttle.github.io/sail-trim-advisor/`

---

## Screens and Behaviour

The app allows the user to:

1. Select or search for a sailing location
2. Fetch live weather and marine forecast data
3. Enter or auto-detect boat bearing
4. See:
   - angle off the wind
   - point of sail
   - sea relationship
   - sea angle on boat
5. Generate recommendations for:
   - mainsheet
   - headsail trim
   - sail shape
   - kicker / vang
   - reefing decisions
   - steering / balance adjustments

---

## Point of Sail Logic

The app uses the smallest angle between:

- **boat bearing**
- **wind direction**

It then classifies point of sail as:

- **0° to 14°** → In Irons
- **15° to 44°** → Close-hauled
- **45° to 69°** → Close reach
- **70° to 109°** → Beam reach
- **110° to 159°** → Broad reach
- **160°+** → Run

---

## Mobile Bearing Detection

On mobile devices, the **Auto detect bearing** button tries:

1. **Compass / orientation sensors**
2. **GPS course heading** fallback

### Notes
- Works best on supported mobile browsers over HTTPS
- May require motion/orientation permission
- GPS fallback may require the device to be moving
- The detected heading is the phone's heading, not necessarily the exact boat heading unless the phone is aligned with the boat

---

## Tech Stack

- HTML5
- CSS3
- Vanilla JavaScript
- Open-Meteo Geocoding API
- Open-Meteo Forecast API
- Open-Meteo Marine API

---

## Project Structure

```text
sail-trim-advisor/
├── index.html
├── style.css
├── script.js
└── README.md