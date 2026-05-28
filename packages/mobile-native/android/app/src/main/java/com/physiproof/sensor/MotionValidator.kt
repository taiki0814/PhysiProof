package com.physiproof.sensor

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.sqrt

/**
 * Proof of Exercise (運動強度の証明) を生成するクラス。
 * LINEAR_ACCELERATION を監視し、Shared のスキーマ構造に合わせたデータを生成する。
 */
class MotionValidator(private val sensorManager: SensorManager) : SensorEventListener {
    private val sensor: Sensor? = sensorManager.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
    private var isActive = false
    private val sensorLogs = mutableListOf<JSONObject>()

    /**
     * 計測を開始する。デフォルトは SENSOR_DELAY_NORMAL (電力節約)。
     */
    fun start() {
        if (!isActive && sensor != null) {
            sensorManager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)
            isActive = true
        }
    }

    /**
     * 計測を停止する。
     */
    fun stop() {
        if (isActive) {
            sensorManager.unregisterListener(this)
            isActive = false
        }
    }

    /**
     * 運動状態に応じてサンプリングレートを切り替える。
     * @param isExercising 運動中なら SENSOR_DELAY_GAME、それ以外は SENSOR_DELAY_NORMAL。
     */
    fun setExerciseMode(isExercising: Boolean) {
        if (isActive && sensor != null) {
            sensorManager.unregisterListener(this)
            val delay = if (isExercising) SensorManager.SENSOR_DELAY_GAME else SensorManager.SENSOR_DELAY_NORMAL
            sensorManager.registerListener(this, sensor, delay)
        }
    }

    override fun onSensorChanged(event: SensorEvent?) {
        event?.let {
            if (it.sensor.type == Sensor.TYPE_LINEAR_ACCELERATION) {
                val x = it.values[0]
                val y = it.values[1]
                val z = it.values[2]
                val timestamp = System.currentTimeMillis()

                // 加速度のノルムを計算
                val norm = sqrt((x * x + y * y + z * z).toDouble())

                // shared/src/schemas/pushup.schema.ts の構造に合致するようパッキング
                val logEntry = JSONObject().apply {
                    put("x", x)
                    put("y", y)
                    put("z", z)
                    put("t", timestamp)
                    // 計算効率化のためノルムも保持
                    put("norm", norm)
                }
                
                synchronized(sensorLogs) {
                    sensorLogs.add(logEntry)
                }
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
    }

    /**
     * 蓄積されたデータを JSONArray 形式で取得する。
     */
    fun getPackedData(): JSONArray {
        return synchronized(sensorLogs) {
            JSONArray(sensorLogs)
        }
    }

    /**
     * ログをクリアする。
     */
    fun clearData() {
        synchronized(sensorLogs) {
            sensorLogs.clear()
        }
    }
}
