import { Store } from './state.js';

// Browser Notification API wrapper for the "new episode aired" reminder.
// Deliberately local-only: there is no service worker or push
// infrastructure here (this is a plain page served from localhost), so a
// notification can only ever fire while Anime Tracker is open in a tab —
// same constraint the rest of the airing/Discover background-refresh
// features already live with. Never requests permission on its own; only
// setEnabled(true) (from a direct user action) triggers the browser prompt.

export function isSupported() {
  return typeof Notification !== 'undefined';
}

export function getPermission() {
  return isSupported() ? Notification.permission : 'unsupported';
}

export function isEnabled() {
  return Boolean(Store.state.preferences.notifyNewEpisodes);
}

export async function setEnabled(enabled) {
  Store.setPreference(['notifyNewEpisodes'], enabled);
  if (enabled && isSupported() && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

// `items`: [{ anilistId, title, unseen }] from airingLogic.detectNewlyAired.
// No-ops quietly (never throws) if the feature is off, unsupported, or
// permission was never granted — this is always called from a background
// refresh, never from a path a user is watching for an error.
export function notifyNewEpisodes(items) {
  if (!items.length || !isEnabled() || !isSupported() || Notification.permission !== 'granted') return;
  try {
    if (items.length === 1) {
      const [it] = items;
      new Notification('New episode available', {
        body: `${it.title} just aired a new episode.`,
        tag: `anime-tracker-episode-${it.anilistId}`,
      });
    } else {
      const names = items.slice(0, 3).map((it) => it.title).join(', ');
      new Notification('New episodes available', {
        body: `${items.length} series you're watching have new episodes: ${names}${items.length > 3 ? '…' : ''}`,
        tag: 'anime-tracker-episodes',
      });
    }
  } catch {
    // Notification construction can throw in odd environments (e.g. a
    // platform that reports permission "granted" but still refuses) —
    // never let a reminder crash the background refresh that triggered it.
  }
}

export const Notifications = { isSupported, getPermission, isEnabled, setEnabled, notifyNewEpisodes };
