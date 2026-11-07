package app.dzexchange.marketplace;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.drawable.ColorDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.util.Locale;

/**
 * DZ Exchange Android shell.
 *
 * Security posture (kept intentionally small so store reviews stay simple):
 *  - one activity, one WebView, no third-party SDK, no advertising library;
 *  - JavaScript, DOM storage and cookies are enabled (the marketplace needs them);
 *  - file access, universal file access and mixed content are disabled;
 *  - navigation is restricted to the marketplace origin and the Google/Firebase
 *    sign-in hosts; every other link opens in the user's browser;
 *  - back navigation follows the web history, then finishes the activity;
 *  - a friendly offline/error panel replaces the raw WebView error page.
 */
public class MainActivity extends Activity {

    /** Marketplace origin. Must stay in sync with `appUrlString` in strings.xml. */
    private static final String APP_HOST = "marketplace-fixed.vercel.app";
    private static final String APP_URL = "https://" + APP_HOST + "/";
    private static final String APP_USER_AGENT_TAG = "DZExchangeApp/2";

    /**
     * Hosts that legitimately appear during Google sign-in with Firebase:
     * the popup, the account picker and the redirect that returns the ID token.
     * They must stay inside the WebView or the flow cannot complete.
     */
    private static final String[] AUTH_HOSTS = {
            "accounts.google.com",
            "accounts.youtube.com",
            "apis.google.com",
            "ssl.gstatic.com",
            "www.gstatic.com",
            "www.google.com",
            "google.com",
            "gstatic.com",
            "googleusercontent.com",
            "firebaseapp.com",
            "firebase.com",
            "web.app",
            "identitytoolkit.googleapis.com",
            "securetoken.googleapis.com",
    };

    private static final int FILE_CHOOSER_REQUEST = 4101;

    private static final int BG_DARK = Color.parseColor("#0F2A20");
    private static final int BG_LIGHT = Color.parseColor("#F6F7F3");

    private WebView webView;
    private String pendingHandoffCode = "";
    private boolean handedOffToBrowser;
    private ProgressBar progressBar;
    private LinearLayout errorPanel;
    private ValueCallback<Uri[]> filePathCallback;
    private String pendingUrl;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applySystemBars();
        setContentView(buildLayout());
        configureWebView();
        applyWindowInsets(findViewById(android.R.id.content));

        if (savedInstanceState != null) {
            String restored = savedInstanceState.getString("webview_state");
            if (restored != null) {
                webView.restoreState(savedInstanceState);
            } else {
                webView.loadUrl(APP_URL);
            }
        } else {
            webView.loadUrl(APP_URL);
        }
        handleIntent(getIntent());
        registerBackHandler();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    /** Picks up the browser sign-in result when the app is opened by dzexchange://auth. */
    private void handleIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri data = intent.getData();
        if (data == null) return;
        if ("dzexchange".equals(data.getScheme()) && "auth".equals(data.getHost())) {
            handleAuthLink(data);
        }
    }

    private View buildLayout() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(BG_LIGHT);

        webView = new WebView(this);
        webView.setBackgroundColor(BG_LIGHT);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setVisibility(View.GONE);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(3));
        progressParams.topMargin = 0;
        root.addView(progressBar, progressParams);

        errorPanel = buildErrorPanel();
        errorPanel.setVisibility(View.GONE);
        root.addView(errorPanel, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return root;
    }

    private LinearLayout buildErrorPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(android.view.Gravity.CENTER);
        panel.setBackgroundColor(BG_LIGHT);
        int padding = dp(32);
        panel.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText(getString(R.string.offline_title));
        title.setTextSize(19f);
        title.setGravity(android.view.Gravity.CENTER);
        title.setTextColor(Color.parseColor("#173D2F"));
        panel.addView(title);

        TextView hint = new TextView(this);
        hint.setText(getString(R.string.offline_hint));
        hint.setTextSize(13.5f);
        hint.setGravity(android.view.Gravity.CENTER);
        hint.setTextColor(Color.parseColor("#4A5A50"));
        hint.setPadding(0, dp(10), 0, dp(22));
        panel.addView(hint);

        Button retry = new Button(this);
        retry.setText(getString(R.string.offline_retry));
        retry.setOnClickListener(v -> {
            errorPanel.setVisibility(View.GONE);
            String target = pendingUrl != null ? pendingUrl : APP_URL;
            webView.loadUrl(target);
        });
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        panel.addView(retry, buttonParams);
        return panel;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setTextZoom(100);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        // Marks requests as coming from the app so the site can offer the browser hand-off.
        settings.setUserAgentString(settings.getUserAgentString() + " " + APP_USER_AGENT_TAG);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookies.setAcceptThirdPartyCookies(webView, true);
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                errorPanel.setVisibility(View.GONE);
                if (pendingHandoffCode != null && !pendingHandoffCode.isEmpty()) redeemHandoff();
                startBrowserSignInIfNeeded(url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError(request.getUrl().toString());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                try {
                    Intent chooser = params.createIntent();
                    startActivityForResult(
                            Intent.createChooser(chooser, getString(R.string.choose_photo)),
                            FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException error) {
                    filePathCallback = null;
                    return false;
                }
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                // Camera and microphone are never granted inside the shell: the
                // marketplace does not need them, and refusing keeps the app's
                // privacy declaration exact ("no camera, no microphone").
                request.deny();
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, false, false);
            }
        });
    }

    /** Handles dzexchange://auth?code=… — the session handed back by the browser sign-in. */
    private boolean handleAuthLink(Uri uri) {
        if (!"dzexchange".equals(uri.getScheme()) || !"auth".equals(uri.getHost())) return false;
        String code = uri.getQueryParameter("code");
        if (code != null && !code.isEmpty()) {
            pendingHandoffCode = code;
            redeemHandoff();
        }
        return true;
    }

    /**
     * Redeems the single-use code for a real session cookie.
     *
     * Fetching from inside this WebView is what makes the cookie land in the
     * WebView's own cookie jar; doing it natively would sign in a different jar.
     */
    private void redeemHandoff() {
        final String code = pendingHandoffCode;
        if (code == null || code.isEmpty() || webView == null) return;
        pendingHandoffCode = null;
        String js = "(async()=>{try{const r=await fetch('/api/auth/app-exchange',{method:'POST',credentials:'include',"
            + "headers:{'Content-Type':'application/json'},body:JSON.stringify({code:" + jsString(code) + "})});"
            + "if(r.ok){location.replace('/');}else{location.replace('/login');}}catch(e){location.replace('/login');}})();";
        webView.evaluateJavascript(js, null);
    }

    private static String jsString(String value) {
        StringBuilder out = new StringBuilder("'");
        for (char c : value.toCharArray()) {
            if (c == '\'' || c == '\\') out.append('\\').append(c);
            else out.append(c);
        }
        return out.append('\'').toString();
    }

    private boolean isInternal(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme();
        String host = uri.getHost();
        if (host == null) return false;
        host = host.toLowerCase(Locale.ROOT);
        if ("https".equalsIgnoreCase(scheme)) {
            if (host.equals(APP_HOST) || host.endsWith("." + APP_HOST)) return true;
            for (String allowed : AUTH_HOSTS) {
                if (host.equals(allowed) || host.endsWith("." + allowed)) return true;
            }
            return false;
        }
        // http is refused outright; other schemes (tel:, mailto:, intent:) are external.
        return false;
    }

    private boolean handleUrl(Uri uri) {
        if (uri == null) return false;
        if (handleAuthLink(uri)) return true;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (isInternal(uri)) return false;
        if ("https".equals(scheme) || "http".equals(scheme)) {
            openExternally(uri);
            return true;
        }
        if ("mailto".equals(scheme) || "tel".equals(scheme) || "sms".equals(scheme) || "geo".equals(scheme)) {
            openExternally(uri);
            return true;
        }
        // Downloads (e.g. the APK link) must go to the system downloader, never to the WebView.
        if ("blob".equals(scheme) || "data".equals(scheme)) return true;
        return true;
    }

    private void openExternally(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
            // No browser/handler installed: keep the WebView where it is.
        }
    }

    private void showError(String url) {
        pendingUrl = url;
        if (isOnline()) {
            // A single failed request while connected is usually transient.
            pendingUrl = null;
        }
        errorPanel.setVisibility(View.VISIBLE);
    }

    private boolean isOnline() {
        try {
            ConnectivityManager manager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (manager == null) return true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network network = manager.getActiveNetwork();
                if (network == null) return false;
                NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
                return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
            }
            @SuppressWarnings("deprecation") NetworkInfo info = manager.getActiveNetworkInfo();
            return info != null && info.isConnected();
        } catch (SecurityException error) {
            return true;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    ClipData clip = data.getClipData();
                    results = new Uri[clip.getItemCount()];
                    for (int index = 0; index < clip.getItemCount(); index++) {
                        results[index] = clip.getItemAt(index).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void registerBackHandler() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::goBackOrFinish);
        }
    }

    @Override
    public void onBackPressed() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            goBackOrFinish();
            return;
        }
        super.onBackPressed();
    }

    private void goBackOrFinish() {
        if (errorPanel.getVisibility() == View.VISIBLE) {
            errorPanel.setVisibility(View.GONE);
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        finish();
    }

    private void applySystemBars() {
        Window window = getWindow();
        window.setBackgroundDrawable(new ColorDrawable(BG_LIGHT));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(BG_LIGHT);
            window.setNavigationBarColor(BG_LIGHT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            View decor = window.getDecorView();
            int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            decor.setSystemUiVisibility(flags);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
        }
    }

    private void applyWindowInsets(View root) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return;
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int top;
            int bottom;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                top = bars.top;
                bottom = bars.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            view.setPadding(0, top, 0, bottom);
            return insets;
        });
        root.requestApplyInsets();
    }

    private int dp(int value) {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        return Math.round(value * metrics.density);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
            outState.putString("webview_state", webView.getUrl());
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        if (webView != null) webView.requestApplyInsets();
    }

    /**
     * Google refuses OAuth inside embedded WebViews (disallowed_useragent), so a
     * Google sign-in request is handed to the user's real browser. The browser
     * comes back through the dzexchange://auth deep link with a one-time code.
     */
    private void startBrowserSignInIfNeeded(String url) {
        if (url == null || !url.startsWith("https://" + APP_HOST + "/login")) return;
        Uri uri = Uri.parse(url);
        if (!"1".equals(uri.getQueryParameter("handoff"))) return;
        if (pendingHandoffCode != null && !pendingHandoffCode.isEmpty()) return;
        if (handedOffToBrowser) return;
        handedOffToBrowser = true;
        openExternally(Uri.parse("https://" + APP_HOST + "/api/auth/app-start"));
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            if (webView.getParent() instanceof ViewGroup) {
                ((ViewGroup) webView.getParent()).removeView(webView);
            }
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
