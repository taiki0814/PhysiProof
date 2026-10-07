package com.physiproof.ui

import android.graphics.Color
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.Polygon
import com.google.android.gms.maps.model.PolygonOptions

/**
 * ユーザーの軌跡を「陣地（Territory）」として Google Maps 上に描画するクラス。
 * 取得領域をアプリ共通のカラーで描画します。
 */
class TerritoryMapRenderer(private val googleMap: GoogleMap) {

    /**
     * 軌跡データをポリゴンとして描画する。
     * @param points 軌跡の座標リスト
     */
    fun drawTerritory(points: List<LatLng>): Polygon {
        val color = Color.rgb(0, 255, 136)
        val polygonOptions = PolygonOptions()
            .addAll(points)
            .fillColor(adjustAlpha(color, 0.4f)) // 塗りつぶしは透明度40%
            .strokeColor(color)
            .strokeWidth(5f)
            .geodesic(true)

        return googleMap.addPolygon(polygonOptions)
    }

    private fun adjustAlpha(color: Int, factor: Float): Int {
        val alpha = (Color.alpha(color) * factor).toInt()
        val red = Color.red(color)
        val green = Color.green(color)
        val blue = Color.blue(color)
        return Color.argb(alpha, red, green, blue)
    }
}
