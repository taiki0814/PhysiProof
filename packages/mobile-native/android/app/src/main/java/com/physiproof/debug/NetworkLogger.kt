package com.physiproof.debug

import java.util.*

/**
 * Android アプリ内の通信ログや AI のプロンプト内容を保持するデバッグ用ロガー。
 */
data class LogEntry(
    val id: String = UUID.randomUUID().toString(),
    val type: String,
    val content: String,
    val timestamp: Long = System.currentTimeMillis()
)

object NetworkLogger {
    private val logs = mutableListOf<LogEntry>()
    private var listener: (() -> Unit)? = null

    fun log(type: String, content: String) {
        synchronized(this) {
            logs.add(0, LogEntry(type = type, content = content))
            if (logs.size > 100) logs.removeAt(logs.size - 1)
        }
        listener?.invoke()
    }

    fun getLogs() = synchronized(this) { logs.toList() }
    
    fun setListener(l: (() -> Unit)?) {
        listener = l
    }
}
