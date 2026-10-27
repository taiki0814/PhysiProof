package com.physiproof.runner;

import android.annotation.TargetApi;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.health.connect.*;
import android.health.connect.datatypes.*;
import android.health.connect.datatypes.units.Length;
import android.os.OutcomeReceiver;
import java.time.Instant;
import java.util.ArrayList;
import java.util.function.Consumer;
import org.json.*;

/** Android 14+ only. Foreground, read-only, bounded import. No routes or background reads. */
@TargetApi(34)
final class HealthImport {
    static final String[] PERMISSIONS={"android.permission.health.READ_EXERCISE","android.permission.health.READ_DISTANCE"};
    private final Activity activity;
    private final HealthConnectManager manager;
    private boolean busy=false,closed=false;
    HealthImport(Activity activity){this.activity=activity;manager=activity.getSystemService(HealthConnectManager.class);}
    boolean supported(){return manager!=null;}
    boolean authorized(){for(String permission:PERMISSIONS)if(activity.checkSelfPermission(permission)!=PackageManager.PERMISSION_GRANTED)return false;return supported();}
    JSONObject state(){JSONObject o=new JSONObject();try{o.put("supported",supported()).put("authorized",authorized());}catch(JSONException ignored){}return o;}
    void close(){closed=true;}
    void read(Consumer<JSONObject> done,Consumer<String> fail){
        if(!authorized()){fail.accept("Health Connectの運動記録と距離の読み取りを許可してください。");return;}
        if(busy){fail.accept("外部記録を読み取り中です。しばらく待ってください。");return;}
        busy=true;
        Instant end=Instant.ofEpochMilli(System.currentTimeMillis()),start=end.minusMillis(HealthImportRules.WINDOW_MS);
        ArrayList<ExerciseSessionRecord> sessions=new ArrayList<>();
        readSessions(start,end,-1,0,sessions,value->{busy=false;if(!closed)done.accept(value);},message->{busy=false;if(!closed)fail.accept(message);});
    }
    private void readSessions(Instant start,Instant end,long page,int pages,ArrayList<ExerciseSessionRecord> sessions,Consumer<JSONObject> done,Consumer<String> fail){
        if(closed)return;
        if(pages>=20){fail.accept("外部の運動記録が多すぎるため同期を中止しました。部分的な記録は保存していません。");return;}
        ReadRecordsRequestUsingFilters.Builder<ExerciseSessionRecord> builder=new ReadRecordsRequestUsingFilters.Builder<>(ExerciseSessionRecord.class)
            .setTimeRangeFilter(new TimeInstantRangeFilter.Builder().setStartTime(start).setEndTime(end).build()).setPageSize(500);
        if(page!=-1)builder.setPageToken(page);
        try{manager.readRecords(builder.build(),activity.getMainExecutor(),new OutcomeReceiver<ReadRecordsResponse<ExerciseSessionRecord>,HealthConnectException>(){
            @Override public void onResult(ReadRecordsResponse<ExerciseSessionRecord> response){
                if(closed)return;
                for(ExerciseSessionRecord s:response.getRecords()){
                    Metadata m=s.getMetadata();int type=s.getExerciseType();
                    if(HealthImportRules.eligible(type==ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING||type==ExerciseSessionType.EXERCISE_SESSION_TYPE_RUNNING_TREADMILL,
                        m.getRecordingMethod()==Metadata.RECORDING_METHOD_MANUAL_ENTRY,m.getDataOrigin().getPackageName(),m.getId(),s.getStartTime().toEpochMilli(),s.getEndTime().toEpochMilli(),start.toEpochMilli(),end.toEpochMilli()))sessions.add(s);
                }
                if(sessions.size()>500){fail.accept("直近30日の記録が500件を超えています。同期を中止しました。");return;}
                long next=response.getNextPageToken();
                if(next!=-1){readSessions(start,end,next,pages+1,sessions,done,fail);return;}
                readDistance(start,end,sessions,0,new JSONArray(),done,fail);
            }
            @Override public void onError(HealthConnectException error){fail.accept("Health Connectを読み取れませんでした。権限と提供元アプリの同期を確認して再試行してください。");}
        });}catch(Exception error){fail.accept("Health Connectの読み取りを開始できません。端末の対応状況と権限を確認してください。");}
    }
    private void readDistance(Instant start,Instant end,ArrayList<ExerciseSessionRecord> sessions,int index,JSONArray records,Consumer<JSONObject> done,Consumer<String> fail){
        if(closed)return;
        if(index>=sessions.size()){
            try{done.accept(new JSONObject().put("window_start_ms",start.toEpochMilli()).put("window_end_ms",end.toEpochMilli()).put("records",records));}
            catch(JSONException error){fail.accept("外部記録を変換できませんでした。");}return;
        }
        ExerciseSessionRecord session=sessions.get(index);
        AggregateRecordsRequest<Length> request=new AggregateRecordsRequest.Builder<Length>(new TimeInstantRangeFilter.Builder().setStartTime(session.getStartTime()).setEndTime(session.getEndTime()).build())
            .addAggregationType(DistanceRecord.DISTANCE_TOTAL).addDataOriginsFilter(session.getMetadata().getDataOrigin()).build();
        try{manager.aggregate(request,activity.getMainExecutor(),new OutcomeReceiver<AggregateRecordsResponse<Length>,HealthConnectException>(){
            @Override public void onResult(AggregateRecordsResponse<Length> response){
                if(closed)return;
                Length distance=response.get(DistanceRecord.DISTANCE_TOTAL);
                Double meters=distance==null?null:distance.getInMeters();
                try{
                    if(HealthImportRules.validDistance(meters))records.put(new JSONObject().put("record_id",session.getMetadata().getId()).put("source_id",session.getMetadata().getDataOrigin().getPackageName())
                        .put("started_at_ms",session.getStartTime().toEpochMilli()).put("ended_at_ms",session.getEndTime().toEpochMilli()).put("distance_m",meters));
                }catch(JSONException error){fail.accept("外部記録を変換できませんでした。");return;}
                readDistance(start,end,sessions,index+1,records,done,fail);
            }
            @Override public void onError(HealthConnectException error){fail.accept("距離の取得を完了できませんでした。部分的な記録は保存していません。権限を確認し、時間を置いて再同期してください。");}
        });}catch(Exception error){fail.accept("外部距離を取得できません。権限を確認して再試行してください。");}
    }
}
