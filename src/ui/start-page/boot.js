/**
 * Start Page boot guard (classic synchronous script in <head>, before first paint). The Start Page mounts late (the app
 * boots on window "load"), so without this the editor paints first and the page then replaces it. Here, from the same
 * rules App#shouldShowStartPageOnLaunch uses, we decide synchronously:
 *   - whether this launch will show the page: the saved startPage.showOnLaunch pref (localStorage "vectura_prefs", else
 *     the cookie mirror) and the automation rule (navigator.webdriver never auto-shows unless ?startPage=launch).
 *     When it will: <html data-sp-boot> so CSS paints only the page-colored ground until the page has settled;
 *   - the saved theme skin, so the first paint already carries the right palette (no light -> dark flash).
 * The page (start-page.js) or main.js removes data-sp-boot; a 6 s watchdog removes it if the app never boots.
 * Everything is wrapped in try/catch: a failure here only means the old behavior (no cover).
 *
 * window.Vectura.StartPageBoot = { decide(env) -> { show, skin } }  (also used by the tests)
 */
(function () {
  var SKIN_FILE = { dark: 'meridian-dark', lark: 'meridian-lark', light: 'meridian-light', 'classic-dark': 'classic-dark', 'classic-lark': 'classic-lark', 'classic-light': 'classic-light' };
  var KEY = 'vectura_prefs';

  function readSnapshot(env) {
    var raw = null;
    try { raw = env.localStorage && env.localStorage.getItem(KEY); } catch (e) { raw = null; }
    var candidates = [raw];
    try {
      var m = /(?:^|;\s*)vectura_prefs=([^;]*)/.exec(env.cookie || '');
      if (m && m[1]) {
        var bin = env.atob(m[1]);
        try { candidates.push(decodeURIComponent(Array.prototype.map.call(bin, function (c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join(''))); } catch (e) { candidates.push(bin); }
      }
    } catch (e) { /* no cookie */ }
    for (var i = 0; i < candidates.length; i++) {
      if (!candidates[i]) continue;
      try {
        var parsed = JSON.parse(candidates[i]);
        return parsed && parsed.data && typeof parsed.data === 'object' ? parsed.data : parsed;
      } catch (e) { /* try next */ }
    }
    return null;
  }

  function decide(env) {
    var snap = readSnapshot(env) || {};
    var sp = snap.startPage && typeof snap.startPage === 'object' ? snap.startPage : {};
    var show = sp.showOnLaunch !== false;
    if (show && env.webdriver === true && !/[?&]startPage=launch(&|$)/.test(env.search || '')) show = false;
    var theme = String(snap.uiTheme || '').trim().toLowerCase();
    // "System" theme mode: uiTheme holds the last concrete id, which follows prefers-color-scheme at launch (same family).
    if (snap.uiThemeSystem === true && SKIN_FILE[theme]) {
      var dark = env.prefersDark !== false;
      theme = (theme.indexOf('classic-') === 0 ? 'classic-' : '') + (dark ? 'dark' : 'light');
    }
    return { show: show, skin: Object.prototype.hasOwnProperty.call(SKIN_FILE, theme) ? SKIN_FILE[theme] : null, theme: theme };
  }

  var W = typeof window !== 'undefined' ? window : null;
  if (W && typeof document !== 'undefined') {
    var V = W.Vectura = W.Vectura || {};
    V.StartPageBoot = { decide: decide };
    try {
      var root = document.documentElement;
      var d = decide({ localStorage: W.localStorage, cookie: document.cookie, atob: W.atob.bind(W), webdriver: W.navigator && W.navigator.webdriver, search: W.location.search, prefersDark: !(W.matchMedia && W.matchMedia('(prefers-color-scheme: dark)').matches === false) });
      if (d.skin) {
        var link = document.getElementById('active-skin');
        if (link) {
          var href = link.getAttribute('href') || '';
          var q = /(\?v=[^"]*)$/.exec(href);
          var next = './src/ui/skin/' + d.skin + '.css' + (q ? q[1] : '');
          if (href !== next) link.setAttribute('href', next);
        }
        root.setAttribute('data-ui-skin', d.theme);
      }
      if (d.show) {
        root.setAttribute('data-sp-boot', '1');
        W.setTimeout(function () { root.removeAttribute('data-sp-boot'); }, 6000);
      }
    } catch (e) { /* old behavior */ }
  }
})();
