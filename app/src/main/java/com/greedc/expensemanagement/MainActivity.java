package com.greedc.expensemanagement;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.webkit.JavascriptInterface;

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
    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
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
        web.addJavascriptInterface(new Bridge(), "EMAndroid");
        setContentView(web);
        if (state != null) web.restoreState(state);
        else web.loadUrl("https://" + HOST + "/assets/index.html");
    }

    /** Native "Sign in with Google" (Google blocks its web sign-in page inside apps). Returns an ID token to the page. */
    private class Bridge {
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
