/* Saved items.
 *
 * Bookmarks live in this origin's localStorage and nowhere else: they never
 * reach a server, never leave the browser they were made in, and do not follow
 * the reader to another device. That is the whole design -- the site is static
 * files on Pages, there is no account to hang a bookmark off, and the reader
 * is one person.
 *
 * Every read and write is wrapped, because localStorage is not merely empty in
 * a private window or with site data blocked -- accessing it throws. The save
 * buttons therefore ship hidden in the HTML and are only revealed after a real
 * round trip through storage succeeds, so the page never offers an action that
 * silently does nothing.
 *
 * Each saved item carries its own title and an excerpt, rather than a pointer
 * to be resolved later. An edition page can be republished and a brief can
 * move or be reworded; a bookmark that stored only a URL would then show
 * something else, or nothing. Storing the text means the saved list still
 * reads correctly, and the link is a convenience on top of it.
 */
(function () {
  "use strict";

  var KEY = "newsmorning.bookmarks.v1";
  var MAX_ITEMS = 500;

  function storage() {
    // One probe, not a feature test on `window.localStorage` alone: Safari in
    // private mode exposes the object and throws on write.
    try {
      var probe = "__nm__";
      window.localStorage.setItem(probe, probe);
      window.localStorage.removeItem(probe);
      return window.localStorage;
    } catch (err) {
      return null;
    }
  }

  var store = storage();

  function load() {
    if (!store) return [];
    try {
      var raw = store.getItem(KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items)) return [];
      return parsed.items.filter(function (item) {
        return item && typeof item.id === "string";
      });
    } catch (err) {
      // Corrupt or foreign data in our key: treat it as empty rather than
      // throwing on every page load for the rest of time.
      return [];
    }
  }

  function save(items) {
    if (!store) return false;
    try {
      store.setItem(KEY, JSON.stringify({ v: 1, items: items.slice(0, MAX_ITEMS) }));
      return true;
    } catch (err) {
      return false;
    }
  }

  function byId(items, id) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return i;
    }
    return -1;
  }

  function updateCounts(items) {
    var badges = document.querySelectorAll("[data-saved-count]");
    for (var i = 0; i < badges.length; i++) {
      badges[i].textContent = String(items.length);
      if (items.length) {
        badges[i].removeAttribute("hidden");
      } else {
        badges[i].setAttribute("hidden", "");
      }
    }
  }

  function setPressed(button, on) {
    button.setAttribute("aria-pressed", on ? "true" : "false");
    var mark = button.querySelector(".mark");
    var text = button.querySelector(".text");
    // U+2605 filled star / U+2606 hollow star.
    if (mark) mark.textContent = on ? "★" : "☆";
    if (text) text.textContent = on ? "Saved" : "Save";
    var title = button.getAttribute("data-bm-title") || "";
    button.setAttribute("aria-label", (on ? "Remove from saved: " : "Save: ") + title);
  }

  /* ---------- edition pages: the save buttons ---------- */

  function wireEdition() {
    // Only the per-item controls, which are the ones carrying an anchor. The
    // saved page's "clear all" shares the pill styling and would otherwise be
    // wired up as a save button and relabelled.
    var buttons = document.querySelectorAll(".bookmark[data-bm-anchor]");
    if (!buttons.length) return;
    var body = document.body;
    var edition = body.getAttribute("data-edition") || "";
    var editionTitle = body.getAttribute("data-edition-title") || edition;
    var path = body.getAttribute("data-edition-path") || "";

    if (!store) return; // Buttons stay hidden: saving would not survive.

    var items = load();
    updateCounts(items);

    for (var i = 0; i < buttons.length; i++) {
      (function (button) {
        var anchor = button.getAttribute("data-bm-anchor") || "";
        var id = edition + "#" + anchor;
        button.removeAttribute("hidden");
        setPressed(button, byId(items, id) !== -1);

        button.addEventListener("click", function () {
          var current = load();
          var at = byId(current, id);
          if (at === -1) {
            current.unshift({
              id: id,
              kind: button.getAttribute("data-bm-kind") || "Item",
              title: button.getAttribute("data-bm-title") || "",
              text: button.getAttribute("data-bm-text") || "",
              edition: edition,
              editionTitle: editionTitle,
              path: path,
              anchor: anchor,
              savedAt: new Date().toISOString()
            });
          } else {
            current.splice(at, 1);
          }
          if (!save(current)) return;
          setPressed(button, at === -1);
          updateCounts(current);
        });
      })(buttons[i]);
    }
  }

  /* ---------- the saved page ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function editionLabel(item) {
    if (!item.edition) return item.editionTitle || "Saved";
    var parts = String(item.edition).split("-");
    if (parts.length !== 3) return item.edition;
    var months = ["January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"];
    var month = months[parseInt(parts[1], 10) - 1] || parts[1];
    return parseInt(parts[2], 10) + " " + month + " " + parts[0];
  }

  function renderSaved() {
    var mount = document.querySelector("[data-saved-list]");
    if (!mount) return;
    var root = document.body.getAttribute("data-site-root") || "";

    if (!store) {
      mount.appendChild(el("p", "saved-empty",
        "This browser is not letting the page store anything, so saved items are unavailable here. "
        + "Private windows and blocked site data both do this."));
      return;
    }

    function draw() {
      var items = load();
      mount.textContent = "";
      updateCounts(items);

      var clear = document.querySelector("[data-saved-clear]");
      if (clear) {
        if (items.length) {
          clear.removeAttribute("hidden");
        } else {
          clear.setAttribute("hidden", "");
        }
      }

      if (!items.length) {
        mount.appendChild(el("p", "saved-empty",
          "Nothing saved yet. Every briefing, tracker row, radar entry and horizon card "
          + "carries a Save button; whatever you save lands here."));
        return;
      }

      // Newest edition first, and within an edition the order the items were
      // saved in, which is the order the reader built.
      var groups = {};
      var order = [];
      items.forEach(function (item) {
        var key = item.edition || "";
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(item);
      });
      order.sort().reverse();

      order.forEach(function (key) {
        var section = el("section", "saved-group");
        section.appendChild(el("h3", null, editionLabel(groups[key][0])));
        var list = el("ul", "saved-list");

        groups[key].forEach(function (item) {
          var li = el("li", "saved-item");
          li.appendChild(el("p", "saved-kind", item.kind || "Item"));
          li.appendChild(el("h4", null, item.title || "Untitled"));
          if (item.text) li.appendChild(el("p", null, item.text));

          var actions = el("div", "saved-actions");
          if (item.path) {
            var link = el("a", null, "Open in the edition");
            link.href = root + item.path + (item.anchor ? "#" + item.anchor : "");
            actions.appendChild(link);
          }
          var remove = el("button", null, "Remove");
          remove.type = "button";
          remove.addEventListener("click", function () {
            var current = load();
            var at = byId(current, item.id);
            if (at !== -1) current.splice(at, 1);
            if (save(current)) draw();
          });
          actions.appendChild(remove);
          li.appendChild(actions);
          list.appendChild(li);
        });

        section.appendChild(list);
        mount.appendChild(section);
      });
    }

    var clearAll = document.querySelector("[data-saved-clear]");
    if (clearAll) {
      clearAll.addEventListener("click", function () {
        if (!window.confirm("Remove every saved item? This cannot be undone.")) return;
        if (save([])) draw();
      });
    }

    draw();
  }

  function start() {
    updateCounts(load());
    wireEdition();
    renderSaved();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
