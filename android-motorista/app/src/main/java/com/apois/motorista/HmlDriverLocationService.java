package com.apois.motorista;

import android.Manifest;
import android.app.*;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.*;
import android.util.Base64;
import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import com.google.android.gms.location.*;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

// Isolated HML transport. No legacy RPC, persistent GPS buffer, refresh-token
// rotation, redirected request or automatic re-enrollment after process death.
public final class HmlDriverLocationService extends Service {
    public static final String ORIGIN = "https://apois-mobile-hml-apoistecnologia-dev.apps.rm3.7wse.p1.openshiftapps.com";
    static final String UPDATE = "com.apois.motorista.hml.UPDATE_TOKEN";
    private static final String PATH = "/functions/v1/apois-hml-driver-dispatch";
    private static final String CHANNEL = "apois_hml_location";
    private static final int NOTIFICATION = 41022;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final AtomicBoolean inFlight = new AtomicBoolean();
    private volatile boolean active, stopping;
    private volatile String token;
    private String identity;
    private String generation; // worker only
    private static volatile String localGeneration;
    static String localGeneration(){return localGeneration;}
    private long sequence, lastAttempt;
    private boolean uncertain;
    private FusedLocationProviderClient fused;
    private LocationCallback callback;

    static String identity(String jwt) {
        try {
            if(jwt == null || jwt.length()>8192 || !jwt.matches("[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+")) return null;
            JSONObject claims=new JSONObject(new String(Base64.decode(jwt.split("\\.")[1],Base64.URL_SAFE|Base64.NO_PADDING|Base64.NO_WRAP),StandardCharsets.UTF_8));
            String subject=claims.getString("sub"),session=claims.getString("session_id");
            return uuid(subject)&&uuid(session)?subject+":"+session:null;
        } catch(Exception ignored){return null;}
    }
    private static boolean uuid(String value) {return value!=null&&value.matches("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");}
    private static JSONObject command(String action) throws Exception {return new JSONObject().put("action",action);}
    // Decode is only a local session continuity check; server verifies exact JWT.
    @Override public int onStartCommand(Intent intent,int flags,int startId) {
        if(!getPackageName().equals("com.apois.motorista.hml")){stopSelf();return START_NOT_STICKY;}
        if(intent==null){stopSelf();return START_NOT_STICKY;}
        String action=intent.getAction();
        if(DriverLocationService.ACTION_STOP.equals(action)){stopTracking(startId);return START_NOT_STICKY;}
        String supplied=intent.getStringExtra(DriverLocationService.EXTRA_ACCESS_TOKEN);
        String who=identity(supplied);
        if(UPDATE.equals(action)){
            if(active&&!stopping&&who!=null&&who.equals(identity))token=supplied;
            else if(!active&&!stopping)stopSelf();
            return START_NOT_STICKY;
        }
        if(!DriverLocationService.ACTION_START.equals(action)||!ORIGIN.equals(intent.getStringExtra(DriverLocationService.EXTRA_SUPABASE_URL))||who==null){
            if(!active&&!stopping)stopSelf();return START_NOT_STICKY;
        }
        if(active||stopping)return START_NOT_STICKY;
        identity=who;token=supplied;active=true;localGeneration=null;
        NotificationManager manager=getSystemService(NotificationManager.class);
        if(Build.VERSION.SDK_INT>=26&&manager!=null)manager.createNotificationChannel(new NotificationChannel(CHANNEL,"Localização APOIS HML",NotificationManager.IMPORTANCE_LOW));
        Intent open=new Intent(this,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification n=new NotificationCompat.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_stat_apois_notification)
            .setContentTitle("APOIS — localização em teste").setContentText("A localização é compartilhada durante a disponibilidade de homologação.")
            .setContentIntent(pi).setOngoing(true).setOnlyAlertOnce(true).build();
        if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);else startForeground(NOTIFICATION,n);
        worker.execute(()->{
            try{
                JSONObject before=status();
                if(!active||stopping||before==null||(before.getBoolean("online")&&!before.getBoolean("owned")))throw new IOException();
                JSONObject res=post(command("presence_begin").put("expectedGeneration",before.get("generation")));
                String next=res==null?"":res.optString("generation","");
                if(res==null||res.length()!=4||!res.getBoolean("ok")||!uuid(next)||next.equals(before.optString("generation"))||res.getLong("sequence")!=0||res.getBoolean("online"))throw new IOException();
                generation=next;sequence=0;lastAttempt=0;
                main.post(()->{if(active&&!stopping){localGeneration=next;startGps();}});
            }catch(Exception ignored){main.post(()->stopTracking(startId));}
        });
        return START_NOT_STICKY;
    }
    private void startGps(){
        if(ActivityCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){stopTracking(0);return;}
        fused=LocationServices.getFusedLocationProviderClient(this);
        callback=new LocationCallback(){@Override public void onLocationResult(LocationResult result){
            Location p=result.getLastLocation();
            if(!active||stopping||!valid(p)||!inFlight.compareAndSet(false,true))return;
            Location copy=new Location(p);
            worker.execute(()->{try{if(active&&!stopping)fix(copy);}finally{inFlight.set(false);}});
        }};
        try{
            // A stationary car still needs genuinely new fixes; never renew a cached fix.
            LocationRequest request=new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY,5000L).setMinUpdateIntervalMillis(4000L).setMinUpdateDistanceMeters(0f).build();
            fused.requestLocationUpdates(request,callback,Looper.getMainLooper()).addOnFailureListener(e->stopTracking(0));
        }catch(SecurityException ignored){stopTracking(0);}
    }
    private static boolean valid(Location p){
        if(p==null||p.getTime()<=0)return false;
        if(Build.VERSION.SDK_INT>=31?p.isMock():p.isFromMockProvider())return false;
        long age=System.currentTimeMillis()-p.getTime();
        return age>=-5000&&age<=45000&&Double.isFinite(p.getLatitude())&&Double.isFinite(p.getLongitude())&&p.getLatitude()>=-34&&p.getLatitude()<=6&&p.getLongitude()>=-74&&p.getLongitude()<=-32;
    }
    private void fix(Location p){
        if(generation==null||!valid(p)||p.getTime()<=lastAttempt)return;
        try{
            if(uncertain){
                JSONObject st=status();
                if(!owns(st)){main.post(()->stopTracking(0));return;}
                sequence=st.getLong("sequence");uncertain=false;
            }
            if(!active||stopping||!valid(p)||sequence>=9007199254740991L)return;
            Object heading=p.hasBearing()&&Float.isFinite(p.getBearing())&&p.getBearing()>=0&&p.getBearing()<360?p.getBearing():JSONObject.NULL;
            Object speed=p.hasSpeed()&&Float.isFinite(p.getSpeed())&&p.getSpeed()>=0&&p.getSpeed()<=100?p.getSpeed():JSONObject.NULL;
            long next=sequence+1;lastAttempt=p.getTime();uncertain=true;
            JSONObject res=post(command("presence_fix").put("generation",generation).put("sequence",next).put("capturedAt",p.getTime()).put("lat",p.getLatitude()).put("lng",p.getLongitude()).put("heading",heading).put("speed",speed));
            if(confirmed(res,next,true)){sequence=next;uncertain=false;}
        }catch(Exception ignored){uncertain=true;}
    }
    private boolean owns(JSONObject st)throws Exception{
        return st!=null&&generation!=null&&generation.equals(st.optString("generation"))&&st.getBoolean("owned")&&!st.getBoolean("closed");
    }
    private boolean confirmed(JSONObject res,long seq,boolean online)throws Exception{
        return res!=null&&res.length()==4&&res.getBoolean("ok")&&generation.equals(res.optString("generation"))&&res.getLong("sequence")==seq&&res.getBoolean("online")==online;
    }
    private JSONObject status()throws Exception{
        JSONObject st=post(command("presence_status"));
        if(st==null||st.length()!=6||!st.getBoolean("ok")||!st.has("generation")||(!st.isNull("generation")&&!uuid(st.getString("generation")))||st.getLong("sequence")<0)return null;
        st.getBoolean("closed");st.getBoolean("owned");st.getBoolean("online");return st;
    }
    private void stopTracking(int startId){
        if(stopping)return;
        stopping=true;active=false;localGeneration=null;
        if(fused!=null&&callback!=null)fused.removeLocationUpdates(callback);
        worker.execute(()->{
            try{
                if(generation!=null){
                    JSONObject st=status();
                    if(owns(st)&&st.getLong("sequence")<9007199254740991L){
                        long next=st.getLong("sequence")+1;
                        post(command("presence_offline").put("generation",generation).put("sequence",next));
                    }
                }
            }catch(Exception ignored){} // Server lease expires if offline is unconfirmed.
            finally{token=null;generation=null;main.post(()->{if(Build.VERSION.SDK_INT>=24)stopForeground(STOP_FOREGROUND_REMOVE);else stopForeground(true);stopSelf();});}
        });
    }
    private JSONObject post(JSONObject body)throws Exception{
        String bearer=token;if(bearer==null)throw new IOException();
        HttpURLConnection c=(HttpURLConnection)new URL(ORIGIN+PATH).openConnection();
        try{
            c.setInstanceFollowRedirects(false);c.setConnectTimeout(4500);c.setReadTimeout(5500);c.setRequestMethod("POST");c.setDoOutput(true);
            c.setRequestProperty("Authorization","Bearer "+bearer);c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Accept","application/json");c.setRequestProperty("Cache-Control","no-store");
            byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(bytes.length);
            try(OutputStream out=c.getOutputStream()){out.write(bytes);}
            int code=c.getResponseCode();String type=c.getContentType();
            if(code!=200||type==null||!type.toLowerCase(java.util.Locale.ROOT).startsWith("application/json"))return null;
            try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
                byte[] buf=new byte[1024];int n;while((n=in.read(buf))!=-1){if(out.size()+n>4096)throw new IOException();out.write(buf,0,n);}
                return new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));
            }
        }finally{c.disconnect();}
    }
    @Override public void onDestroy(){active=false;stopping=true;token=null;localGeneration=null;if(fused!=null&&callback!=null)fused.removeLocationUpdates(callback);worker.shutdownNow();super.onDestroy();}
    @Nullable @Override public IBinder onBind(Intent intent){return null;}
}
