import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { profileMapResponseSchema, type ProfileMapResponse } from '@my-app/shared';
import client from '../lib/hc';
import { mountAdminBasemap, ADMIN_MAP_ATTRIBUTION, type AdminBasemapStatus } from '../lib/adminBasemap';
import './ProfileTerritoryMap.css';

export function ProfileTerritoryMap({ ownerId, isOwn = false, onClose }: { ownerId: string; isOwn?: boolean; onClose: () => void }) {
  const [mode, setMode] = useState<'current' | 'history'>('current');
  const [data, setData] = useState<ProfileMapResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mapStatus, setMapStatus] = useState<AdminBasemapStatus>('loading');
  const [mapRetry, setMapRetry] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [cursor, setCursor] = useState<number | undefined>();
  const host = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const fitted = useRef(false);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const changed = (e: StorageEvent) => {
      if (e.key !== 'physiproof_access_token' && e.key !== null) return;
      setData(null); setCursor(undefined); setRefresh(n => n+1);
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key !== 'Tab') return;
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], select, [tabindex="0"]') ?? []);
      if (!controls.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);

  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, { maxZoom: 18 }).setView([35.68, 139.76], 11);
    instance.attributionControl.setPrefix(false).addAttribution(ADMIN_MAP_ATTRIBUTION);
    map.current = instance;
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(host.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (map.current) return mountAdminBasemap(map.current, setMapStatus);
  }, [mapRetry]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setBusy(true); setError('');
    if (!cursor) { setData(null); fitted.current = false; }
    void client.api.profiles[':id']['territory-map'].$get({ param: { id: ownerId }, query: { mode, ...(cursor ? { before: cursor } : {}) } },
      { init: { signal: controller.signal, cache: 'no-store' } }).then(async res => {
      const body = await res.json();
      if (!res.ok) throw new Error((body as {error?:string}).error ?? 'マップを読み込めませんでした。');
      const next = profileMapResponseSchema.parse(body);
      if (active) setData(previous => cursor && previous ? { ...next, territories: [...previous.territories, ...next.territories] } : next);
    }).catch(e => { if (active) { setData(null); setError(e instanceof Error ? e.message : 'マップを読み込めませんでした。'); } })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; controller.abort(); };
  }, [ownerId, mode, cursor, refresh]);

  // Revalidate non-owner permission while open. Keep private geometry only in
  // mounted memory; never put it in localStorage, an offline cache, or exports.
  useEffect(() => {
    if (isOwn) return;
    let active = true;
    const recheck = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await client.api.profiles[':id']['territory-map'].$get({ param: { id: ownerId }, query: { mode } }, { init: { cache: 'no-store' } });
        if (!res.ok && active) { setData(null); setError('公開設定またはフレンド関係が変わったため、表示できません。'); }
      } catch { if (active) { setData(null); setError('接続を確認して再読み込みしてください。'); } }
    };
    const timer = window.setInterval(() => void recheck(), 30000);
    const visible = () => { void recheck(); };
    window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
  }, [ownerId, mode, isOwn]);

  useEffect(() => {
    if (error && map.current) map.current.setView([35.68, 139.76], 11);
  }, [error]);
  useEffect(() => {
    if (!map.current) return;
    const layer = L.featureGroup().addTo(map.current);
    for (const territory of data?.territories ?? []) {
      try {
        const geometry = territory.geometry_json ? JSON.parse(territory.geometry_json) : {
          type: 'Polygon', coordinates: [JSON.parse(territory.area_polygon).map(([lat,lng]: number[]) => [lng,lat])],
        };
        L.geoJSON(geometry, { style: { color: mode === 'history' ? '#00c8df' : '#00d880', weight: 2, fillOpacity: .2 } }).addTo(layer);
      } catch { /* One malformed legacy polygon must not hide the rest. */ }
    }
    if (!fitted.current && layer.getBounds().isValid()) {
      map.current.fitBounds(layer.getBounds(), { padding: [20,20], maxZoom: 16 }); fitted.current = true;
    }
    return () => { layer.remove(); };
  }, [data, mode]);

  return createPortal(<div className="pp-profile-map-backdrop">
    <div className="pp-profile-map-dialog" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="profile-map-heading">
      <header><h2 id="profile-map-heading">{isOwn ? '自分' : data?.owner.name ?? 'フレンド'}の領域マップ</h2><button type="button" onClick={onClose} aria-label="マップを閉じる">閉じる</button></header>
      <div className="pp-profile-map-toolbar" aria-label="表示する領域">
        <button type="button" aria-pressed={mode === 'current'} onClick={() => { setCursor(undefined); setMode('current'); }}>現在の領域</button>
        <button type="button" aria-pressed={mode === 'history'} onClick={() => { setCursor(undefined); setMode('history'); }}>これまでの領域</button>
      </div>
      <p className="pp-profile-map-note">{mode === 'history' ? '個人活動で一度取得した範囲です。重複する範囲も表示します。過去に失った旧データは復元できず、導入時の保有領域と導入後の取得分から記録します。' : '個人活動で現在保有している領域です。チーム・対戦用領域や走行経路は表示しません。'}{isOwn && ' 公開範囲はプロフィール設定で変更できます。'}</p>
      {error && <div role="alert" className="pp-profile-map-error">{error} <button type="button" onClick={() => { setCursor(undefined); setRefresh(n => n+1); }}>再読み込み</button></div>}
      <div className="pp-profile-map-canvas" ref={host} aria-label="プロフィール領域の地図" />
      {mapStatus === 'error' && <div role="alert">背景地図を読み込めません。<button type="button" onClick={() => setMapRetry(n => n+1)}>地図を再試行</button></div>}
      <footer aria-live="polite">{busy ? '読み込み中…' : error ? '' : `${data?.territories.length ?? 0}件を表示${!data?.territories.length ? '・記録された領域はありません' : ''}`}
        {data?.next_before && <button type="button" disabled={busy} onClick={() => setCursor(data.next_before!)}>さらに表示</button>}
      </footer>
    </div>
  </div>, document.body);
}
