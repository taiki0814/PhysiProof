import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MAX_TEAM_BATTLE_OPPONENTS } from '@my-app/shared';
import type { Team, TeamBattleSummary } from '@my-app/shared';
import client from '../lib/hc';

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

  const isLeader = currentTeam?.owner_id === currentUserId;
  const opponents = teams.filter((team) => team.id !== currentTeam?.id);

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
  }, [refreshBattles, currentTeam?.id]);

  const handleCreateBattle = async (event: React.FormEvent) => {
    event.preventDefault();
    if (opponentTeamIds.length === 0 || !startsAt || !endsAt) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await client.api.teams.battles.$post({
        json: {
          opponent_team_ids: opponentTeamIds,
          starts_at: new Date(startsAt).toISOString(),
          ends_at: new Date(endsAt).toISOString(),
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
      setError('通信エラーが発生しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDecision = async (battleId: string, decision: 'accept' | 'reject') => {
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
      <div>
        <div style={{ color: '#00d4ff', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.08em' }}>TEAM BATTLE</div>
        <h3 style={{ margin: '0.25rem 0', color: '#fff', fontSize: '1.15rem' }}>チーム対戦</h3>
        <p style={{ margin: 0, color: '#a0a0aa', fontSize: '0.78rem', lineHeight: 1.6 }}>
          期間中にオンラインで記録・検証された腕立て1回を1ポイントとして加算します。全ての招待チームが承認すると開催確定し、1チームでも辞退すると中止です。人数差の補正はせず、実ポイントの合計で競います。主催チームは申請時、招待チームは承認時にメンバーを固定し、固定後にチームを離れると以降の記録は対象外です。
        </p>
      </div>

      {error && (
        <div role="alert" style={{ padding: '0.65rem 0.8rem', borderRadius: '10px', color: '#ff7777', background: 'rgba(255,68,68,0.1)', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      {currentTeam && isLeader && opponents.length > 0 && (
        <form onSubmit={handleCreateBattle} style={{ display: 'grid', gap: '0.65rem' }}>
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
          <button type="submit" disabled={isLoading || opponentTeamIds.length === 0} style={{
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
            return (
              <article key={battle.id} style={{ padding: '0.85rem', borderRadius: '12px', background: 'rgba(0,0,0,0.24)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center' }}>
                  <strong style={{ color: '#fff', fontSize: '0.88rem' }}>
                    {battle.participants.find((participant) => participant.role === 'host')?.team_name}
                    <span style={{ color: '#00d4ff' }}> 対 </span>
                    {invitedTeams.map((participant) => participant.team_name).join('・')}
                  </strong>
                  <span style={{ flexShrink: 0, color: battle.display_status === 'active' ? '#00ff88' : '#b8b8c2', fontSize: '0.72rem', fontWeight: 700 }}>{status}</span>
                </div>
                <div style={{ marginTop: '0.45rem', color: '#aaaab4', fontSize: '0.75rem' }}>
                  {formatDateTime(battle.starts_at)} ～ {formatDateTime(battle.ends_at)}
                </div>
                {battle.display_status === 'pending' && (
                  <div style={{ marginTop: '0.45rem', color: '#aaaab4', fontSize: '0.73rem' }}>
                    相手チームの承認: {acceptedCount}/{invitedTeams.length}
                  </div>
                )}
                <div style={{ display: 'grid', gap: '0.3rem', marginTop: '0.6rem' }}>
                  {battle.participants.map((participant) => (
                    <div key={participant.team_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', padding: '0.35rem 0.45rem', borderRadius: '7px', background: 'rgba(255,255,255,0.035)' }}>
                      <span style={{ color: '#d8d8df', fontSize: '0.78rem' }}>
                        {participant.team_name}{participant.role === 'host' ? '（主催）' : ''}
                        {battle.display_status !== 'cancelled' && participant.invitation_status !== 'accepted' && ` · ${participant.invitation_status === 'pending' ? '承認待ち' : '辞退'}`}
                      </span>
                      <strong style={{ color: '#fff', fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}>
                        {Number(participant.score).toLocaleString()} pt
                      </strong>
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
