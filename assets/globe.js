/* The masthead globe.
 *
 * It answers one question while you read: where is this coming from. Every
 * scrollable block in the edition carries a data-geo point, the globe turns to
 * whichever block is nearest the top of the viewport, and the place it lands on
 * is marked and named. Scrolling the briefing spins it around the world in the
 * order the editor put the stories in.
 *
 * Drawn on a canvas with an orthographic projection -- no mapping library, and
 * no third-party request: the coastlines come from assets/globe-land.js, which
 * is baked from Natural Earth by scripts/build-globe-land.py in the automation
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

  var LAND = window.__GLOBE_LAND__;
  var RINGS = LAND.rings || [];
  var Q = LAND.q || 1;
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
  var markLon = null, markLat = null;
  var start = 0, duration = 0, frame = 0;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var size = 0, radius = 0;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    var box = canvas.getBoundingClientRect();
    size = Math.max(80, Math.round(box.width));
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    radius = size / 2 - 1;
    draw();
  }

  /* Orthographic projection about (lon, lat). Returns null for points on the
     far side of the sphere, which is what hides the back of the globe. */
  function project(pointLon, pointLat) {
    var dl = (pointLon - lon) * RAD;
    var p = pointLat * RAD;
    var c = lat * RAD;
    var cosC = Math.sin(c) * Math.sin(p) + Math.cos(c) * Math.cos(p) * Math.cos(dl);
    if (cosC < 0) return null;
    return [
      size / 2 + radius * Math.cos(p) * Math.sin(dl),
      size / 2 - radius * (Math.cos(c) * Math.sin(p) - Math.sin(c) * Math.cos(p) * Math.cos(dl))
    ];
  }

  function strokeMeridians() {
    context.strokeStyle = COLOURS.grid;
    context.lineWidth = 1;
    var step = 6;
    var a, b, value, point, moved;
    for (a = -180; a < 180; a += 30) {
      context.beginPath();
      moved = false;
      for (value = -90; value <= 90; value += step) {
        point = project(a, value);
        if (!point) { moved = false; continue; }
        if (moved) context.lineTo(point[0], point[1]); else { context.moveTo(point[0], point[1]); moved = true; }
      }
      context.stroke();
    }
    for (b = -60; b <= 60; b += 30) {
      context.beginPath();
      moved = false;
      for (value = -180; value <= 180; value += step) {
        point = project(value, b);
        if (!point) { moved = false; continue; }
        if (moved) context.lineTo(point[0], point[1]); else { context.moveTo(point[0], point[1]); moved = true; }
      }
      context.stroke();
    }
  }

  function drawLand() {
    context.fillStyle = COLOURS.land;
    for (var r = 0; r < RINGS.length; r++) {
      var ring = RINGS[r];
      context.beginPath();
      var open = false;
      for (var i = 0; i < ring.length; i += 2) {
        var point = project(ring[i] / Q, ring[i + 1] / Q);
        if (!point) {
          /* A ring that crosses the limb is closed off where it leaves, so the
             visible part still fills instead of being dropped whole. */
          if (open) { context.closePath(); context.fill(); context.beginPath(); open = false; }
          continue;
        }
        if (open) context.lineTo(point[0], point[1]);
        else { context.moveTo(point[0], point[1]); open = true; }
      }
      if (open) { context.closePath(); context.fill(); }
    }
  }

  function drawMark() {
    if (markLon === null) return;
    var point = project(markLon, markLat);
    if (!point) return;
    /* Fade the pin as it approaches the limb so it slides round the edge
       instead of blinking out. */
    var dl = (markLon - lon) * RAD;
    var p = markLat * RAD, c = lat * RAD;
    var cosC = Math.sin(c) * Math.sin(p) + Math.cos(c) * Math.cos(p) * Math.cos(dl);
    context.globalAlpha = Math.max(0, Math.min(1, cosC * 4));
    context.strokeStyle = COLOURS.mark;
    context.fillStyle = COLOURS.mark;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(point[0], point[1], 3.5, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.arc(point[0], point[1], 9, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
  }

  function draw() {
    if (!size) return;
    context.clearRect(0, 0, size, size);
    context.fillStyle = COLOURS.ocean;
    context.beginPath();
    context.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    context.fill();
    strokeMeridians();
    drawLand();
    context.strokeStyle = COLOURS.edge;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    context.stroke();
    drawMark();
  }

  function tick(now) {
    var t = duration > 0 ? Math.min(1, (now - start) / duration) : 1;
    var eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    lon = fromLon + (toLon - fromLon) * eased;
    lat = fromLat + (toLat - fromLat) * eased;
    draw();
    frame = t < 1 ? requestAnimationFrame(tick) : 0;
  }

  function turnTo(targetLon, targetLat, label) {
    markLon = targetLon;
    markLat = targetLat;
    if (nameEl) nameEl.textContent = label || "";
    /* Unwrap the target into the turn the viewer is already making, so a jump
       of 350 degrees is drawn as the 10 it really is. */
    var delta = ((targetLon - lon + 540) % 360) - 180;
    fromLon = lon;
    fromLat = lat;
    toLon = lon + delta;
    toLat = Math.max(-70, Math.min(70, targetLat));
    if (reduced) {
      lon = toLon; lat = toLat; draw();
      return;
    }
    duration = 300 + Math.min(900, Math.abs(delta) * 4);
    start = performance.now();
    if (!frame) frame = requestAnimationFrame(tick);
    else { frame = 0; frame = requestAnimationFrame(tick); }
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
    turnTo(chosen.lon, chosen.lat, chosen.label);
  }

  /* Past the masthead the globe docks into the bottom-right corner, so it is
     still on screen for the stories it is tracking. The CSS decides whether a
     dock is possible at all (three-column layouts only); here we just set the
     flag and re-measure, because docking changes the canvas size. */
  var masthead = document.querySelector(".masthead");
  var docked = false;

  function syncDock() {
    if (!masthead) return;
    var want = masthead.getBoundingClientRect().bottom < 8;
    if (want === docked) return;
    docked = want;
    root.classList.toggle("is-docked", docked);
    resize();
  }

  function onScroll() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { syncDock(); pick(); });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", function () {
    /* A window that crosses the three-column breakpoint while docked leaves
       the globe fixed over the article, so drop the flag and let the next
       scroll re-decide. */
    if (docked) { docked = false; root.classList.remove("is-docked"); }
    resize();
    onScroll();
  }, { passive: true });
  resize();
  syncDock();
  pick();
})();
