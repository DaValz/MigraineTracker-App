(function () {
  var theme = 'light';
  try {
    var pref = localStorage.getItem('emicrania.theme') || 'auto';
    var dark = pref === 'dark' || (pref === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    theme = dark ? 'dark' : 'light';
  } catch (e) { /* storage non disponibile */ }
  document.documentElement.setAttribute('data-theme', theme);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#f2f2f7');
})();
