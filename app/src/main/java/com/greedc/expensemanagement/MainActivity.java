package com.greedc.expensemanagement;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Iterator;

import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import org.json.JSONObject;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    /** Bump only when this Java code / the manifest changes; the web app updates itself. */
    private static final int NATIVE_VERSION = 3;
    private static final String UPDATE_BASE = "https://greed-c.github.io/expense-management/";
    private static final int PICK_FILE = 41;
    private WebView web;
    private ValueCallback<Uri[]> fileCb;
    private volatile String needApk = "";
    private volatile boolean updated = false;
    private File webDir() { return new File(getFilesDir(), "web"); }

    private long readVer(InputStream in) { try (InputStream i = in) { return Long.parseLong(new String(readAll(i), "UTF-8").trim()); } catch (Exception e) { return 0; } }
    private long bundledVer() { try { return readVer(getAssets().open("webver.txt")); } catch (Exception e) { return 0; } }
    private long downloadedVer() { try { return readVer(new FileInputStream(new File(webDir(), "webver.txt"))); } catch (Exception e) { return 0; } }
    private boolean useDownloaded() { return downloadedVer() > bundledVer(); }

    private static byte[] readAll(InputStream in) throws Exception { ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] b = new byte[16384]; int n; while ((n = in.read(b)) > 0) o.write(b, 0, n); return o.toByteArray(); }
    private static String mime(String p) {
        if (p.endsWith(".html")) return "text/html"; if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".json")) return "application/json"; if (p.endsWith(".css")) return "text/css"; if (p.endsWith(".png")) return "image/png";
        return p.endsWith(".txt") ? "text/plain" : "application/octet-stream";
    }

    /** Serves the newest downloaded web app if there is one, otherwise the copy inside the APK. Same address either way, so saved data stays. */
    private class AppFiles implements WebViewAssetLoader.PathHandler {
        final WebViewAssetLoader.AssetsPathHandler bundled = new WebViewAssetLoader.AssetsPathHandler(MainActivity.this);
        @Override public WebResourceResponse handle(String path) {
            try {
                if (useDownloaded()) {
                    File d = webDir(), f = new File(d, path);
                    if (f.getCanonicalPath().startsWith(d.getCanonicalPath() + File.separator) && f.isFile())
                        return new WebResourceResponse(mime(path), mime(path).startsWith("text") ? "utf-8" : null, new FileInputStream(f));
                }
            } catch (Exception ignored) { }
            WebResourceResponse r = bundled.handle(path);
            if (r != null) r.setMimeType(mime(path));
            return r;
        }
    }

    /** Downloads a newer web app from the website in the background (checked with SHA-256), then tells the page. */
    private void checkForUpdate() {
        new Thread(() -> {
            try {
                JSONObject j = new JSONObject(new String(get(UPDATE_BASE + "update.json?t=" + System.currentTimeMillis()), "UTF-8"));
                if (j.optInt("native", 0) > NATIVE_VERSION) { final String url = j.optString("apkUrl", "https://github.com/Greed-C/expense-management/releases/latest");
                    needApk = url; runOnUiThread(() -> web.evaluateJavascript("window.__needApk && window.__needApk(" + JSONObject.quote(url) + ")", null)); }
                long ver = j.getLong("web"); if (ver <= Math.max(bundledVer(), downloadedVer())) return;
                File tmp = new File(getFilesDir(), "web_tmp"); deleteDir(tmp); tmp.mkdirs();
                JSONObject files = j.getJSONObject("files");
                for (Iterator<String> it = files.keys(); it.hasNext(); ) {
                    String name = it.next(); if (name.contains("/") || name.contains("..")) throw new Exception("bad name");
                    String want = files.getString(name); byte[] b = null;
                    try { // unchanged file: reuse the copy we already have instead of downloading it again
                        File cur = new File(webDir(), name);
                        byte[] have; try (InputStream in = (useDownloaded() && cur.isFile()) ? new FileInputStream(cur) : getAssets().open(name)) { have = readAll(in); }
                        if (hex(MessageDigest.getInstance("SHA-256").digest(have)).equals(want)) b = have;
                    } catch (Exception ignored) { }
                    if (b == null) {
                        b = get(UPDATE_BASE + name + "?v=" + ver);
                        if (!hex(MessageDigest.getInstance("SHA-256").digest(b)).equals(want)) throw new Exception("checksum " + name);
                    }
                    try (FileOutputStream o = new FileOutputStream(new File(tmp, name))) { o.write(b); }
                }
                try (FileOutputStream o = new FileOutputStream(new File(tmp, "webver.txt"))) { o.write(String.valueOf(ver).getBytes("UTF-8")); }
                File old = new File(getFilesDir(), "web_old"); deleteDir(old);
                if (webDir().exists() && !webDir().renameTo(old)) throw new Exception("swap");
                if (!tmp.renameTo(webDir())) { old.renameTo(webDir()); throw new Exception("swap2"); }
                deleteDir(old);
                updated = true; runOnUiThread(() -> web.evaluateJavascript("window.__updateReady && window.__updateReady()", null));
            } catch (Exception ignored) { }
        }).start();
    }
    private static byte[] get(String u) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection(); c.setConnectTimeout(10000); c.setReadTimeout(30000); c.setUseCaches(false);
        try { if (c.getResponseCode() != 200) throw new Exception("http " + c.getResponseCode()); try (InputStream in = c.getInputStream()) { return readAll(in); } } finally { c.disconnect(); }
    }
    private static String hex(byte[] b) { StringBuilder s = new StringBuilder(); for (byte x : b) s.append(String.format("%02x", x)); return s.toString(); }
    private static void deleteDir(File f) { if (f == null || !f.exists()) return; File[] k = f.listFiles(); if (k != null) for (File c : k) deleteDir(c); f.delete(); }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new AppFiles())
                .build();
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("*/*"); i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/pdf", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"});
                try { startActivityForResult(Intent.createChooser(i, null), PICK_FILE); } catch (Exception e) { fileCb = null; cb.onReceiveValue(null); return false; }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "EMAndroid");
        setContentView(web);
        if (state != null) web.restoreState(state);
        else web.loadUrl("https://" + HOST + "/assets/index.html");
        checkForUpdate();
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != PICK_FILE || fileCb == null) return;
        Uri u = (res == RESULT_OK && data != null) ? data.getData() : null;
        fileCb.onReceiveValue(u != null ? new Uri[]{u} : null); fileCb = null;
    }

    private long lastCheck = System.currentTimeMillis();
    @Override
    protected void onResume() {
        super.onResume();
        if (System.currentTimeMillis() - lastCheck > 30 * 60 * 1000L) { lastCheck = System.currentTimeMillis(); checkForUpdate(); }
    }

    /** Native "Sign in with Google" (Google blocks its web sign-in page inside apps). Returns an ID token to the page. */
    private class Bridge {
        /** Lets the page ask, once it has loaded, whether an update arrived before it was ready to hear about it. */
        @JavascriptInterface
        public String status() {
            try { JSONObject o = new JSONObject(); o.put("needApk", needApk); o.put("updated", updated); o.put("native", NATIVE_VERSION); o.put("web", Math.max(bundledVer(), downloadedVer())); updated = false; return o.toString(); } catch (Exception e) { return "{}"; }
        }
        @JavascriptInterface
        public void googleSignIn(final String clientId) {
            runOnUiThread(() -> {
                try {
                    CredentialManager cm = CredentialManager.create(MainActivity.this);
                    GetSignInWithGoogleOption opt = new GetSignInWithGoogleOption.Builder(clientId).build();
                    GetCredentialRequest req = new GetCredentialRequest.Builder().addCredentialOption(opt).build();
                    cm.getCredentialAsync(MainActivity.this, req, new CancellationSignal(), getMainExecutor(),
                            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                                @Override
                                public void onResult(GetCredentialResponse r) {
                                    Credential c = r.getCredential();
                                    if (c instanceof CustomCredential && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType())) {
                                        try {
                                            reply(GoogleIdTokenCredential.createFrom(c.getData()).getIdToken(), "");
                                        } catch (Exception e) { reply("", "parse: " + e.getMessage()); }
                                    } else reply("", "unexpected credential");
                                }
                                @Override
                                public void onError(GetCredentialException e) {
                                    reply("", e instanceof GetCredentialCancellationException ? "cancelled" : (e.getType() + ": " + e.getMessage()));
                                }
                            });
                } catch (Exception e) { reply("", "start: " + e.getMessage()); }
            });
        }
    }

    private void reply(String token, String err) {
        runOnUiThread(() -> web.evaluateJavascript("window.__gsiResult && window.__gsiResult(" + JSONObject.quote(token) + "," + JSONObject.quote(err) + ")", null));
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(window.__back && window.__back()) ? '1' : '0'", value -> {
            if (!"\"1\"".equals(value)) MainActivity.super.onBackPressed();
        });
    }
}
