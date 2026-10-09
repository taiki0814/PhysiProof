import type { PrepareBattleRegion } from '@my-app/shared';

/** Do not replace the browser's timestamp with Date.now(): stale fixes must
 * remain stale on the server. No manual coordinates in the invitation UI. */
export function readBattleLocation(): Promise<PrepareBattleRegion> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('この端末では現在地を取得できません。位置情報を利用できる端末で確認してください。')); return; }
    navigator.geolocation.getCurrentPosition(position => {
      if (!Number.isFinite(position.coords.accuracy) || position.coords.accuracy < 0 || position.coords.accuracy > 1000
        || !Number.isFinite(position.timestamp) || !Number.isFinite(position.coords.latitude) || !Number.isFinite(position.coords.longitude)) {
        reject(new Error('位置情報の精度が低いため、屋外などで現在地を再取得してください。')); return;
      }
      resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, located_at: new Date(position.timestamp).toISOString() });
    }, () => reject(new Error('現在地を取得できません。ブラウザと端末の位置情報を許可して再確認してください。')),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  });
}
