package com.physiproof.runner;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Collections;

public class MainActivity extends Activity {
    private static final String ORIGIN = "https://physiproof-frontend.pages.dev";
    private WebView web;
    private JavaScriptReplyProxy pendingReply;
    private JSONObject pendingStart;
    private String pendingId;
    private ValueCallback<Uri[]> chooser;
    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;
    private HealthImport healthImport;
    private JavaScriptReplyProxy healthPermissionReply;
    private String healthPermissionId;
    private boolean trusted(Uri uri) { return "https".equals(uri.getScheme()) && "physiproof-frontend.pages.dev".equals(uri.getHost()) && (uri.getPort()==-1 || uri.getPort()==443); }
    private boolean granted(String permission) { return Build.VERSION.SDK_INT < 23 || checkSelfPermission(permission)==PackageManager.PERMISSION_GRANTED; }
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setFitsSystemWindows(true);
        setContentView(web);
        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); s.setSafeBrowsingEnabled(true);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return request.isForMainFrame() && !trusted(request.getUrl()); }
            @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,SslError error){ handler.cancel(); }
        });
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if(!trusted(Uri.parse(origin))){callback.invoke(origin,false,false);return;}
                if(granted(Manifest.permission.ACCESS_FINE_LOCATION)){callback.invoke(origin,true,false);return;}
                if(geoCallback!=null||pendingReply!=null||healthPermissionReply!=null){callback.invoke(origin,false,false);return;}
                geoCallback=callback;geoOrigin=origin;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},101);
            }
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){
                if(chooser!=null)chooser.onReceiveValue(null);
                chooser=callback;
                try{startActivityForResult(params.createIntent(),103);return true;}catch(Exception error){chooser=null;return false;}
            }
        });
        if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
            if(Build.VERSION.SDK_INT>=34)healthImport=new HealthImport(this);
            WebViewCompat.addWebMessageListener(web,"PhysiProofHealth",Collections.singleton(ORIGIN),(view,message,sourceOrigin,isMainFrame,reply)->{
                if(!isMainFrame||!trusted(sourceOrigin)||!trusted(Uri.parse(view.getUrl()==null?"":view.getUrl())))return;
                try{
                    JSONObject command=new JSONObject(message.getData());String id=command.getString("id"),action=command.getString("command");
                    if(action.equals("status")){respond(reply,id,healthImport==null?new JSONObject().put("supported",false).put("authorized",false):healthImport.state());return;}
                    if(healthImport==null||!healthImport.supported()){respondError(reply,id,"外部連携の取り込みにはAndroid 14以降の対応端末が必要です。");return;}
                    if(action.equals("authorize")){
                        if(healthPermissionReply!=null||pendingReply!=null||geoCallback!=null){respondError(reply,id,"別の権限確認中です。閉じてから再試行してください。");return;}
                        if(healthImport.authorized()){respond(reply,id,healthImport.state());return;}
                        healthPermissionReply=reply;healthPermissionId=id;requestPermissions(HealthImport.PERMISSIONS,104);
                    }else if(action.equals("read")){
                        healthImport.read(value->{if(!isDestroyed()&&trusted(Uri.parse(web.getUrl()==null?"":web.getUrl())))respond(reply,id,value);},error->{if(!isDestroyed())respondError(reply,id,error);});
                    }else if(action.equals("settings")){
                        try{startActivity(new Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS").putExtra(Intent.EXTRA_PACKAGE_NAME,getPackageName()));respond(reply,id,healthImport.state());}
                        catch(Exception error){respondError(reply,id,"端末の設定アプリからHealth Connectのアプリ権限を開いてください。");}
                    }else respondError(reply,id,"未対応の外部連携操作です。");
                }catch(Exception ignored){/* Never log health data or requests. */}
            });
            WebViewCompat.addWebMessageListener(web,"PhysiProofMotion",Collections.singleton(ORIGIN),(view,message,sourceOrigin,isMainFrame,reply)->{
                if(!isMainFrame||!trusted(sourceOrigin)||!trusted(Uri.parse(view.getUrl()==null?"":view.getUrl())))return;
                try {
                    JSONObject command=new JSONObject(message.getData());
                    String id=command.getString("id"),action=command.getString("command");
                    if(action.equals("capabilities")||action.equals("snapshot"))respond(reply,id,RunService.snapshot(hasCounter()));
                    else if(action.equals("start")){
                        if(pendingReply!=null||geoCallback!=null||healthPermissionReply!=null){respondError(reply,id,"権限の確認中です。許可の画面を閉じてから再試行してください。");return;}
                        if(!hasCounter()){respondError(reply,id,"この端末には歩数センサーがありません。");return;}
                        String session=command.getString("session_id"),token=command.getString("access_token");
                        if(!session.matches("[a-fA-F0-9-]{36}")||!token.matches("[a-f0-9]{64}")){respondError(reply,id,"走行の本人確認が必要です。");return;}
                        pendingReply=reply;pendingId=id;pendingStart=command;
                        ArrayList<String> permissions=new ArrayList<>();
                        if(!granted(Manifest.permission.ACCESS_FINE_LOCATION)){
                            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
                        }
                        if(Build.VERSION.SDK_INT>=29&&!granted(Manifest.permission.ACTIVITY_RECOGNITION))permissions.add(Manifest.permission.ACTIVITY_RECOGNITION);
                        if(Build.VERSION.SDK_INT>=33&&!granted(Manifest.permission.POST_NOTIFICATIONS))permissions.add(Manifest.permission.POST_NOTIFICATIONS);
                        if(permissions.isEmpty())beginRun();else requestPermissions(permissions.toArray(new String[0]),102);
                    } else if(action.equals("finish")) RunService.finish(value->runOnUiThread(()->respond(reply,id,value)));
                    else if(action.equals("cancel")){RunService.cancel();respond(reply,id,RunService.snapshot(hasCounter()));}
                    else respondError(reply,id,"未対応の計測操作です。");
                } catch(Exception error){ /* Never include credential-bearing requests in logs. */ }
            });
        }
        web.loadUrl(ORIGIN+"/dashboard");
    }
    private boolean hasCounter(){return ((SensorManager)getSystemService(SENSOR_SERVICE)).getDefaultSensor(Sensor.TYPE_STEP_COUNTER)!=null;}
    private void beginRun(){
        if(pendingReply==null)return;
        if(!granted(Manifest.permission.ACCESS_FINE_LOCATION)||(Build.VERSION.SDK_INT>=29&&!granted(Manifest.permission.ACTIVITY_RECOGNITION))){
            respondError(pendingReply,pendingId,"位置情報と身体活動の許可が必要です。設定を確認して再試行してください。");clearPending();return;
        }
        Intent intent=new Intent(this,RunService.class).putExtra("session",pendingStart.optString("session_id")).putExtra("token",pendingStart.optString("access_token"));
        if(!RunService.prepareStart()){respondError(pendingReply,pendingId,"別の走行を計測中、または終了処理中です。");clearPending();return;}
        try {startForegroundService(intent);respond(pendingReply,pendingId,RunService.snapshot(hasCounter()));}
        catch(Exception error){respondError(pendingReply,pendingId,"計測サービスを開始できませんでした。アプリを開いて再試行してください。");}
        clearPending();
    }
    private void clearPending(){pendingReply=null;pendingStart=null;pendingId=null;}
    private void respond(JavaScriptReplyProxy reply,String id,JSONObject data){try{reply.postMessage(new JSONObject().put("id",id).put("data",data).toString());}catch(Exception ignored){}}
    private void respondError(JavaScriptReplyProxy reply,String id,String error){try{reply.postMessage(new JSONObject().put("id",id).put("error",error).toString());}catch(Exception ignored){}}
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] result){
        super.onRequestPermissionsResult(code,permissions,result);
        if(code==101&&geoCallback!=null){geoCallback.invoke(geoOrigin,granted(Manifest.permission.ACCESS_FINE_LOCATION),false);geoCallback=null;}
        if(code==102)beginRun();
        if(code==104&&healthPermissionReply!=null){if(healthImport!=null)respond(healthPermissionReply,healthPermissionId,healthImport.state());healthPermissionReply=null;healthPermissionId=null;}
    }
    @Override protected void onActivityResult(int code,int result,Intent data){super.onActivityResult(code,result,data);if(code==103&&chooser!=null){chooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));chooser=null;}}
    @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override public void onDestroy(){if(chooser!=null)chooser.onReceiveValue(null);if(healthImport!=null)healthImport.close();web.destroy();super.onDestroy();}
}
