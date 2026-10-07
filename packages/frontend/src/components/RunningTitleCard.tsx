import React from 'react';
import { getRunningTitleProgress, RUNNING_TITLE_DEFINITIONS } from '@my-app/shared';
import InfoHint from './InfoHint';

interface RunningTitleProps {
  totalDistanceM: number;
}

export const RunningTitleBadge: React.FC<RunningTitleProps> = ({ totalDistanceM }) => {
  const { current_title: title } = getRunningTitleProgress(totalDistanceM);
  return (
    <span className={`pp-running-title-badge${title ? '' : ' pp-running-title-badge--unearned'}`}>
      <span aria-hidden="true">{title ? '🏅' : '🏃'}</span>
      <span>{title?.name ?? '称号未獲得'}</span>
    </span>
  );
};

function formatRemainingDistance(distanceM: number): string {
  if (distanceM < 1_000) return `${Math.ceil(distanceM).toLocaleString('ja-JP')} m`;
  const km = Math.ceil(distanceM / 10) / 100;
  return `${km.toLocaleString('ja-JP', { maximumFractionDigits: 2 })} km`;
}

const RunningTitleCard: React.FC<RunningTitleProps & { showMilestones?: boolean }> = ({
  totalDistanceM,
  showMilestones = true,
}) => {
  const progress = getRunningTitleProgress(totalDistanceM);
  const next = progress.next_title;
  const remainingLabel = formatRemainingDistance(progress.remaining_distance_m);

  return (
    <section className="pp-running-title-card" aria-label="ランニング称号">
      <div className="pp-running-title-card__header">
        <span>ランニング称号</span>
        <InfoHint label="ランニング称号" text="個人・チーム活動の生涯累計距離で称号が上がります。活動モードや所属チームが変わっても累計を引き継ぎます。" />
        <span className="pp-running-title-card__stage">{progress.current_title?.level ?? 0} / {RUNNING_TITLE_DEFINITIONS.length}</span>
      </div>
      <div className="pp-running-title-card__name">
        <span aria-hidden="true">{progress.current_title ? '🏅' : '🏃'}</span>
        <strong>{progress.current_title?.name ?? '称号未獲得'}</strong>
      </div>
      <div className="pp-running-title-card__distance">
        生涯走行距離 <strong>{(progress.total_distance_m / 1_000).toLocaleString('ja-JP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km</strong>
      </div>
      {next ? (
        <>
          <div className="pp-running-title-card__next">
            <span>次は「{next.name}」</span>
            <strong>あと {remainingLabel}</strong>
          </div>
          <div
            className="pp-running-title-card__progress"
            role="progressbar"
            aria-label="次の称号への進捗"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.progress_ratio * 100}
            aria-valuetext={`${next.name}まであと${remainingLabel}`}
          >
            <div style={{ width: `${progress.progress_ratio * 100}%` }} />
          </div>
        </>
      ) : (
        <div className="pp-running-title-card__complete">最高位の称号を獲得しました！</div>
      )}
      {showMilestones && (
        <details className="pp-running-title-card__milestones">
          <summary>称号一覧</summary>
          <ol>
            {RUNNING_TITLE_DEFINITIONS.map((title) => {
              const earned = progress.total_distance_m >= title.required_distance_m;
              return (
                <li key={title.level} className={earned ? 'pp-running-title-earned' : undefined}>
                  <span aria-label={earned ? '獲得済み' : '未獲得'}>{earned ? '✓' : '○'}</span>
                  <span>{title.name}</span>
                  <span>{(title.required_distance_m / 1_000).toLocaleString('ja-JP')} km</span>
                </li>
              );
            })}
          </ol>
        </details>
      )}
    </section>
  );
};

export default RunningTitleCard;
