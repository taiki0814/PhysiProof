package com.physiproof.ui

import android.graphics.Color
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.Polygon
import com.google.android.gms.maps.model.PolygonOptions
import androidx.core.graphics.ColorUtils

/**
 * ユーザーの軌跡を「陣地（Territory）」として Google Maps 上に描画するクラス。
 * 防衛レベルに応じてポリゴンの色を青〜赤にグラデーションさせます。
 */
class TerritoryMapRenderer(private val googleMap: GoogleMap) {

    /**
     * 軌跡データをポリゴンとして描画する。
     * @param points 軌跡の座標リスト
     * @param fortification 防衛レベル (0.0: 低 〜 1.0: 高)
     */
    fun drawTerritory(points: List<LatLng>, fortification: Float): Polygon {
        // 防衛レベルに応じた色計算 (青: 低 -> 赤: 高)
        val color = interpolateColor(Color.BLUE, Color.RED, fortification)
        
        val polygonOptions = PolygonOptions()
            .addAll(points)
            .fillColor(adjustAlpha(color, 0.4f)) // 塗りつぶしは透明度40%
            .strokeColor(color)
            .strokeWidth(5f)
            .geodesic(true)

        return googleMap.addPolygon(polygonOptions)
    }

    private fun interpolateColor(color1: Int, color2: Int, fraction: Float): Int {
        return ColorUtils.blendARGB(color1, color2, fraction.coerceIn(0f, 1f))
    }

    private fun adjustAlpha(color: Int, factor: Float): Int {
        val alpha = (Color.alpha(color) * factor).toInt()
        val red = Color.red(color)
        val green = Color.green(color)
        val blue = Color.blue(color)
        return Color.argb(alpha, red, green, blue)
    }
}
