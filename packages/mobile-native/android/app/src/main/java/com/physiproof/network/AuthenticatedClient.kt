package com.physiproof.network

import com.google.firebase.auth.FirebaseAuth
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response

/**
 * Firebase Auth の ID トークンを管理し、API リクエストに自動付与するクライアント。
 * Hono RPC (HttpClient) のバックエンドとして機能することを想定しています。
 */
class AuthenticatedClient {

    private val auth = FirebaseAuth.getInstance()

    /**
     * OkHttp 用のインターセプター。
     * リクエスト送信直前に Firebase ID トークンをヘッダーに差し込みます。
     */
    private val authInterceptor = Interceptor { chain ->
        val user = auth.currentUser
        val requestBuilder = chain.request().newBuilder()

        // 注意: プロダクションでは getIdToken(forceRefresh) を非同期で呼び出し、
        // 完了を待機してからリクエストを続行するのが理想的です。
        // ここでは SDK のキャッシュされたトークンを利用するシンプルな実装を示します。
        user?.let {
            // FirebaseUser.getIdToken() はトークンの有効期限が切れている場合に自動更新を試みます。
            // ※本来は Task の完了を待機する処理が必要です。
            val tokenTask = it.getIdToken(false)
            if (tokenTask.isSuccessful) {
                val token = tokenTask.result?.token
                if (token != null) {
                    requestBuilder.header("Authorization", "Bearer $token")
                }
            }
        }

        chain.proceed(requestBuilder.build())
    }

    /**
     * 認証済み OkHttpClient を生成します。
     */
    fun getOkHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .build()
    }
}
