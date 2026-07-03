// Apply the cached theme before first paint to avoid a flash of the wrong
// palette. External (not inline) so the Content-Security-Policy can stay
// script-src 'self'. Loaded as a blocking classic script in <head>.
// 'system' (and a fresh device with nothing cached) follows the OS scheme.
try {
  var choice = localStorage.getItem('katei-theme');
  var light =
    choice === 'light' ||
    ((choice === 'system' || !choice) &&
      window.matchMedia &&
      !window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (light) {
    document.documentElement.dataset.theme = 'light';
  }
} catch (e) {}
