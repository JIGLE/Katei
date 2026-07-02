// Apply the cached theme before first paint to avoid a flash of the wrong
// palette. External (not inline) so the Content-Security-Policy can stay
// script-src 'self'. Loaded as a blocking classic script in <head>.
try {
  if (localStorage.getItem('katei-theme') === 'light') {
    document.documentElement.dataset.theme = 'light';
  }
} catch (e) {}
