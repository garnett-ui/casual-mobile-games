// Google Analytics (GA4) that copes with being offline.
//
// Events are written to a small queue in localStorage first. Whenever the
// device is online, gtag.js is loaded and the queue is sent; events recorded
// while offline go out on the next connection, tagged with how long ago they
// happened (queued_minutes). Nothing is sent from localhost (dev and tests).
// Off line, gtag.js can't load, so events simply wait in the queue.
import { load, save } from './storage.js';

// Same GA4 property as mckoss.com; reports can split on page path.
const GA_ID = 'G-GBPSK1HQ34';
const QUEUE_KEY = 'analytics-queue';
const MAX_QUEUE = 300;

// Off in development; the tests switch it on with a storage flag.
const enabled = (!/^(localhost|127\.|\[::1\])/.test(location.hostname) && location.protocol === 'https:') ||
  load('analytics-test', false);
let ready = false;
let loading = false;

function gtag() {
  window.dataLayer.push(arguments);
}

function loadGtag() {
  if (!enabled || ready || loading || !navigator.onLine) return;
  loading = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = gtag;
  gtag('js', new Date());
  // Page views are sent by us on each in-app navigation (see trackPage).
  gtag('config', GA_ID, { send_page_view: false, app_name: 'Pocket Arcade' });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  s.onload = () => {
    ready = true;
    loading = false;
    flush();
  };
  s.onerror = () => {
    loading = false;
    s.remove();
  };
  document.head.appendChild(s);
}

function flush() {
  if (!ready || !navigator.onLine) return;
  const queue = load(QUEUE_KEY, []);
  if (!queue.length) return;
  save(QUEUE_KEY, []);
  const now = Date.now();
  for (const { name, params, t } of queue) {
    const minutes = Math.round((now - t) / 60000);
    gtag('event', name, { ...params, ...(minutes > 1 ? { queued_minutes: minutes } : {}) });
  }
}

export function track(name, params = {}) {
  if (!enabled) return;
  const queue = load(QUEUE_KEY, []);
  queue.push({ name, params, t: Date.now() });
  save(QUEUE_KEY, queue.slice(-MAX_QUEUE));
  if (ready) flush();
  else loadGtag();
}

// Hash routes (#/car-jam/12) become page paths (/casual-mobile-games/car-jam).
export function trackPage(id) {
  const base = location.pathname.replace(/index\.html$/, '');
  track('page_view', {
    page_title: id ? `Pocket Arcade: ${id}` : 'Pocket Arcade',
    page_location: `${location.origin}${base}${id || ''}`,
  });
}

export function startAnalytics() {
  if (!enabled) return;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  track('app_open', { display_mode: standalone ? 'installed' : 'browser', online: navigator.onLine });
  window.addEventListener('online', () => (ready ? flush() : loadGtag()));
  window.addEventListener('appinstalled', () => track('app_installed'));
}
