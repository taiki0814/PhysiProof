package com.physiproof.data

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * 通信エラー時に計測データを一時保存するための Room エンティティ。
 */
@Entity(tableName = "measurements")
data class MeasurementEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val userId: String,
    val count: Int,
    val timestamp: String,
    val nonce: String,
    val steps: Int?,
    val distance: Double?,
    val sensorLogJson: String // センサーログの配列を JSON 文字列として保持
)
