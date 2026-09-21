import { test, expect } from '@playwright/test';

// The PWA's notification badge showed on Android as a plain white square.
//
// Android builds the status-bar icon from the image's ALPHA CHANNEL ALONE:
// colour is discarded and whatever is opaque gets tinted flat white. The
// service worker was passing the app icon, which is generated from an
// icon.svg that opens with a full-bleed background rect — no alpha channel at
// all, so the silhouette was the entire square.
//
// Nothing in the build can catch that: the file is a perfectly valid PNG and
// the notification fires correctly. Only the alpha channel gives it away, so
// that is what this asserts.
//
// Needs no session — it only wants a same-origin document to decode in.

test('the notification badge is a transparent silhouette, not an opaque block', async ({ page }) => {
  await page.goto('/');

  const alpha = await page.evaluate(async () => {
    const img = new Image();
    img.src = '/badge-96.png';
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let clear = 0;
    let solid = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) clear++;
      else if (data[i] === 255) solid++;
    }
    return { width: canvas.width, height: canvas.height, total: canvas.width * canvas.height, clear, solid };
  });

  expect(alpha.width, 'badge should be 96px square').toBe(96);
  expect(alpha.height).toBe(96);

  const transparent = alpha.clear / alpha.total;
  const opaque = alpha.solid / alpha.total;

  // The failure mode being guarded against: an icon with no transparency,
  // which Android renders as a solid rectangle.
  expect(
    transparent,
    `only ${(transparent * 100).toFixed(1)}% of the badge is transparent — Android will render it as a block`,
  ).toBeGreaterThan(0.4);

  // And the opposite failure: transparent everywhere, so nothing is drawn.
  expect(
    opaque,
    `only ${(opaque * 100).toFixed(1)}% of the badge is opaque — there is no mark to see`,
  ).toBeGreaterThan(0.05);
});

test('the service worker points its badge at that asset', async ({ page }) => {
  // A correct asset nobody references fixes nothing.
  const res = await page.request.get('/sw.js');
  expect(res.ok(), 'service worker should be served at /sw.js').toBeTruthy();
  const source = await res.text();

  // Read the actual option value rather than searching the whole file: the
  // precached asset list also contains "badge-96.png", so a bare substring
  // check passes even when showNotification is pointing somewhere else. That
  // is not hypothetical — it is what the first version of this test did.
  // `badge` is a Notification API key, so minification cannot rename it.
  const badge = source.match(/badge:\s*["']([^"']+)["']/);
  expect(badge, 'sw.js should set a badge option on showNotification').not.toBeNull();
  expect(badge![1], 'badge must be the transparent monochrome mark, not the opaque app icon')
    .toBe('/badge-96.png');

  // icon is the large in-body image, where the opaque app icon is correct.
  const icon = source.match(/icon:\s*["']([^"']+)["']/);
  expect(icon![1]).toBe('/pwa-192.png');
});
