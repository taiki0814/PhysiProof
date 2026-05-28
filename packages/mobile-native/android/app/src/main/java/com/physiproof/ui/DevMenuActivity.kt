package com.physiproof.ui

import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.physiproof.debug.NetworkLogger

/**
 * 開発者専用のデバッグメニュー画面。
 * リアルタイムのセンサー値の表示、および通信ログの確認が可能です。
 */
class DevMenuActivity : AppCompatActivity(), SensorEventListener {
    private lateinit var sensorManager: SensorManager
    private var accelerometer: Sensor? = null
    private lateinit var sensorTextView: TextView
    private lateinit var logTextView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // コードによる簡易レイアウト構築
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 40, 40, 40)
            backgroundColor = android.graphics.Color.parseColor("#121212")
        }

        val header = TextView(this).apply {
            text = "PhysiProof Developer Menu"
            setTextColor(android.graphics.Color.WHITE)
            textSize = 20f
            setPadding(0, 0, 0, 40)
        }
        root.addView(header)

        sensorTextView = TextView(this).apply {
            setTextColor(android.graphics.Color.parseColor("#00FF00"))
            textSize = 14f
            text = "Waiting for sensor data..."
        }
        root.addView(sensorTextView)

        val scroll = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        }
        logTextView = TextView(this).apply {
            setTextColor(android.graphics.Color.parseColor("#AAAAAA"))
            textSize = 12f
            setPadding(0, 40, 0, 0)
        }
        scroll.addView(logTextView)
        root.addView(scroll)

        setContentView(root)

        sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
        accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)

        NetworkLogger.setListener {
            runOnUiThread { updateLogs() }
        }
        updateLogs()
    }

    private fun updateLogs() {
        val sb = StringBuilder("--- RPC / AI COMMUNICATION LOGS ---\n\n")
        val logs = NetworkLogger.getLogs()
        if (logs.isEmpty()) {
            sb.append("No logs captured yet.")
        } else {
            logs.forEach {
                sb.append("[${it.type}] ${it.content}\n")
                sb.append("----------------------------\n")
            }
        }
        logTextView.text = sb.toString()
    }

    override fun onResume() {
        super.onResume()
        accelerometer?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_UI)
        }
    }

    override fun onPause() {
        super.onPause()
        sensorManager.unregisterListener(this)
    }

    override fun onSensorChanged(event: SensorEvent?) {
        event?.let {
            sensorTextView.text = """
                --- REAL-TIME SENSOR DATA ---
                X: ${String.format("%.4f", it.values[0])}
                Y: ${String.format("%.4f", it.values[1])}
                Z: ${String.format("%.4f", it.values[2])}
            """.trimIndent()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun onDestroy() {
        super.onDestroy()
        NetworkLogger.setListener(null)
    }
}
