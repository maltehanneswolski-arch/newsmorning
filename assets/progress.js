/* Reading progress along the bottom edge.
 *
 * The page hides the browser's own scrollbar, so this is the only thing
 * telling you how far through the edition you are. It is deliberately dumb:
 * one element, one number, no options.
 *
 * Width rather than transform: a scaled element blurs its own edge at
 * fractional scales on some devices, and at 4px tall that is the whole bar.
 */
(function () {
  "use strict";

  var bar = document.querySelector("[data-progress]");
  if (!bar) return;
  var fill = bar.firstElementChild;
  if (!fill) return;

  var pending = false;

  function measure() {
    pending = false;
    var doc = document.documentElement;
    var travel = (doc.scrollHeight || 0) - window.innerHeight;
    if (travel <= 8) {
      /* A page that does not scroll has no progress to report, and a full bar
         on arrival reads as a broken one. */
      bar.removeAttribute("data-on");
      fill.style.width = "0%";
      return;
    }
    bar.setAttribute("data-on", "");
    var done = Math.min(1, Math.max(0, (window.scrollY || doc.scrollTop || 0) / travel));
    fill.style.width = (done * 100).toFixed(2) + "%";
  }

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(measure);
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  /* Images and the dithered art land after first paint and change the page
     height, so the travel has to be re-measured rather than taken once. */
  window.addEventListener("load", schedule);
  if (window.ResizeObserver) {
    new ResizeObserver(schedule).observe(document.documentElement);
  }
  measure();
}());
