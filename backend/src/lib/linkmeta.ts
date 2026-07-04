// Fetch-and-parse for link previews (gift items, savings-goal links).
// Dependency-free: undici fetch + small regexes. The fetch side is guarded
// against SSRF — a household member pasting a link must not be able to make
// the server read its own network.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export interface LinkMeta {
  title: string | null;
  site: string | null;
}

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 4000;

/** True for addresses the server must never fetch: loopback, RFC1918, link-local, ULA. */
export function isPrivateAddress(ip: string): boolean {
  if (ip.startsWith('::ffff:')) ip = ip.slice(7); // IPv4-mapped IPv6
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const low = ip.toLowerCase();
  return low === '::' || low === '::1' || low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd');
}

/**
 * Validate a user-supplied URL for preview fetching: http(s) only, and the
 * hostname must resolve to a public address. Throws with a safe message.
 */
export async function assertFetchableUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Not a valid link');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http(s) links can be previewed');
  }
  const host = url.hostname;
  if (isIP(host) ? isPrivateAddress(host) : host === 'localhost' || host.endsWith('.local')) {
    throw new Error('That address cannot be previewed');
  }
  if (!isIP(host)) {
    const addrs = await lookup(host, { all: true }).catch(() => []);
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
      throw new Error('That address cannot be previewed');
    }
  }
  return url;
}

const decodeEntities = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

const metaContent = (html: string, property: string): string | null => {
  // <meta property="og:title" content="…"> in either attribute order.
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']|` +
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
    'i',
  );
  const m = html.match(re);
  const raw = m?.[1] ?? m?.[2];
  return raw ? decodeEntities(raw) : null;
};

/** Pure parser: og:title / og:site_name with a <title> fallback. */
export function parseLinkMeta(html: string): LinkMeta {
  const title =
    metaContent(html, 'og:title') ??
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ? decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1])
      : null);
  const site = metaContent(html, 'og:site_name');
  return { title: title || null, site: site || null };
}

/** Fetch a validated URL and extract its metadata. */
export async function fetchLinkMeta(url: URL): Promise<LinkMeta & { site: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { accept: 'text/html', 'user-agent': 'Katei/1.0 (+link preview)' },
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.includes('text/html')) return { title: null, site: url.hostname };
    // Read at most MAX_BYTES — the meta tags live in <head>.
    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder();
      let received = 0;
      while (received < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        html += decoder.decode(value, { stream: true });
      }
      await reader.cancel().catch(() => {});
    }
    const meta = parseLinkMeta(html);
    return { title: meta.title, site: meta.site ?? url.hostname };
  } catch {
    return { title: null, site: url.hostname };
  } finally {
    clearTimeout(timer);
  }
}
