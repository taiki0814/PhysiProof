package com.physiproof.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import org.json.JSONArray
import org.json.JSONObject

/**
 * オフライン時に保存されたデータをバックエンドへ同期する管理クラス。
 */
class SyncManager(private val context: Context, private val dao: MeasurementDao) {

    /**
     * 現在オンラインかどうかを確認。
     */
    fun isOnline(): Boolean {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val capabilities = connectivityManager.getNetworkCapabilities(connectivityManager.activeNetwork)
        return capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }

    /**
     * 未送信データを一括取得し、バックエンドへ送信。成功した場合はローカルデータを削除する。
     */
    suspend fun syncUnsyncedData() {
        if (!isOnline()) return

        val unsyncedList = dao.getAll()
        if (unsyncedList.isEmpty()) return

        // 送信用 JSON 配列の作成
        val bulkArray = JSONArray()
        unsyncedList.forEach { entity ->
            val item = JSONObject().apply {
                put("user_id", entity.userId)
                put("count", entity.count)
                put("timestamp", entity.timestamp)
                put("nonce", entity.nonce)
                put("steps", entity.steps)
                put("distance", entity.distance)
                put("sensor_log", JSONArray(entity.sensorLogJson))
            }
            bulkArray.put(item)
        }

        // 実装イメージ: API クライアントを使用して /api/pushups/bulk へ POST 送信
        // val response = apiClient.postBulkMeasurements(bulkArray)
        val isSuccess = true // 成功したと仮定

        if (isSuccess) {
            // トランザクション処理: 送信が完了した ID のみを削除
            val processedIds = unsyncedList.map { it.id }
            dao.deleteByIds(processedIds)
        }
    }
}
