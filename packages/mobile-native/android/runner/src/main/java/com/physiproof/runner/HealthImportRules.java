package com.physiproof.runner;

/** Pure filtering rules; imports are reference data, never a game attestation. */
final class HealthImportRules {
    static final long WINDOW_MS=30L*24*60*60*1000;
    static boolean eligible(boolean running,boolean manual,String source,String id,long start,long end,long windowStart,long windowEnd){
        return running&&!manual&&source!=null&&source.matches("[A-Za-z0-9_.]{1,255}")&&id!=null&&!id.isEmpty()&&id.length()<=128
            &&start>=windowStart&&end<=windowEnd&&end>start&&end-start<=48L*60*60*1000;
    }
    static boolean validDistance(Double meters){return meters!=null&&Double.isFinite(meters)&&meters>0&&meters<=300000;}
}
