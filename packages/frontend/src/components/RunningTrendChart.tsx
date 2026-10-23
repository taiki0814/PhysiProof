import React from 'react';
import type {RunningTrendResponse,RunningTrendCell,PlaceTrendResponse} from '@my-app/shared';
const days=['日','月','火','水','木','金','土'],displayDays=[1,2,3,4,5,6,0];
const levels:Record<RunningTrendCell['level'],string>={none:'記録なし',insufficient:'データ不足',low:'少なめ',medium:'中程度',high:'多め'};
export default function RunningTrendChart({data}:{data:RunningTrendResponse|PlaceTrendResponse}){
  const personal='scope' in data&&data.scope==='personal',passage=data.method==='place_passages';
  return <div className="pp-trends-chart-wrap"><table className="pp-trends-chart">
    <caption className="pp-trends-sr">曜日と2時間帯ごとの{passage?'通過':'走行開始'}傾向。{personal?'数値は自分の走行回数。':passage?'5人未満または3日未満の区分はデータ不足。':'5人未満の区分はデータ不足。'}</caption>
    <thead><tr><th scope="col">時刻</th>{displayDays.map(day=><th key={day} scope="col">{days[day]}</th>)}</tr></thead>
    <tbody>{Array.from({length:12},(_,slot)=><tr key={slot}>
      <th scope="row">{slot*2}–{slot*2+2}<span className="pp-trends-sr">時</span></th>
      {displayDays.map(day=>{
        const cell=data.cells.find(c=>c.weekday===day&&c.slot===slot)!;
        const description=`${days[day]}曜日 ${slot*2}〜${slot*2+2}時：${cell.count===null?levels[cell.level]:`${cell.count}回`}`;
        return <td key={day} title={description} aria-label={description} className={`pp-trends-level-${cell.level}`}>
          {cell.count===null?<span aria-hidden="true">{cell.level==='insufficient'?'—':''}</span>:cell.count||<span aria-hidden="true">·</span>}
        </td>;
      })}
    </tr>)}</tbody>
  </table></div>;
}
