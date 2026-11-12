import { useEffect, useState } from 'react';
import L from 'leaflet';
import { CHEST_INNER_MARGIN_M, CHEST_TIERS, mapChestsSchema } from '@my-app/shared';
import type { MapChest } from '@my-app/shared';
import client from '../lib/hc';
import InfoHint from './InfoHint';
import './MapTreasureChests.css';

type Props = {
  map: L.Map | null;
  selected: MapChest | null;
  onSelect: (chest: MapChest | null) => void;
  disabled: boolean;
  claimedIds: string[];
};

export default function MapTreasureChests({ map, selected, onSelect, disabled, claimedIds }: Props) {
  const [catalog, setCatalog] = useState<ReturnType<typeof mapChestsSchema.parse>>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const chests = catalog?.chests;

  async function findChests() {
    if (!navigator.geolocation) { setMessage('この端末では位置情報を取得できません。'); return; }
    setBusy(true);
    setMessage('');
    setCatalog(undefined);
    onSelect(null);
    try {
      const { coords } = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('現在地を取得できません。位置情報の許可を確認してください。')),
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 }));
      const response = await client.api['map-chests'].nearby.$post({ json: { latitude: coords.latitude, longitude: coords.longitude } },
        { init: { signal: AbortSignal.timeout(30000) } });
      const data = await response.json();
      if (!response.ok) throw new Error('error' in data ? data.error : '宝箱を読み込めませんでした。');
      setCatalog(mapChestsSchema.parse(data));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '現在地を取得できません。位置情報の許可を確認してください。');
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!catalog) return;
    const timer = window.setTimeout(() => {
      setCatalog(undefined);
      if (!disabled) onSelect(null);
      setMessage('宝箱が入れ替わりました。現在地で探し直してください。');
    }, Math.max(0, catalog.expires_at - Date.now()));
    return () => window.clearTimeout(timer);
  }, [catalog, disabled, onSelect]);

  useEffect(() => {
    if (!map) return;
    const displayed = chests ?? [];
    const pins = selected && !displayed.some(chest => chest.id === selected.id) ? [...displayed, selected] : displayed;
    const group = L.layerGroup().addTo(map);
    pins.forEach((chest, index) => {
      const claimed = chest.claimed || claimedIds.includes(chest.id);
      const chosen = selected?.id === chest.id;
      const latLng: L.LatLngTuple = [chest.latitude, chest.longitude];
      const label = chosen ? (disabled ? '挑戦中の宝箱' : '選択した宝箱') : `宝箱 ${index + 1}${claimed ? '（獲得済み）' : ''}`;
      const icon = L.divIcon({
        className: `pp-chest-pin${chosen ? ' is-selected' : ''}${claimed ? ' is-claimed' : ''}`,
        html: '<span aria-hidden="true"></span>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      const marker = L.marker(latLng, { icon, title: label, alt: label }).bindTooltip(label).addTo(group);
      if (!disabled && !claimed) marker.on('click', () => onSelect(chest));
      if (chosen) L.circle(latLng, { radius: CHEST_INNER_MARGIN_M, color: '#ffcb66', fillOpacity: .13, dashArray: '4 3', interactive: false }).addTo(group);
    });
    return () => { group.remove(); };
  }, [map, chests, selected, disabled, claimedIds, onSelect]);

  return <section className="pp-map-chests" aria-label="個人マップの宝箱">
    <div className="pp-map-chest-actions">
      <strong>宝箱</strong>
      <InfoHint label="宝箱の取り方" text={`出発前に１箱選び、地図の黄色い円が内側に入るようにオンラインで一周してください。面積の目安は ${CHEST_TIERS.map(tier => `${tier.label} ${tier.area.toLocaleString('ja-JP')} m²`).join('、')} です。獲得は箱ごとに自分だけ１回。ほかの人も同じ箱に挑戦できます。`} />
      {!disabled && <button type="button" disabled={busy} onClick={() => void findChests()}>{busy ? '探しています…' : '現在地で宝箱を探す'}</button>}
    </div>
    {message && <p role="status">{message}</p>}
    {catalog && <p>{catalog.prefecture} · {catalog.chests.length}箱 · 入れ替え {new Date(catalog.expires_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
    {catalog && !catalog.chests.length && <p>今週は、この都道府県に配置できる公開歩行ルートが見つかりませんでした。</p>}
    {!!catalog?.chests.length && !disabled && <label>狙う宝箱
      <select value={selected?.id ?? ''} onChange={event => {
        const chest = catalog.chests.find(item => item.id === event.target.value) ?? null;
        onSelect(chest);
        if (chest && map) map.flyTo([chest.latitude, chest.longitude], Math.max(16, map.getZoom()));
      }}>
        <option value="">選択なし</option>
        {catalog.chests.map((chest, index) => <option key={chest.id} value={chest.id} disabled={chest.claimed || claimedIds.includes(chest.id)}>
          宝箱 {index + 1}{chest.claimed || claimedIds.includes(chest.id) ? '（獲得済み）' : ''}
        </option>)}
      </select>
    </label>}
    {selected && <p>{disabled ? '宝箱に挑戦中' : '宝箱を選択済み。計測を開始して一周してください。'}</p>}
  </section>;
}
