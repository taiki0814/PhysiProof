# PhysiProof Android Runner

実測歩数を取得するAndroid用ホスト。既存の`app/`内のKotlin試作とは分離した`runner`モジュールをビルドする。既存試作は削除していない。iOS版は含まない。

## ビルド・試す

- JDK17、Android SDK35、Gradle8.11.1、AGP8.9.2。Android8(API26)以上、歩数カウンター搭載の実機が必要。
- GitHub Actionsの **Build Android Runner** が単体テストとdebug APKビルドを実行する。成功したrunのArtifactsから **PhysiProof-Runner-debug** をダウンロード。保持7日。初回の配布/インストールは利用者自身が判断して行う。
- Android Studioではこの`android`フォルダーを開き、`runner`を選択。SDKの導入・ライセンス同意は開発者自身で行う。Gradle導入済みなら次のコマンド。

```powershell
gradle -p packages/mobile-native/android :runner:testDebugUnitTest :runner:assembleDebug
```

出力は`runner/build/outputs/apk/debug/runner-debug.apk`。debug署名は試験用でありストア公開用ではない。CIごとにdebug署名鍵が異なる場合、別ビルドを上書きできないことがある。既存アプリを削除すると端末内データが失われるので、安易に削除せずデータを確認する。

起動すると本番PhysiProofのログイン画面を表示する。認証情報は画面へ入力し、チャットに送らない。ランニング開始時に正確な位置情報・身体活動の許可を端末で選択。通知許可も推奨。位置統計への同意はアプリ権限とは別で、初期OFFのまま歩数計測できる。

## 構成と安全策

- 信頼するWebViewトップレベルoriginは`https://physiproof-frontend.pages.dev`のみ。AndroidX WebKitのorigin制限付きメッセージ通信、main-frameチェックを使用。汎用`addJavascriptInterface`は使わない。
- ファイル/コンテンツURL読込・HTTP混在を許可せず、TLSエラーは中止。他サイトへ認証トークンを渡さない。ファイル選択は利用者の明示操作。
- 開始時のみ既存ログインのopaque tokenを渡し、セッションID/token/GPSはサービスのメモリーで保持。ログ出力・オフラインキュー・別サービスへの転送なし。
- `TYPE_STEP_COUNTER`を走行開始後から差分計測。location型foreground service、計測中通知、通知の「中止」を提供。GPSと歩数を約20秒ごとに本人の走行APIへ送信し、通信失敗時は停止・放棄し、後送しない。
- ネット接続がない起動・停止サービス・プロセス終了を、保存済み経路だけで実測走行として復活させない。
- バックグラウンド動作はOS/メーカーの制限に依存する。メモリー/プロセスを失った場合の歩数復元は行わない。
- 画面消灯中の短いオンライン送信間隔を維持するため、計測通知のある走行中だけ60秒期限のpartial wake lockを更新する。終了・中止・失敗・サービス破棄時に解放。省電力制御の無効化は要求しない。GPSとCPU利用で電池を消費するため、実機で消費量も確認する。[Androidの実装指針](https://developer.android.com/develop/background-work/background-tasks/awake/wakelock/best-practices)を参照。

## 必須の実機確認（自動テスト/ビルドだけでは確認できない）

1. 権限未許可/拒否/概算位置のみ/身体活動拒否時に、勝手に実測開始されない。
2. 同意OFFで100〜200歩を手数え比較。開始前の端末累計が混入せず、計測終了後の本日/累計に反映。
3. 静止して振る場合、移動確認歩数が増えない。GPSの悪い屋内では精度不足表示となり、不正と断定しない。
4. 屋外歩行/走行、低速、急カーブ、停止再開を比較。既存の距離/領域/チーム帰属/終了処理を確認。
5. 画面消灯・他アプリへ移動して2〜5分後、通知と計測が続き、復帰時にサービス内経路と実測が更新される。終了ボタン連打で失敗扱いにならない。
6. 機内モード/圏外で停止し、復帰しても途切れた間の歩数が後送されない。通知の中止、ログアウト、強制終了から古い計測が復活しない。
7. 位置統計の同意ONは、利用者自身の明示操作で行う。次の走行からのみ粗い公共エリアを記録。撤回で削除。現在地を公開する機能ではない。
8. API26/29/33/35の実端末で通知、権限、キーボード、ファイルアップロード、画面端の余白を確認。エミュレーターに実センサーがなくても距離換算で代用しない。

ステップ実機試験はリリース時点で未実施。ビルド成功と実端末での測定精度を混同しない。

詳細・保存期限・不正抑止の限界は[機能仕様](../../../docs/measured-steps-and-place-trends.md)。

## 外部連携（0.2.0以降）

Android14以降ではホームの「走行距離・外部連携」からHealth Connectのランニング距離を読み取れる。本人が同意・権限許可・同期を操作する。READ_EXERCISE/READ_DISTANCEのみ、Health Connectへの書き込み・経路/心拍/歩数の読み取り・バックグラウンド同期なし。Android8〜13の既存走行はそのまま使えるが外部取り込みは未対応。

外部記録は本人だけの直近30日の参考距離。アプリ計測・チーム・対戦・領域・周回・称号とは別。解除時にサーバー保存分を削除でき、OS権限は端末設定で撤回する。時計側の提供元アプリが運動と同じ提供元の距離を共有している必要がある。実機での読み取り検証は別途必要。[仕様・実機チェック](../../../docs/external-running-display.md)。

参考：[Androidの歩数センサー](https://developer.android.com/develop/sensors-and-location/sensors/sensors_motion)、[安全なWebView通信](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges)。
