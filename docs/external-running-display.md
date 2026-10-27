# 外部ランニング連携（表示専用・初版）

## 利用箇所と対象
- ホームの「走行距離・外部連携」。アプリ計測の生涯個人距離は青、外部の直近30日分は紫。ラベルも併記し、異なる期間の合計を足さない。
- 初回の読取元はAndroid 14(API34)以降のHealth Connect。PhysiProof Runner 0.2.0以降が必要。ブラウザー/PWA/旧APK/iPhoneからの読取は未対応。Webでは本人の保存済み記録のみ閲覧・削除できる。
- 時計からのBluetooth直読ではない。提供元アプリがHealth Connectへ運動と距離を共有し、利用者が許可している必要がある。全機種への対応・リアルタイム同期・正確性は保証しない。

## 同意・同期・削除
1. 本人が保存・表示の説明にチェックし「同意してHealth Connectを連携」。OSの読み取り許可は本人が操作する。拒否しても通常機能は使える。
2. 別の「外部記録を同期」を押したときだけforegroundで読み取る。起動時やステップ計測開始時に健康記録を取得しない。自動バックグラウンド同期なし。
3. 完了済みのrunning/treadmill運動を直近30日から取得。手入力の運動は除外。同じ提供元・運動時間内のDistanceRecordをHealth Connectで集計。距離がない運動は除外し、歩数や歩行の全日距離から推定しない。提供元側の距離記録や運動分類自体の誤差・改変を防ぐ機能ではない。
4. 最大500ランニング、運動一覧20ページまで。部分失敗・上限超過・期限切れでは既存の保存分を入れ替えない。同期成功時は最後の端末の30日スナップショットで全置換し、記録の訂正・削除を反映。複数端末の内容を足し合わせない。
5. 「外部連携を解除・記録を削除」は本人のサーバー保存分を削除し同意OFFにする。提供元の記録は消さない。OS権限の撤回は「端末の権限設定」から本人が行う。OS権限だけの撤回は過去に保存したサーバー記録の削除ではないことを説明する。

## 保存・公開と不変条件
- 本人限定、管理者・フレンド・チームにも公開しない。保護APIはopaque sessionで本人を決定しprivate/no-store。URLやbodyのuser_idで切替不能。
- 保存項目は提供元package、記録ID、開始/終了時刻、距離と同期状態。GPS経路・現在地・心拍・睡眠・歩数・デバイス固有IDは外部連携から読み取らない。ログ・永続端末キャッシュにも健康記録を出さない。
- 外部記録は独立したexternal_running_links/recordsテーブル。running_sessions/steps/territories/battle/course/reward/missionへ書き込まない。個人のアプリ累計・チーム貢献・ランキング・距離称号も変更しない。
- 時間が重なる外部運動は距離の長い方を代表にする保守的な表示。重複しない短い運動まで除外される可能性はあるため除外件数を表示。アプリ計測と外部は常に別集計。
- 30日を過ぎる記録は即時表示対象外。既存5分cronでサーバーから削除（実行遅延はあり得る）。アカウント削除はFK cascade。リンク状態は解除後もrevisionのため残るが健康記録は残さない。
- 同期/解除はrevision+操作nonceの同一D1 batch。古い同期・競合・解除後再送は拒否。認証変更を跨いだnative応答は送信しない。途中書込失敗は全体rollback。

## 検証と実機で残る確認
- 実SQL/本物のテスト用opaque sessionで認証・所有者分離・容量・入力・差替え/再送/競合/解除/rollback/保持期限と既存ゲームデータ不変を検証。画面確認は明示したメモリー内架空データであり実測ではない。
- CIのAndroid SDK35ビルドとJava単体テストはコンパイル可能性の証拠であり実機連携の証拠ではない。
- 必須実機確認：Android14/15でOS説明画面・許可/部分拒否/拒否/権限取消、時計のランニングと同一提供元距離、手入力/歩行/距離なしの除外、重複、再同期時の修正/削除、ネット切断、ログアウト中の読取完了、端末設定遷移、解除後サーバー削除。Android8〜13では既存走行を保ち外部取込だけ未対応表示。
- Google Playでの公開時には健康データ利用の申告・プライバシーポリシーなどの審査対応が別途必要。ストア公開・新アカウント・課金・健康権限の代理許可は実施しない。

公式仕様：[Android14のHealth Connect](https://developer.android.com/health-and-fitness/health-connect/get-started)、[運動と関連データ](https://developer.android.com/health-and-fitness/health-connect/experiences/workouts)、[Framework aggregate API](https://developer.android.com/reference/android/health/connect/HealthConnectManager#aggregate(android.health.connect.AggregateRecordsRequest%3CT%3E,java.util.concurrent.Executor,android.os.OutcomeReceiver%3Candroid.health.connect.AggregateRecordsResponse%3CT%3E,android.health.connect.HealthConnectException%3E))。
