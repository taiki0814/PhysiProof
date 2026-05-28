package com.physiproof.security

import android.content.Context
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest

/**
 * 端末の真正性を検証する Play Integrity API を管理するクラス。
 * エミュレータや改ざんされた OS からのアクセスを防ぐためのトークンを取得します。
 */
class IntegrityManager(context: Context) {
    
    private val integrityManager = IntegrityManagerFactory.create(context)
    
    // 注意: 本来は Google Cloud Console で取得したプロジェクト番号を指定します。
    private val cloudProjectNumber = 1234567890L 

    /**
     * Google Play サーバーから整合性トークンを取得します。
     * @param nonce リプレイ攻撃防止用のナンス（計測 ID など）
     */
    fun fetchIntegrityToken(nonce: String, onSuccess: (String) -> Unit, onError: (Exception) -> Unit) {
        val request = IntegrityTokenRequest.builder()
            .setCloudProjectNumber(cloudProjectNumber)
            .setNonce(nonce)
            .build()

        integrityManager.requestIntegrityToken(request)
            .addOnSuccessListener { response ->
                onSuccess(response.token())
            }
            .addOnFailureListener { e ->
                onError(e)
            }
    }
}
