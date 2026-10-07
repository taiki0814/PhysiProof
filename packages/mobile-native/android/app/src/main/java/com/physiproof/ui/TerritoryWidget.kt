package com.physiproof.ui

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.*
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

/**
 * ホーム画面から領域獲得を促すウィジェット。
 * Jetpack Glance を使用し、Compose ライクな宣言的 UI で構築しています。
 */
class TerritoryWidget : GlanceAppWidget() {

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        provideContent {
            WidgetContent()
        }
    }

    @Composable
    private fun WidgetContent() {
        Column(
            modifier = GlanceModifier
                .fillMaxSize()
                .background(Color.White)
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "PhysiProof Status",
                style = TextStyle(color = ColorProvider(Color.Gray))
            )
            Spacer(modifier = GlanceModifier.height(8.dp))
            
            Row(
                modifier = GlanceModifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = GlanceModifier
                        .size(24.dp)
                        .background(Color(0xFF00FF88))
                ) {}
                Spacer(modifier = GlanceModifier.width(12.dp))
                Text(
                    text = "Run to claim your area",
                    style = TextStyle(color = ColorProvider(Color.Black))
                )
            }
            
            Spacer(modifier = GlanceModifier.height(4.dp))
            Text(
                text = "Your next run expands your territory",
                style = TextStyle(color = ColorProvider(Color.Green))
            )
        }
    }
}

/**
 * ウィジェットの更新を受け取るレシーバー。
 */
class TerritoryWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TerritoryWidget()
}
