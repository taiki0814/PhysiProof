package com.physiproof.runner;
import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;
import android.widget.ScrollView;

/** Local, accessible rationale: no login, JavaScript or external navigation. */
public final class HealthPrivacyActivity extends Activity {
    @Override public void onCreate(Bundle state){super.onCreate(state);TextView text=new TextView(this);text.setPadding(32,48,32,32);text.setTextSize(18);
        text.setText("PhysiProof 外部ヘルスケア連携\n\n本人が同期を押した場合のみ、直近30日の完了したランニングの開始・終了時刻、提供元、記録IDと同じ提供元の距離を読み取ります。\n\n許可した記録は本人のアカウントに保存し、個人の参考記録としてのみ表示します。対戦、チーム、領域、周回、称号には加算しません。GPS経路、心拍、睡眠、歩数は読み取らず、Health Connectへの書き込みやバックグラウンド取得も行いません。\n\nホームの「外部連携を解除・記録を削除」で保存分を削除できます。AndroidのHealth Connect設定から読み取り権限を撤回できます。撤回のみでは既に保存した記録は消えないため、アプリ内でも削除してください。\n\n一般的なアカウント削除では外部記録も削除します。位置情報の統計利用への同意とは別です。");ScrollView scroll=new ScrollView(this);scroll.addView(text);setContentView(scroll);}
}
