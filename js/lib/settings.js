import { load, save } from './storage.js';

const settings = { sound: true, haptics: true, ...load('settings', {}) };

export function getSetting(name) {
  return settings[name];
}

export function setSetting(name, value) {
  settings[name] = value;
  save('settings', settings);
}

export function haptic(ms = 15) {
  if (settings.haptics && navigator.vibrate) {
    try {
      // Phone motors can't spin up for much under 30 ms: shorter buzzes
      // are simply not felt.
      navigator.vibrate(Array.isArray(ms) ? ms : Math.max(35, ms));
    } catch {
      // Some browsers throw if called before user interaction.
    }
  }
}
