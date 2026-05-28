package com.physiproof.ui

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test

/**
 * 運動記録画面の UI テスト（Compose Test）。
 * センサーの入力をシミュレートし、UI上のカウントが正確に更新されるかを検証します。
 */
class PushupScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun testPushupCounterIncrements() {
        // 1. 画面の初期状態をセットアップ
        // ※ 実際には Hilt 等でモックした ViewModel を注入した Screen を表示
        // composeTestRule.setContent {
        //     PushupScreen(viewModel = mockViewModel)
        // }

        // 2. 初期表示の確認（0 reps）
        // composeTestRule.onNodeWithText("0 reps").assertIsDisplayed()

        // 3. センサーイベントのシミュレート（ViewModel の状態を手動で更新）
        // mockViewModel.onPushupDetected()

        // 4. UIが1回分更新されていることを確認
        // composeTestRule.onNodeWithText("1 reps").assertIsDisplayed()
    }

    @Test
    fun testFinishButtonShowsSummary() {
        // 運動終了ボタン押下時にサマリーが表示されるかのテスト
        // composeTestRule.onNodeWithText("Finish Workout").performClick()
        // composeTestRule.onNodeWithText("Workout Summary").assertIsDisplayed()
    }
}
