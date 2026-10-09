import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MAX_TEAM_BATTLE_OPPONENTS, battleRegionResponseSchema } from '@my-app/shared';
import type { Team, TeamBattleSummary, BattleRegionResponse } from '@my-app/shared';
import client from '../lib/hc';
import AppIcon from './AppIcon';
import InfoHint from './InfoHint';
import BattleRulesHelp from './BattleRulesHelp';
import { readBattleLocation } from '../lib/battleLocation';

type TeamSummary = Pick<Team, 'id' | 'name' | 'owner_id'>;

interface TeamBattlesPanelProps {
  currentUserId: string;
  currentTeam: TeamSummary | null;
  teams: TeamSummary[];
}

const toDateTimeLocal = (date: Date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

const getDefaultPeriod = () => {
  const starts = new Date();
  starts.setMinutes(starts.getMinutes() + 5, 0, 0);
  const ends = new Date(starts);
  ends.setDate(ends.getDate() + 1);
  return { starts: toDateTimeLocal(starts), ends: toDateTimeLocal(ends) };
};

const formatDateTime = (value: string) => new Date(value).toLocaleString('ja-JP', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
});

const formatSigned = (value: number, digits: number) => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

const statusLabels: Record<TeamBattleSummary['display_status'], string> = {
  pending: '承認待ち',
  accepted: '承認済み',
  scheduled: '開始待ち',
  active: '対戦中',
  completed: '終了',
  rejected: '辞退により中止',
  expired: '承認期限切れ',
  cancelled: '申込取消'
};

export const TeamBattlesPanel: React.FC<TeamBattlesPanelProps> = ({ currentUserId, currentTeam, teams }) => {
  const initialPeriod = useMemo(getDefaultPeriod, []);
  const [opponentTeamIds, setOpponentTeamIds] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState(initialPeriod.starts);
  const [endsAt, setEndsAt] = useState(initialPeriod.ends);
  const [battles, setBattles] = useState<TeamBattleSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<'isolated' | 'shared'>('isolated');
  const [spotsEnabled, setSpotsEnabled] = useState(true);
  const [region, setRegion] = useState<BattleRegionResponse | null>(null);
  const [preparingRegion, setPreparingRegion] = useState(false);

  const isLeader = currentTeam?.owner_id === currentUserId;
  const opponents = teams.filter((team) => team.id !== currentTeam?.id);
  const hasPendingOrLiveBattle = battles.some((battle) => (
    battle.display_status === 'pending' || battle.display_status === 'scheduled' || battle.display_status === 'active'
  ));

  const refreshBattles = useCallback(async () => {
    try {
      const response = await client.api.teams.battles.$get();
      if (!response.ok) {
        setError('対戦情報を読み込めませんでした。DBマイグレーションが適用されているか確認してください。');
        return;
      }
      const data = await response.json() as any;
      if (data.success) setBattles(data.battles as TeamBattleSummary[]);
    } catch (e) {
      console.error('Failed to fetch team battles:', e);
      setError('対戦情報を読み込めませんでした。');
    }
  }, []);

  useEffect(() => {
    void refreshBattles();
    setRegion(null);
  }, [refreshBattles, currentTeam?.id]);

  useEffect(() => {
    let refreshing = false;
    const refreshVisibleBattles = async () => {
      if (document.visibilityState !== 'visible' || refreshing) return;
      refreshing = true;
      try {
        await refreshBattles();
      } finally {
        refreshing = false;
      }
    };

    const interval = hasPendingOrLiveBattle ? window.setInterval(() => void refreshVisibleBattles(), 30_000) : undefined;
    window.addEventListener('focus', refreshVisibleBattles);
    document.addEventListener('visibilitychange', refreshVisibleBattles);
    return () => {
      if (interval !== undefined) window.clearInterval(interval);
      window.removeEventListener('focus', refreshVisibleBattles);
      document.removeEventListener('visibilitychange', refreshVisibleBattles);
    };
  }, [refreshBattles, hasPendingOrLiveBattle, currentTeam?.id]);

  const handlePrepareRegion = async () => {
    setIsLoading(true); setPreparingRegion(true); setError(null); setRegion(null);
    try {
      const location = await readBattleLocation();
      const response = await client.api.teams['battle-region'].$post({ json: location });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : '都道府県を確認できませんでした。';
        throw new Error(message);
      }
      setRegion(battleRegionResponseSchema.parse(data));
    } catch (error) { setError(error instanceof Error ? error.message : '現在地を確認できませんでした。'); }
    finally { setIsLoading(false); setPreparingRegion(false); }
  };

  const handleCreateBattle = async (event: React.FormEvent) => {
    event.preventDefault();
    if (opponentTeamIds.length === 0 || !startsAt || !endsAt) return;

    setIsLoading(true);
    setError(null);
    try {
      if (spotsEnabled && !region) throw new Error('リーダーの現在地から都道府県を確認してください。');
      // Reacquire at submission so moving after preparation cannot silently
      // create a battle in a different prefecture or reuse an old GPS fix.
      const location = spotsEnabled ? await readBattleLocation() : null;
      const response = await client.api.teams.battles.$post({
        json: {
          opponent_team_ids: opponentTeamIds,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
          map_mode: mapMode,
          spots_enabled: spotsEnabled,
          ...(location && region ? { spot_scope: 'prefecture' as const,
            map_latitude: location.latitude, map_longitude: location.longitude,
            location_recorded_at: location.located_at, expected_prefecture_code: region.prefecture_code } : {}),
        }
      });
      const data = await response.json() as any;
      if (!response.ok || !data.success) {
        setError(('error' in data && data.error) || '対戦を申し込めませんでした。');
        return;
      }
      setOpponentTeamIds([]);
      await refreshBattles();
    } catch (e) {
      setError(e instanceof Error ? e.message : '通信エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecision = async (battleId: string, decision: 'accept' | 'reject') => {
    const battle = battles.find(b => b.id === battleId);
    if (decision === 'accept' && battle?.map_rules_version === 1 && !window.confirm(
      `${battle.map_mode === 'shared' ? '共有型：対戦外チームの領域奪取も勝敗に影響します。' : '専用型：通常マップに影響しない独立した対戦です。'}\n${battle.prefecture_name ? `スポット配置県：${battle.prefecture_name}\n` : ''}スポット${battle.spots_enabled ? `${battle.spot_count}個・保持${battle.spot_holding_multiplier}倍・初回${battle.spot_capture_points}pt` : 'なし'}。\n対戦マップで配置とルールを確認しましたか？この設定で承認します。`)) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = decision === 'accept'
        ? await client.api.teams.battles[':id'].accept.$post({ param: { id: battleId } })
        : await client.api.teams.battles[':id'].reject.$post({ param: { id: battleId } });
      const data = await response.json() as any;
      if (!response.ok || !data.success) {
        setError(('error' in data && data.error) || '対戦申請を処理できませんでした。');
        return;
      }
      await refreshBattles();
    } catch (e) {
      setError('通信エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelBattle = async (battleId: string) => {
    if (!window.confirm('この対戦の申し込みを取り消しますか？相手チームにも中止として表示されます。')) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await client.api.teams.battles[':id'].$delete({ param: { id: battleId } });
      const data = await response.json() as any;
      if (!response.ok || !data.success) {
        setError(('error' in data && data.error) || '対戦申請を取り消せませんでした。');
        return;
      }
      await refreshBattles();
    } catch (e) {
      setError('通信エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteHistory = async (battleId: string) => {
    if (!window.confirm('この対戦を自分の履歴一覧から削除しますか？対戦相手の履歴やチーム、対戦データには影響しません。')) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await client.api.teams.battles[':id'].history.$delete({ param: { id: battleId } });
      const data = await response.json() as any;
      if (!response.ok || !data.success) {
        setError(('error' in data && data.error) || '対戦履歴を削除できませんでした。');
        return;
      }
      await refreshBattles();
    } catch (e) {
      setError('通信エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section style={{
      display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.2rem',
      borderRadius: '20px', border: '1px solid rgba(0, 212, 255, 0.18)',
      background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.045), rgba(255,255,255,0.015))'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        <div>
          <div style={{ color: '#00d4ff', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em' }}>TEAM BATTLE</div>
          <h3 style={{ margin: '0.25rem 0', color: '#fff', fontSize: '1.15rem' }}>チーム対戦</h3>
        </div>
        <InfoHint label="対戦ルール" text="全チームの承認で成立し、辞退で中止します。対戦中のオンライン走行・領域・保持時間で競います。詳細は下の「対戦の遊び方・得点ルール」と、各対戦カードの説明で確認してください。旧対戦のルール・得点は変更しません。" />
      </div>
      <BattleRulesHelp />

      {error && (
        <div role="alert" style={{ padding: '0.65rem 0.8rem', borderRadius: '10px', color: '#ff7777', background: 'rgba(255,68,68,0.1)', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      {currentTeam && isLeader && opponents.length > 0 && (
        <form onSubmit={handleCreateBattle} style={{ display: 'grid', gap: '0.65rem' }}>
          <fieldset disabled={isLoading} style={{ display: 'grid', gap: '.65rem', margin: 0, padding: '.8rem', borderRadius: 10, border: '1px solid rgba(66,223,229,.25)' }}>
            <legend style={{ color: '#42dfe5', fontSize: '.8rem' }}>マップ・スポット</legend>
            <label style={{ display: 'grid', gap: '.4rem', fontSize: '.8rem', color: '#c8c8d0' }}>対戦マップ
              <select aria-label="対戦マップ形式" value={mapMode} onChange={e => setMapMode(e.target.value as 'isolated' | 'shared')} style={{ padding: '.6rem', background: '#11131a', color: '#fff', border: '1px solid #445', borderRadius: 8, fontSize: 16, width: '100%' }}>
                <option value="isolated">専用型（参加チームだけ・空の領域から）</option>
                <option value="shared">共有型（通常チーム領域・外部の干渉あり）</option>
              </select>
            </label>
            {mapMode === 'shared' && <div role="note" style={{ color: '#ffd58a', fontSize: '.75rem' }}>対戦外チームの奪取も得点に影響します。古い領域はバフ対象外です。</div>}
            <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', color: '#fff', fontSize: '.8rem' }}><input type="checkbox" checked={spotsEnabled} onChange={e => setSpotsEnabled(e.target.checked)} />スポットを配置する</label>
            {spotsEnabled && <>
              <button type="button" onClick={() => void handlePrepareRegion()} style={{ padding: '.6rem', borderRadius: 8, color: '#42dfe5', background: 'transparent', border: '1px solid #445' }}>{preparingRegion ? '現在地・都道府県の地図を確認中…' : 'リーダーの現在地を確認'}</button>
              <div role="status" style={{ color: region ? '#9ff3d5' : '#9ba8b9', fontSize: '.8rem', overflowWrap: 'anywhere' }}>{region ? `配置する都道府県：${region.prefecture_name}` : '現在地を確認すると、配置する都道府県を表示します。'}</div>
              <small style={{ color: '#9ba8b9', lineHeight: 1.6 }}>県全域の公開歩行路に配置。県とスポットは申込時に固定されます。</small>
              <InfoHint label="都道府県と現在地の取り扱い" text="現在地はサーバー内で都道府県の判定に使います。地図サービスには県コードだけを送り、正確な現在地は対戦相手へ表示しません。初回の地図準備は最大約90秒かかる場合があります。候補を1日間再利用し、取得先が停止中は7日以内の候補を使います。申し込み時も現在地を再取得するため、別の県へ移動した場合は再確認してください。地図を確認できない場合、申請は保存されません。1分以上待って再確認するか、スポットなしで申し込めます。" />
            </>}
          </fieldset>
          <fieldset disabled={isLoading} style={{ display: 'grid', gap: '0.45rem', margin: 0, padding: '0.7rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)' }}>
            <legend style={{ padding: '0 0.25rem', color: '#c8c8d0', fontSize: '0.8rem', fontWeight: 700 }}>
              対戦相手（複数選択可）
            </legend>
            <div style={{ display: 'grid', gap: '0.35rem', maxHeight: '180px', overflowY: 'auto' }}>
              {opponents.map((team) => (
                <label key={team.id} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.35rem', color: '#fff', fontSize: '0.82rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={opponentTeamIds.includes(team.id)}
                    disabled={opponentTeamIds.length >= MAX_TEAM_BATTLE_OPPONENTS && !opponentTeamIds.includes(team.id)}
                    onChange={(event) => setOpponentTeamIds((selected) => (
                      event.target.checked
                        ? [...selected, team.id]
                        : selected.filter((id) => id !== team.id)
                    ))}
                    style={{ accentColor: '#00d4ff', width: '1rem', height: '1rem' }}
                  />
                  <span>{team.name}</span>
                </label>
              ))}
            </div>
            <span style={{ color: '#8e8e98', fontSize: '0.72rem' }}>
              選択中: {opponentTeamIds.length}/{MAX_TEAM_BATTLE_OPPONENTS}チーム
            </span>
          </fieldset>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
            <label style={{ display: 'grid', gap: '0.35rem', color: '#c8c8d0', fontSize: '0.75rem' }}>
              開始日時
              <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required disabled={isLoading}
                style={{ minWidth: 0, padding: '0.6rem', borderRadius: '9px', color: '#fff', colorScheme: 'dark', background: '#11131a', border: '1px solid rgba(255,255,255,0.12)' }} />
            </label>
            <label style={{ display: 'grid', gap: '0.35rem', color: '#c8c8d0', fontSize: '0.75rem' }}>
              終了日時
              <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required disabled={isLoading}
                style={{ minWidth: 0, padding: '0.6rem', borderRadius: '9px', color: '#fff', colorScheme: 'dark', background: '#11131a', border: '1px solid rgba(255,255,255,0.12)' }} />
            </label>
          </div>
          <button type="submit" disabled={isLoading || opponentTeamIds.length === 0 || (spotsEnabled && !region)} style={{
            padding: '0.75rem', border: 0, borderRadius: '10px', color: '#001015', fontWeight: 800,
            background: 'linear-gradient(135deg, #00d4ff, #00ff88)', cursor: isLoading ? 'wait' : 'pointer'
          }}>
            {isLoading ? '処理中…' : `${opponentTeamIds.length}チームへ対戦を申し込む`}
          </button>
        </form>
      )}

      {currentTeam && isLeader && opponents.length === 0 && (
        <div style={{ color: '#8e8e98', fontSize: '0.78rem' }}>対戦相手に選べる他のチームがありません。</div>
      )}

      {currentTeam && !isLeader && (
        <div style={{ color: '#8e8e98', fontSize: '0.78rem' }}>対戦の申し込み・承認はチームリーダーが行えます。</div>
      )}
      {!currentTeam && (
        <div style={{ color: '#8e8e98', fontSize: '0.78rem' }}>チームに参加すると、チーム対戦を利用できます。</div>
      )}

      {battles.length === 0 ? (
        <div style={{ padding: '0.8rem', color: '#85858f', textAlign: 'center', fontSize: '0.8rem' }}>対戦履歴はありません。</div>
      ) : (
        <div style={{ display: 'grid', gap: '0.7rem' }}>
          {battles.map((battle) => {
            const currentInvitation = battle.participants.find((participant) => participant.team_id === currentTeam?.id);
            const canRespond = battle.display_status === 'pending'
              && currentInvitation?.role === 'opponent'
              && currentInvitation.invitation_status === 'pending'
              && isLeader;
            const status = statusLabels[battle.display_status] || battle.display_status;
            const invitedTeams = battle.participants.filter((participant) => participant.role === 'opponent');
            const acceptedCount = invitedTeams.filter((participant) => participant.invitation_status === 'accepted').length;
            const topScore = Math.max(...battle.participants.map((participant) => participant.score));
            const leaders = battle.participants.filter((participant) => participant.score === topScore);
            const hasHolding = battle.scoring_version === 2;
            const areaLabel = battle.display_status === 'completed'
              ? '領域純増減（確定）'
              : battle.display_status === 'active' ? '領域純増減（暫定）' : '領域純増減';
            return (
              <article key={battle.id} style={{ minWidth: 0, overflowWrap: 'anywhere', padding: '0.85rem', borderRadius: '12px', background: 'rgba(0,0,0,0.24)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                  <strong style={{ minWidth: 0, overflowWrap: 'anywhere', color: '#fff', fontSize: '0.88rem' }}>
                    {battle.participants.find((participant) => participant.role === 'host')?.team_name}
                    <span style={{ color: '#00d4ff' }}> 対 </span>
                    {invitedTeams.map((participant) => participant.team_name).join('・')}
                  </strong>
                  <span style={{ flexShrink: 0, color: battle.display_status === 'active' ? '#00ff88' : '#b8b8c2', fontSize: '0.72rem', fontWeight: 700 }}>{status}</span>
                </div>
                <div style={{ marginTop: '0.45rem', color: '#aaaab4', fontSize: '0.75rem' }}>
                  {formatDateTime(battle.starts_at)} ～ {formatDateTime(battle.ends_at)}
                </div>
                {battle.map_rules_version === 1 && <div style={{ display: 'grid', gap: '.5rem', marginTop: '.6rem' }}>
                  <div style={{ color: battle.map_mode === 'shared' ? '#ffd58a' : '#42dfe5', fontSize: '.75rem', overflowWrap: 'anywhere' }}>{battle.map_mode === 'shared' ? '共有型 · 対戦外チームの干渉あり' : '専用型 · 参加チームのみ'} · {battle.spots_enabled ? `${battle.prefecture_name ? `${battle.prefecture_name} · ` : ''}スポット${battle.spot_count}個` : 'スポットなし'}</div>
                  <BattleRulesHelp battle={battle} />
                  <a href={`/dashboard?tab=map&battle=${encodeURIComponent(battle.id)}`} style={{ color: '#42dfe5', padding: '.55rem', border: '1px solid #345', borderRadius: 8, textAlign: 'center', fontSize: '.8rem' }}>対戦マップ・配置を確認</a>
                </div>}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.45rem', marginTop: '0.45rem', fontSize: '0.67rem' }}>
                  <span style={{ padding: '0.2rem 0.45rem', borderRadius: '5px', color: hasHolding ? '#42dfe5' : '#b8b8c2', background: hasHolding ? 'rgba(66,223,229,0.08)' : 'rgba(255,255,255,0.06)' }}>
                    {battle.map_rules_version === 1 ? '対戦マップルール · 保持あり' : hasHolding ? '旧マップルール v2 · 保持あり' : '旧ルール v1 · 保持なし'}
                  </span>
                  {battle.display_status === 'active' && <span style={{ color: '#8994a2' }}><AppIcon name="refresh" /> 30秒ごとに更新</span>}
                  {battle.display_status === 'completed' && <span style={{ color: '#8994a2' }}><AppIcon name="lock" /> 終了時点で確定</span>}
                </div>
                <div style={{ marginTop: '0.35rem', color: '#8994a2', fontSize: '0.66rem', lineHeight: 1.6 }}>
                  申請時の換算: 1km = {battle.distance_points_per_km}pt · 領域純増減1,000m² = {battle.territory_points_per_1000_sqm}pt
                  {hasHolding && <div>保持: 1,000m²を全期間 = {battle.holding_points_per_1000_sqm_full_period}pt</div>}
                </div>
                {battle.display_status === 'pending' && (
                  <div style={{ marginTop: '0.45rem', color: '#aaaab4', fontSize: '0.73rem' }}>
                    相手チームの承認: {acceptedCount}/{invitedTeams.length}
                  </div>
                )}
                <div style={{ display: 'grid', gap: '0.3rem', marginTop: '0.6rem' }}>
                  {battle.participants.map((participant) => (
                    <div key={participant.team_id} style={{ padding: '0.6rem', borderRadius: '8px', background: 'rgba(255,255,255,0.035)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.6rem', alignItems: 'center' }}>
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere', color: '#d8d8df', fontSize: '0.78rem' }}>
                          {participant.team_name}{participant.role === 'host' ? '（主催）' : ''}
                          {battle.display_status !== 'cancelled' && participant.invitation_status !== 'accepted' && ` · ${participant.invitation_status === 'pending' ? '承認待ち' : '辞退'}`}
                        </span>
                        <strong style={{ minWidth: 0, maxWidth: '45%', overflowWrap: 'anywhere', color: '#fff', fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                          <span style={{ display: 'block', color: '#8994a2', fontSize: '0.6rem', fontWeight: 400 }}>
                            {battle.display_status === 'active' ? '暫定合計' : battle.display_status === 'completed' ? '確定合計' : '合計'}
                          </span>
                          {Number(participant.score).toLocaleString('ja-JP', { maximumFractionDigits: 2 })} pt
                        </strong>
                      </div>
                      <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) fit-content(45%)', overflowWrap: 'anywhere', gap: '0.35rem 0.5rem', margin: '0.5rem 0 0', color: '#aeb6c2', fontSize: '0.67rem', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums' }}>
                        <dt><AppIcon name="run" /> 距離 · {((participant.distance_m || 0) / 1000).toFixed(2)}km</dt>
                        <dd style={{ margin: 0, textAlign: 'right' }}>{Number(participant.distance_points || 0).toFixed(2)}pt</dd>
                        <dt><AppIcon name="layers" /> {areaLabel} · {formatSigned(participant.territory_delta_sqm || 0, 1)}m²</dt>
                        <dd style={{ margin: 0, textAlign: 'right', color: participant.territory_points < 0 ? '#ff8888' : undefined }}>{formatSigned(participant.territory_points || 0, 2)}pt</dd>
                        <dt>
                          <AppIcon name="timer" /> {hasHolding ? '保持（獲得済み）' : '保持'}
                          {hasHolding && <span style={{ display: 'block', paddingLeft: '1.1rem', color: '#8994a2', fontSize: '0.63rem' }}>
                            {((participant.holding_area_sqm_seconds || 0) / 3600).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}m²·時間
                          </span>}
                        </dt>
                        <dd style={{ margin: 0, textAlign: 'right', color: hasHolding ? '#42dfe5' : '#8994a2' }}>
                          {hasHolding ? `${Number(participant.holding_points || 0).toFixed(2)}pt` : '対象外（旧ルール）'}
                        </dd>
                      </dl>
                      {battle.spots_enabled && <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '.35rem', color: '#ffd58a', fontSize: '.7rem', margin: '.5rem 0 0' }}>
                        <dt>保持バフ（追加分）</dt><dd style={{ margin: 0 }}>{participant.holding_bonus_points.toFixed(2)}pt</dd>
                        <dt>スポット初回 · {participant.captured_spots}個</dt><dd style={{ margin: 0 }}>{participant.spot_capture_points.toFixed(2)}pt</dd>
                      </dl>}
                    </div>
                  ))}
                </div>
                {battle.display_status === 'completed' && (
                  <div style={{ marginTop: '0.3rem', color: '#00d4ff', fontSize: '0.75rem', fontWeight: 700 }}>
                    {leaders.length > 1 ? `同率1位: ${leaders.map((participant) => participant.team_name).join('・')}` : `1位: ${leaders[0]?.team_name}`}
                  </div>
                )}
                {canRespond && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.7rem' }}>
                    <button type="button" onClick={() => void handleDecision(battle.id, 'accept')} disabled={isLoading}
                      style={{ flex: 1, padding: '0.55rem', border: 0, borderRadius: '8px', color: '#00120a', background: '#00ff88', fontWeight: 800, cursor: 'pointer' }}>
                      承認
                    </button>
                    <button type="button" onClick={() => void handleDecision(battle.id, 'reject')} disabled={isLoading}
                      style={{ flex: 1, padding: '0.55rem', border: '1px solid rgba(255,100,100,0.35)', borderRadius: '8px', color: '#ff8888', background: 'rgba(255,68,68,0.08)', fontWeight: 700, cursor: 'pointer' }}>
                      辞退
                    </button>
                  </div>
                )}
                {battle.can_cancel && (
                  <button type="button" onClick={() => void handleCancelBattle(battle.id)} disabled={isLoading}
                    style={{ width: '100%', marginTop: '0.7rem', padding: '0.55rem', border: '1px solid rgba(255,100,100,0.4)', borderRadius: '8px', color: '#ff8888', background: 'rgba(255,68,68,0.08)', fontWeight: 700, cursor: isLoading ? 'wait' : 'pointer' }}>
                    {isLoading ? '処理中…' : '対戦の申し込みを取り消す'}
                  </button>
                )}
                {battle.can_delete_history && (
                  <button type="button" onClick={() => void handleDeleteHistory(battle.id)} disabled={isLoading}
                    style={{ width: '100%', marginTop: '0.5rem', padding: '0.55rem', border: '1px solid rgba(255,255,255,0.14)', borderRadius: '8px', color: '#c8c8d0', background: 'rgba(255,255,255,0.035)', fontWeight: 700, cursor: isLoading ? 'wait' : 'pointer' }}>
                    {isLoading ? '処理中…' : '自分の履歴から削除'}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
