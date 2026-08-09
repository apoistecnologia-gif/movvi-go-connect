package com.apois.motorista;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class DriverLocationService extends Service {
    public static final String ACTION_START = "com.apois.motorista.action.START_LOCATION";
    public static final String ACTION_STOP = "com.apois.motorista.action.STOP_LOCATION";
    public static final String EXTRA_SUPABASE_URL = "supabaseUrl";
    public static final String EXTRA_PUBLISHABLE_KEY = "publishableKey";
    public static final String EXTRA_ACCESS_TOKEN = "accessToken";
    public static final String EXTRA_REFRESH_TOKEN = "refreshToken";

    private static final String CHANNEL_ID = "apois_driver_location";
    private static final int NOTIFICATION_ID = 41021;
    private static final long HEARTBEAT_MS = 15_000L;
    private static final long MAX_PENDING_LOCATION_AGE_MS = 120_000L;
    private static final String LOCATION_PREFS = "apois_driver_location_buffer";
    private static final String PREF_LAT = "lat";
    private static final String PREF_LNG = "lng";
    private static final String PREF_CAPTURED_AT = "captured_at";
    private static final String PREF_ACCURACY = "accuracy";
    private static final String PREF_HAS_BEARING = "has_bearing";
    private static final String PREF_BEARING = "bearing";
    private static final String PREF_HAS_SPEED = "has_speed";
    private static final String PREF_SPEED = "speed";

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean syncQueued = new AtomicBoolean(false);

    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private Location latestLocation;
    private boolean tracking = false;

    private String supabaseUrl;
    private String publishableKey;
    private String accessToken;
    private String refreshToken;

    private final Runnable heartbeat = new Runnable() {
        @Override
        public void run() {
            if (tracking && latestLocation != null) {
                queuePresenceSync(true, latestLocation);
                mainHandler.postDelayed(this, HEARTBEAT_MS);
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                Location location = result.getLastLocation();
                if (location == null) return;
                latestLocation = location;
                rememberPendingLocation(location);
                queuePresenceSync(true, location);
            }
        };
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopFromDriverAction();
            return START_NOT_STICKY;
        }

        if (intent == null || !ACTION_START.equals(intent.getAction())) {
            return START_NOT_STICKY;
        }

        supabaseUrl = normalizeUrl(intent.getStringExtra(EXTRA_SUPABASE_URL));
        publishableKey = safe(intent.getStringExtra(EXTRA_PUBLISHABLE_KEY));
        accessToken = safe(intent.getStringExtra(EXTRA_ACCESS_TOKEN));
        refreshToken = safe(intent.getStringExtra(EXTRA_REFRESH_TOKEN));

        if (supabaseUrl.isEmpty() || publishableKey.isEmpty() || accessToken.isEmpty()) {
            stopSelf();
            return START_NOT_STICKY;
        }

        startAsForeground();
        Location pending = readPendingLocation();
        if (pending != null) {
            latestLocation = pending;
            queuePresenceSync(true, pending);
        }
        startLocationUpdates();
        return START_NOT_STICKY;
    }

    private void startAsForeground() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private Notification buildNotification() {
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_apois_notification)
            .setContentTitle("APOIS Motorista online")
            .setContentText("Sua localização está sendo compartilhada enquanto você está online.")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Localização do motorista",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Mantém a localização ativa enquanto o motorista está online.");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private void startLocationUpdates() {
        if (tracking) return;
        boolean fine = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) {
            stopSelf();
            return;
        }

        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5_000L)
            .setMinUpdateIntervalMillis(3_000L)
            .setMinUpdateDistanceMeters(5f)
            .build();

        try {
            tracking = true;
            fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper());
            mainHandler.removeCallbacks(heartbeat);
            mainHandler.postDelayed(heartbeat, HEARTBEAT_MS);
        } catch (SecurityException securityException) {
            tracking = false;
            stopSelf();
        }
    }

    private void rememberPendingLocation(Location location) {
        if (location == null) return;
        long capturedAt = location.getTime() > 0 ? location.getTime() : System.currentTimeMillis();
        SharedPreferences.Editor editor = getSharedPreferences(LOCATION_PREFS, MODE_PRIVATE)
            .edit()
            .putString(PREF_LAT, Double.toString(location.getLatitude()))
            .putString(PREF_LNG, Double.toString(location.getLongitude()))
            .putLong(PREF_CAPTURED_AT, capturedAt)
            .putFloat(PREF_ACCURACY, location.hasAccuracy() ? location.getAccuracy() : -1f)
            .putBoolean(PREF_HAS_BEARING, location.hasBearing())
            .putFloat(PREF_BEARING, location.hasBearing() ? location.getBearing() : 0f)
            .putBoolean(PREF_HAS_SPEED, location.hasSpeed())
            .putFloat(PREF_SPEED, location.hasSpeed() ? location.getSpeed() : 0f);
        editor.apply();
    }

    @Nullable
    private Location readPendingLocation() {
        SharedPreferences prefs = getSharedPreferences(LOCATION_PREFS, MODE_PRIVATE);
        String latRaw = prefs.getString(PREF_LAT, null);
        String lngRaw = prefs.getString(PREF_LNG, null);
        long capturedAt = prefs.getLong(PREF_CAPTURED_AT, 0L);
        if (latRaw == null || lngRaw == null || capturedAt <= 0L) return null;

        long age = Math.max(0L, System.currentTimeMillis() - capturedAt);
        if (age > MAX_PENDING_LOCATION_AGE_MS) {
            clearPendingLocation();
            return null;
        }

        try {
            double lat = Double.parseDouble(latRaw);
            double lng = Double.parseDouble(lngRaw);
            if (lat < -90d || lat > 90d || lng < -180d || lng > 180d) {
                clearPendingLocation();
                return null;
            }
            Location pending = new Location("apois-buffer");
            pending.setLatitude(lat);
            pending.setLongitude(lng);
            pending.setTime(capturedAt);
            float accuracy = prefs.getFloat(PREF_ACCURACY, -1f);
            if (accuracy >= 0f) pending.setAccuracy(accuracy);
            if (prefs.getBoolean(PREF_HAS_BEARING, false)) {
                pending.setBearing(prefs.getFloat(PREF_BEARING, 0f));
            }
            if (prefs.getBoolean(PREF_HAS_SPEED, false)) {
                pending.setSpeed(prefs.getFloat(PREF_SPEED, 0f));
            }
            return pending;
        } catch (NumberFormatException invalidBuffer) {
            clearPendingLocation();
            return null;
        }
    }

    private void clearPendingLocationIfSynced(long syncedCapturedAt) {
        SharedPreferences prefs = getSharedPreferences(LOCATION_PREFS, MODE_PRIVATE);
        long pendingCapturedAt = prefs.getLong(PREF_CAPTURED_AT, 0L);
        if (pendingCapturedAt > 0L && pendingCapturedAt <= syncedCapturedAt) {
            clearPendingLocation();
        }
    }

    private void clearPendingLocation() {
        getSharedPreferences(LOCATION_PREFS, MODE_PRIVATE).edit().clear().apply();
    }

    private void stopFromDriverAction() {
        tracking = false;
        mainHandler.removeCallbacks(heartbeat);
        try {
            fusedLocationClient.removeLocationUpdates(locationCallback);
        } catch (Exception ignored) {
            // no-op
        }

        networkExecutor.execute(() -> {
            try {
                syncPresence(false, null, true);
            } finally {
                mainHandler.post(() -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                        stopForeground(STOP_FOREGROUND_REMOVE);
                    } else {
                        stopForeground(true);
                    }
                    stopSelf();
                });
            }
        });
    }

    private void queuePresenceSync(boolean online, @Nullable Location location) {
        if (!syncQueued.compareAndSet(false, true)) return;
        networkExecutor.execute(() -> {
            try {
                syncPresence(online, location, true);
            } finally {
                syncQueued.set(false);
            }
        });
    }

    private boolean syncPresence(boolean online, @Nullable Location location, boolean allowRefresh) {
        if (supabaseUrl == null || supabaseUrl.isEmpty() || accessToken == null || accessToken.isEmpty()) {
            return false;
        }

        HttpURLConnection connection = null;
        try {
            URL url = new URL(supabaseUrl + "/rest/v1/rpc/driver_set_presence");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(10_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("apikey", publishableKey);
            connection.setRequestProperty("Authorization", "Bearer " + accessToken);
            connection.setRequestProperty("Prefer", "return=minimal");

            JSONObject body = new JSONObject();
            body.put("_online", online);
            if (online && location != null) {
                body.put("_lat", location.getLatitude());
                body.put("_lng", location.getLongitude());
                body.put("_heading", location.hasBearing() ? location.getBearing() : JSONObject.NULL);
                body.put("_speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
            } else {
                body.put("_lat", JSONObject.NULL);
                body.put("_lng", JSONObject.NULL);
                body.put("_heading", JSONObject.NULL);
                body.put("_speed", JSONObject.NULL);
            }

            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }

            int status = connection.getResponseCode();
            consumeResponse(connection, status);
            if (status >= 200 && status < 300) {
                if (online && location != null) {
                    long capturedAt = location.getTime() > 0 ? location.getTime() : System.currentTimeMillis();
                    clearPendingLocationIfSynced(capturedAt);
                }
                return true;
            }
            if ((status == 401 || status == 403) && allowRefresh && refreshSession()) {
                return syncPresence(online, location, false);
            }
            return false;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private boolean refreshSession() {
        if (refreshToken == null || refreshToken.isEmpty()) return false;
        HttpURLConnection connection = null;
        try {
            URL url = new URL(supabaseUrl + "/auth/v1/token?grant_type=refresh_token");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(10_000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("apikey", publishableKey);

            JSONObject body = new JSONObject();
            body.put("refresh_token", refreshToken);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) {
                consumeResponse(connection, status);
                return false;
            }
            String response = readStream(connection.getInputStream());
            JSONObject json = new JSONObject(response);
            String nextAccess = json.optString("access_token", "");
            String nextRefresh = json.optString("refresh_token", "");
            if (nextAccess.isEmpty()) return false;
            accessToken = nextAccess;
            if (!nextRefresh.isEmpty()) refreshToken = nextRefresh;
            return true;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static void consumeResponse(HttpURLConnection connection, int status) {
        try {
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream != null) readStream(stream);
        } catch (Exception ignored) {
            // no-op
        }
    }

    private static String readStream(InputStream stream) throws Exception {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }

    private static String normalizeUrl(String value) {
        String result = safe(value).trim();
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        return result;
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    @Override
    public void onDestroy() {
        tracking = false;
        mainHandler.removeCallbacks(heartbeat);
        try {
            if (fusedLocationClient != null && locationCallback != null) {
                fusedLocationClient.removeLocationUpdates(locationCallback);
            }
        } catch (Exception ignored) {
            // no-op
        }
        networkExecutor.shutdownNow();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
