import React from 'react';
import type { TeamBattleSummary } from '@my-app/shared';
import InfoHint from './InfoHint';

/** Rule help stays collapsed by default; each topic is accessible by tap/keyboard. */
export default function BattleRulesHelp({ battle }: { battle?: TeamBattleSummary }) {
  const multiplier = battle?.spot_holding_multiplier ?? 1.2;
  return <details style={{ textAlign: 'left', color: '#c3ccd8', fontSize: '.78rem', border: '1px solid rgba(66,223,229,.18)', borderRadius: 10, padding: '.65rem .8rem' }}>
    <summary style={{ cursor: 'pointer', color: '#42dfe5', fontWeight: 700 }}>対戦の遊び方・得点ルール</summary>
    <div style={{ display: 'grid', gap: '.7rem', marginTop: '.8rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>マップの違い
        <InfoHint label="対戦マップ" text="専用型は対戦ごとに空の領域から開始。個人・通常チーム・別の対戦は干渉しません。共有型は通常のチーム領域を使うため、対戦外チームの奪取も領域得点に影響します。個人領域は常に独立。形式と配置は申込時に固定されます。" /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>走行と勝敗
        <InfoHint label="走行・得点" text="マップで対戦を選択してから、オンラインでチーム走行を開始してください。開始・終了が対戦期間内の走行だけが、選んだ1対戦の距離得点になります。領域はサーバーへの保存完了が終了時刻より前であることが必要です。共有型では通常チーム走行による領域変更も反映されます。合計は距離＋終了時の領域純増減＋保持＋スポット。領域減少はマイナス、保持は純増が0以下だと停止。個人距離・走行開始時のチーム貢献にも記録されます。人数差の補正はありません。" /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>スポットと保持バフ
        <InfoHint label="スポットの効果" text={`効果は対戦中のみです。スポットの中心を領域の内側に入れて保存すると、そのスポットを持つ「つながった領域」の保持得点だけが${multiplier}倍になります。離れた領域には効果なし。同じ領域の複数スポットで倍率は重ね掛けしません。共有型の古い領域は、つなげてもバフ対象外。増えた領域のバフ面積はチーム全体の純増面積までです。奪取・分断で効果は切り替わり、獲得済みの保持得点は残ります。対戦外チームはバフもボーナスも得られません。`} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>初回ボーナス・配点
        <InfoHint label="配点" text={`各チームが各スポットを初めて獲得したときだけ、100m走行分の距離得点を追加します。同じスポットの取り返しでは増えませんが、別のスポットを取れば加点されます。保持得点は面積×実際の保持時間を全対戦時間で割って換算。${battle ? `この対戦は1km=${battle.distance_points_per_km}pt、領域1,000m²=${battle.territory_points_per_1000_sqm}pt、1,000m²を全期間保持=${battle.holding_points_per_1000_sqm_full_period}pt、スポット初回=${battle.spot_capture_points}pt。` : '具体的な係数は各対戦カードで確認できます。'}終了後は得点を固定します。既存の旧対戦ルールは変更しません。`} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>配置・安全な利用
        <InfoHint label="配置と安全" text="指定中心の周辺に、ランダムにずらした約800m間隔の候補を作り、公開歩行路へ寄せます。地図上で確認できた場所のみを使うため、個数と間隔は地形により変わります。申込後の対戦マップで配置を確認してから承認してください。地図は実際の通行可否や安全を保証しません。私有地・車道などへ入らず、交通ルールと現地の案内を優先し、走行中は画面を操作しないでください。オフライン記録の後送はできません。" /></div>
    </div>
  </details>;
}
