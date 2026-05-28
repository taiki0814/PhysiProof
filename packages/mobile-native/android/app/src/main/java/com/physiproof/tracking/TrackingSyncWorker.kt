package com.physiproof.tracking

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 取得した計測データをバックグラウンドでバックエンドに同期するための Worker。
 * 定期的な実行や、オフライン時のリトライ処理を管理する。
 */
class TrackingSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            // 実装イメージ:
            // 1. ローカルDBから未送信データを取得
            // 2. packages/shared のスキーマに合わせた JSON を作成
            // 3. Hono API エンドポイントに POST 送信
            
            // 今回はモックとして成功を返す
            Result.success()
        } catch (e: Exception) {
            // ネットワークエラー等の場合は再試行
            Result.retry()
        }
    }
}
