/* The rail globe.
 *
 * It answers one question while you read: where is this coming from. Every
 * scrollable block in the edition carries a data-geo point and a country code,
 * the globe turns to whichever block is nearest the top of the viewport, and
 * that country is filled in the accent colour. Scrolling the briefing walks
 * around the world in the order the editor put the stories in.
 *
 * Drawn on a canvas with an orthographic projection -- no mapping library, and
 * no third-party request: the shapes come from assets/globe-land.js, which is
 * baked from Natural Earth by scripts/build-globe-land.py in the automation
 * repo. The whole thing is decorative, so every failure path ends with the
 * canvas hidden rather than with a broken page.
 */
(function () {
  "use strict";

  var root = document.querySelector("[data-globe]");
  if (!root || !window.__GLOBE_LAND__) return;

  var canvas = root.querySelector("canvas");
  var nameEl = root.querySelector("[data-globe-name]");
  var context = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!context) { root.hidden = true; return; }

  var DATA = window.__GLOBE_LAND__;
  var COUNTRIES = DATA.countries || [];
  var GROUPS = DATA.groups || {};
  var Q = DATA.q || 1;
  var RAD = Math.PI / 180;

  /* Read the palette off the page rather than repeating it here, so the globe
     moves with config/art-effect.json like everything else on the site. */
  var css = getComputedStyle(document.documentElement);
  function token(name, fallback) {
    var value = css.getPropertyValue(name);
    return (value && value.trim()) || fallback;
  }
  var COLOURS = {
    ocean: token("--globe-ocean", "#0d1570"),
    land: token("--globe-land", "#a1c9ce"),
    grid: token("--globe-grid", "rgba(255,255,255,.17)"),
    edge: token("--globe-edge", "rgba(255,255,255,.35)"),
    mark: token("--globe-mark", "#fd3030")
  };

  /* Current and target camera. Longitude is unwrapped deliberately: the
     animation adds the shortest signed delta each time a new target arrives,
     so the globe always turns the short way round and never spins back across
     the Pacific to get from Tokyo to Seoul. */
  var lon = -10, lat = 25;
  var fromLon = lon, fromLat = lat, toLon = lon, toLat = lat;
  var markCode = "";
  var start = 0, duration = 0, frame = 0;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var size = 0, radius = 0, centre = 0;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    var box = canvas.getBoundingClientRect();
    size = Math.max(80, Math.round(box.width));
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    radius = size / 2 - 1;
    centre = size / 2;
    draw();
  }

  /* Orthographic projection about (lon, lat), with the far side of the sphere
     clamped onto the limb instead of discarded.
     ---------------------------------------------------------------------
     Dropping back-facing points and closing the path is what broke the first
     version: a ring that leaves the visible hemisphere and comes back -- which
     is every large landmass at the edge -- got closed with a straight chord
     across the disc, so Eurasia filled the Atlantic. Pushing an invisible
     point out to the rim at its own bearing keeps the ring continuous and
     correct, and the circular clip below trims whatever lands outside.
     out[2] carries the cosine of the angular distance, which is positive on
     the near side; the caller uses it to skip rings that are entirely behind
     the globe and to fade the marker over the rim. */
  var out = [0, 0, 0];
  function project(pointLon, pointLat) {
    var dl = (pointLon - lon) * RAD;
    var p = pointLat * RAD;
    var c = lat * RAD;
    var sinP = Math.sin(p), cosP = Math.cos(p);
    var sinC = Math.sin(c), cosC0 = Math.cos(c);
    var cosC = sinC * sinP + cosC0 * cosP * Math.cos(dl);
    var x = radius * cosP * Math.sin(dl);
    var y = -radius * (cosC0 * sinP - sinC * cosP * Math.cos(dl));
    if (cosC < 0) {
      var m = Math.sqrt(x * x + y * y) || 1e-6;
      x = x / m * radius;
      y = y / m * radius;
    }
    out[0] = centre + x;
    out[1] = centre + y;
    out[2] = cosC;
    return out;
  }

  /* One ring, one fill. Accumulating every country into a single path and
     filling once was the second bug: canvas fills nonzero, Natural Earth rings
     do not share a winding direction, and a ring clamped round the limb can
     end up enclosing half a continent -- so whatever sat inside it was punched
     out as a hole and the globe rendered inside out. Filling each ring on its
     own path cannot cancel. Two hundred-odd fills of a 208px canvas costs
     nothing at this size.

     Returns true when any part of the ring faces the viewer; a ring entirely
     on the far side has collapsed onto the rim and must not be drawn. */
  function fillRing(ring, outline) {
    var visible = false;
    context.beginPath();
    for (var i = 0; i < ring.length; i += 2) {
      var point = project(ring[i] / Q, ring[i + 1] / Q);
      if (point[2] > 0) visible = true;
      if (i === 0) context.moveTo(point[0], point[1]);
      else context.lineTo(point[0], point[1]);
    }
    if (!visible) return false;
    context.closePath();
    context.fill();
    /* The marked country is stroked as well as filled. On anything the size of
       France the stroke disappears into the fill; on Albania or Luxembourg,
       which are a pixel or less across at this size, it is the whole reason
       the country is visible at all. */
    if (outline) context.stroke();
    return true;
  }

  function fillCountries() {
    /* A flag that stands for a bloc paints every member: a brief flagged EU is
       about the Union, not about Brussels. */
    var wanted = markCode ? (GROUPS[markCode] || [markCode]) : [];
    var active = [];
    context.fillStyle = COLOURS.land;
    for (var n = 0; n < COUNTRIES.length; n++) {
      var entry = COUNTRIES[n];
      if (entry[0] && wanted.indexOf(entry[0]) !== -1) { active.push(entry); continue; }
      for (var r = 1; r < entry.length; r++) fillRing(entry[r]);
    }
    if (!active.length) return;
    /* The country the brief is about, drawn last and in the accent, so it
       reads as the answer to "where" rather than as one more coastline. */
    context.fillStyle = COLOURS.mark;
    context.strokeStyle = COLOURS.mark;
    context.lineWidth = 2;
    context.lineJoin = "round";
    for (var a = 0; a < active.length; a++) {
      for (var k = 1; k < active[a].length; k++) fillRing(active[a][k], true);
    }
  }

  function strokeMeridians() {
    context.strokeStyle = COLOURS.grid;
    context.lineWidth = 1;
    var step = 6, value, point, moved;
    function line(fixedLon, fixedLat, from, to) {
      context.beginPath();
      moved = false;
      for (value = from; value <= to; value += step) {
        point = project(fixedLon === null ? value : fixedLon, fixedLat === null ? value : fixedLat);
        /* Graticule lines are strokes, not fills, so a break at the limb is
           correct here -- there is nothing to close. */
        if (point[2] <= 0) { moved = false; continue; }
        if (moved) context.lineTo(point[0], point[1]);
        else { context.moveTo(point[0], point[1]); moved = true; }
      }
      context.stroke();
    }
    for (var a = -180; a < 180; a += 30) line(a, null, -90, 90);
    for (var b = -60; b <= 60; b += 30) line(null, b, -180, 180);
  }

  function draw() {
    if (!size) return;
    context.clearRect(0, 0, size, size);
    context.save();
    /* Everything is drawn inside the disc. The limb clamp above can push a
       vertex a fraction past the rim, and the clip is what keeps the sphere a
       clean circle rather than a circle with burrs. */
    context.beginPath();
    context.arc(centre, centre, radius, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = COLOURS.ocean;
    context.fillRect(0, 0, size, size);
    strokeMeridians();
    fillCountries();
    context.restore();
    context.strokeStyle = COLOURS.edge;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(centre, centre, radius, 0, Math.PI * 2);
    context.stroke();
  }

  function tick(now) {
    var t = duration > 0 ? Math.min(1, (now - start) / duration) : 1;
    var eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    lon = fromLon + (toLon - fromLon) * eased;
    lat = fromLat + (toLat - fromLat) * eased;
    draw();
    frame = t < 1 ? requestAnimationFrame(tick) : 0;
  }

  function turnTo(block) {
    markCode = block.code;
    if (nameEl) nameEl.textContent = block.label || "";
    /* Unwrap the target into the turn the viewer is already making, so a jump
       of 350 degrees is drawn as the 10 it really is. */
    var delta = ((block.lon - lon + 540) % 360) - 180;
    fromLon = lon;
    fromLat = lat;
    toLon = lon + delta;
    toLat = Math.max(-70, Math.min(70, block.lat));
    if (reduced) { lon = toLon; lat = toLat; draw(); return; }
    duration = 300 + Math.min(900, Math.abs(delta) * 4);
    start = performance.now();
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
  }

  /* Which block is the reader looking at: the last one whose top has passed
     the focus line a third of the way down the viewport. IntersectionObserver
     would fire per element; one cheap pass on scroll keeps the choice
     unambiguous when several blocks are on screen at once. */
  var blocks = [].slice.call(document.querySelectorAll("[data-geo]")).map(function (el) {
    var parts = String(el.getAttribute("data-geo")).split(",");
    return {
      el: el,
      lat: parseFloat(parts[0]),
      lon: parseFloat(parts[1]),
      code: el.getAttribute("data-geo-code") || "",
      label: el.getAttribute("data-geo-label") || ""
    };
  }).filter(function (b) { return isFinite(b.lat) && isFinite(b.lon); });

  if (!blocks.length) { root.hidden = true; return; }

  var currentBlock = null;
  var pending = false;

  function pick() {
    pending = false;
    var line = window.innerHeight * 0.34;
    var chosen = blocks[0];
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].el.getBoundingClientRect().top <= line) chosen = blocks[i];
      else break;
    }
    if (chosen === currentBlock) return;
    currentBlock = chosen;
    turnTo(chosen);
  }

  function onScroll() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(pick);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () { resize(); onScroll(); }, { passive: true });
  resize();
  pick();
})();
