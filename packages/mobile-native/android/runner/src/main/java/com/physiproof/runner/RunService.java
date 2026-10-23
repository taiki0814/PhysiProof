package com.physiproof.runner;

import android.Manifest;
import android.app.*;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.*;
import android.location.*;
import android.os.*;
import org.json.*;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.concurrent.*;
import java.util.function.Consumer;

/** Online-only foreground run. Credentials/GPS stay in memory; no upload queue. */
public final class RunService extends Service implements SensorEventListener,LocationListener {
    private static final String API="https://my-app-backend.24jz0121.workers.dev/api/running/sessions/";
    private static RunService instance;
    private static String lastError=null;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ExecutorService network=Executors.newSingleThreadExecutor();
    private final StepAccumulator counter=new StepAccumulator();
    private final ArrayList<double[]> route=new ArrayList<>();
    private String session,token;
    private long sequence=0;
    private boolean finishing=false,posting=false;
    private boolean shuttingDown=false;
    private long lastSuccessAt=0;
    private Location fix,routeFix;
    private JSONObject summary;
    private SensorManager sensors;
    private LocationManager locations;
    private PowerManager.WakeLock cpuLock;
    private double distance=0;
    private final Runnable tick=new Runnable(){public void run(){if(!finishing){holdCpu();send(false,null);handler.postDelayed(this,20000);}}};

    public static synchronized JSONObject snapshot(boolean available){
        JSONObject out=new JSONObject();
        try{
            RunService current=instance;
            JSONArray points=new JSONArray();
            if(current!=null)for(double[] point:current.route)points.put(new JSONArray().put(point[0]).put(point[1]));
            out.put("available",available).put("active",current!=null&&!current.finishing).put("session_id",current==null?JSONObject.NULL:current.session)
                .put("summary",current==null||current.summary==null?JSONObject.NULL:current.summary).put("error",lastError==null?JSONObject.NULL:lastError)
                .put("route",points).put("distance_m",current==null?0:current.distance);
        }catch(JSONException ignored){}
        return out;
    }
    public static synchronized void finish(Consumer<JSONObject> done){
        RunService current=instance;
        if(current==null){done.accept(snapshot(true));return;}
        if(current.finishing){done.accept(snapshot(true));return;}
        current.finishing=true;current.removeSensors();current.handler.removeCallbacks(current.tick);
        current.finishWhenReady(done);
    }
    private void finishWhenReady(Consumer<JSONObject> done){
        if(instance!=this||lastError!=null){done.accept(snapshot(true));return;}
        long delay=1600-(System.currentTimeMillis()-lastSuccessAt);
        if(posting||delay>0){handler.postDelayed(()->finishWhenReady(done),Math.max(200,delay));return;}
        send(true,value->{done.accept(value);shutdown();});
    }
    public static synchronized void cancel(){if(instance!=null)instance.fail("計測を終了しました。");}
    public static synchronized boolean prepareStart(){if(instance!=null)return false;lastError=null;return true;}
    @Override public void onCreate(){
        super.onCreate();sensors=(SensorManager)getSystemService(SENSOR_SERVICE);locations=(LocationManager)getSystemService(LOCATION_SERVICE);
        cpuLock=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"PhysiProof:RunService");
        cpuLock.setReferenceCounted(false);
        NotificationManager manager=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        manager.createNotificationChannel(new NotificationChannel("run","ランニング計測",NotificationManager.IMPORTANCE_LOW));
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent==null){stopSelf();return START_NOT_STICKY;}
        if("stop".equals(intent.getAction())){cancel();return START_NOT_STICKY;}
        if(instance!=null)return START_NOT_STICKY;
        session=intent.getStringExtra("session");token=intent.getStringExtra("token");lastError=null;
        PendingIntent stop=PendingIntent.getService(this,1,new Intent(this,RunService.class).setAction("stop"),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent open=PendingIntent.getActivity(this,2,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        startForeground(71,new Notification.Builder(this,"run").setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("PhysiProof：計測中")
          .setContentText("実測歩数と位置情報を確認中。通信が途切れると記録を停止します。").setContentIntent(open).setOngoing(true)
          .addAction(new Notification.Action.Builder(null,"中止",stop).build()).build());
        instance=this;
        Sensor sensor=sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        if(sensor==null){fail("歩数センサーが利用できません。");return START_NOT_STICKY;}
        try{
            if(!sensors.registerListener(this,sensor,SensorManager.SENSOR_DELAY_NORMAL)){fail("歩数センサーを開始できません。");return START_NOT_STICKY;}
            if(locations.isProviderEnabled(LocationManager.GPS_PROVIDER))locations.requestLocationUpdates(LocationManager.GPS_PROVIDER,3000,0,this,Looper.getMainLooper());
            if(locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER))locations.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,5000,0,this,Looper.getMainLooper());
            holdCpu();
            handler.postDelayed(tick,2000);
        }catch(SecurityException error){fail("位置情報・身体活動の許可が必要です。");}
        return START_NOT_STICKY;
    }
    @Override public void onSensorChanged(SensorEvent event){try{counter.accept((long)event.values[0]);}catch(IllegalStateException error){fail(error.getMessage());}}
    @Override public void onAccuracyChanged(Sensor sensor,int accuracy){}
    @Override public void onLocationChanged(Location location){
        if(finishing)return;
        fix=new Location(location);
        boolean mocked=Build.VERSION.SDK_INT>=31?location.isMock():location.isFromMockProvider();
        long age=SystemClock.elapsedRealtimeNanos()-location.getElapsedRealtimeNanos();
        if(mocked||!location.hasAccuracy()||location.getAccuracy()>30||age<0||age>15000000000L)return;
        if(routeFix!=null){
            float metres=routeFix.distanceTo(location);
            double seconds=(location.getElapsedRealtimeNanos()-routeFix.getElapsedRealtimeNanos())/1e9;
            if(seconds<=0||metres<2||metres/seconds>7)return;
            distance+=metres;
        }
        if(route.size()>=20000){fail("計測できる時間を超えました。一度終了して新しい走行を開始してください。");return;}
        route.add(new double[]{location.getLatitude(),location.getLongitude()});routeFix=new Location(location);
    }
    private void send(boolean finalPacket,Consumer<JSONObject> done){
        if(posting&&!finalPacket)return;
        JSONObject packet=new JSONObject();
        try{
            packet.put("sequence",sequence++).put("recorded_at_ms",System.currentTimeMillis()).put("source","android_step_counter").put("steps",counter.total());
            if(fix==null)packet.put("fix",JSONObject.NULL);
            else packet.put("fix",new JSONObject().put("latitude",fix.getLatitude()).put("longitude",fix.getLongitude()).put("accuracy_m",fix.getAccuracy())
                .put("captured_at_ms",System.currentTimeMillis()-(SystemClock.elapsedRealtimeNanos()-fix.getElapsedRealtimeNanos())/1000000)
                .put("mocked",Build.VERSION.SDK_INT>=31?fix.isMock():fix.isFromMockProvider()));
        }catch(JSONException error){fail("計測値を作成できませんでした。");return;}
        posting=true;
        network.execute(()->{
            try{
                // A final packet immediately after the periodic one is unnecessary.
                JSONObject value=request("POST","telemetry",packet.toString());
                if(!finalPacket)request("POST","heartbeat","{}");
                handler.post(()->{posting=false;summary=value;lastSuccessAt=System.currentTimeMillis();if(finalPacket&&done!=null)done.accept(snapshot(true));});
            }catch(Exception error){handler.post(()->{
                posting=false;lastError="オンライン計測に失敗しました。この走行は後送されません。";
                if(done!=null)done.accept(snapshot(true));fail(lastError);
            });}
        });
    }
    private JSONObject request(String method,String suffix,String body)throws Exception{
        HttpURLConnection connection=(HttpURLConnection)new URL(API+session+(suffix.isEmpty()?"":"/"+suffix)).openConnection();
        connection.setInstanceFollowRedirects(false);connection.setRequestMethod(method);connection.setConnectTimeout(10000);connection.setReadTimeout(10000);
        connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("Content-Type","application/json");
        try{
            if(!method.equals("DELETE")){connection.setDoOutput(true);try(OutputStream stream=connection.getOutputStream()){stream.write(body.getBytes(StandardCharsets.UTF_8));}}
            if(connection.getResponseCode()<200||connection.getResponseCode()>=300)throw new IOException("Run request rejected");
            try(InputStream input=connection.getInputStream();ByteArrayOutputStream output=new ByteArrayOutputStream()){
                byte[] buffer=new byte[4096];int size;while((size=input.read(buffer))!=-1){output.write(buffer,0,size);if(output.size()>65536)throw new IOException("Oversized response");}
                return new JSONObject(output.toString(StandardCharsets.UTF_8.name()));
            }
        }finally{connection.disconnect();}
    }
    private void removeSensors(){sensors.unregisterListener(this);try{locations.removeUpdates(this);}catch(SecurityException ignored){}}
    // Bounded, foreground-run-only lease; never exempt the app from battery controls.
    private void holdCpu(){cpuLock.acquire(60000);}
    private void releaseCpu(){if(cpuLock!=null&&cpuLock.isHeld())cpuLock.release();}
    private void fail(String message){
        if(instance!=this||shuttingDown)return;
        shuttingDown=true;
        lastError=message;finishing=true;removeSensors();releaseCpu();handler.removeCallbacks(tick);
        network.execute(()->{try{request("DELETE","","");}catch(Exception ignored){}handler.post(this::shutdown);});
    }
    private void shutdown(){
        removeSensors();releaseCpu();handler.removeCallbacks(tick);route.clear();fix=null;routeFix=null;
        synchronized(RunService.class){if(instance==this)instance=null;}
        token=null;session=null;network.shutdown();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();
    }
    @Override public void onDestroy(){removeSensors();releaseCpu();handler.removeCallbacks(tick);if(instance==this){lastError="計測サービスが終了しました。走行を再開してください。";instance=null;}token=null;route.clear();network.shutdownNow();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
    @Override public void onProviderEnabled(String provider){}
    @Override public void onProviderDisabled(String provider){}
    @Override public void onStatusChanged(String provider,int status,Bundle extras){}
}
