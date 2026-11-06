package app.dzexchange.marketplace;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import android.webkit.CookieManager;
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

/**
 * Single-activity WebView shell for https://marketplace-fixed.vercel.app.
 *
 * Hard rules:
 *  - Only the exact application host is rendered inside the WebView.
 *  - Every other http(s) link is handed to the system browser.
 *  - No analytics, no ads, no third-party SDKs, no extra permissions.
 */
public class MainActivity extends Activity {

    static final String APP_HOST = "marketplace-fixed.vercel.app";
    static final String START_URL = "https://" + APP_HOST + "/";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final String STATE_URL = "current_url";

    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout errorPanel;
    private ValueCallback<Uri[]> filePathCallback;
    private String pendingUrl = START_URL;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // targetSdk 35 forces edge-to-edge on Android 15+: pad the content by the
        // real system-bar / cutout / keyboard insets so nothing hides under them.
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        applyWindowInsets(root);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.WHITE);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        progressBar.setVisibility(View.GONE);
        root.addView(progressBar, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP));

        errorPanel = buildErrorPanel();
        errorPanel.setVisibility(View.GONE);
        root.addView(errorPanel, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);
        applySystemBarAppearance();
        configureWebView();
        registerBackHandler();

        if (savedInstanceState != null) {
            String restored = savedInstanceState.getString(STATE_URL);
            if (restored != null && isInternal(Uri.parse(restored))) {
                pendingUrl = restored;
            }
            webView.restoreState(savedInstanceState);
        }
        if (webView.getUrl() == null) {
            webView.loadUrl(pendingUrl);
        }
    }

    /**
     * Android 15 (targetSdk 35) draws the app edge-to-edge and no longer honours
     * adjustResize, so the shell pads itself with the live system-bar, display-cutout
     * and keyboard insets. On older releases the same listener is a no-op for bars
     * the platform already insets, which keeps one code path for every API level.
     */
    private void applyWindowInsets(final View root) {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int left;
            int top;
            int right;
            int bottom;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets safe = insets.getInsets(
                        WindowInsets.Type.systemBars()
                                | WindowInsets.Type.displayCutout()
                                | WindowInsets.Type.ime());
                left = safe.left;
                top = safe.top;
                right = safe.right;
                bottom = safe.bottom;
            } else {
                left = insets.getSystemWindowInsetLeft();
                top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight();
                bottom = insets.getSystemWindowInsetBottom();
            }
            v.setPadding(left, top, right, bottom);
            return insets;
        });
        root.requestApplyInsets();
    }

    /** White shell ⇒ dark system-bar icons on every supported API level. */
    private void applySystemBarAppearance() {
        android.view.Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(light, light);
            }
        } else {
            int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                window.setNavigationBarColor(Color.WHITE);
            }
            window.setStatusBarColor(Color.WHITE);
            window.getDecorView().setSystemUiVisibility(flags);
        }
    }

    /**
     * Predictive back (Android 13+, default-on at targetSdk 35) stops delivering
     * onBackPressed, so register a real callback and keep the legacy override for
     * API 23–32. The API 33 types live in a nested class that is only loaded there.
     */
    private void registerBackHandler() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            BackHandler33.register(getOnBackInvokedDispatcher(), this::goBackOrFinish);
        }
    }

    private static final class BackHandler33 {
        static void register(OnBackInvokedDispatcher dispatcher, Runnable action) {
            OnBackInvokedCallback callback = action::run;
            dispatcher.registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback);
        }
    }

    private void goBackOrFinish() {
        if (errorPanel != null && errorPanel.getVisibility() == View.VISIBLE) {
            errorPanel.setVisibility(View.GONE);
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            finish();
        }
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl(), request.isForMainFrame());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url), true);
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                pendingUrl = url;
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showError();
                }
            }
            // TLS failures are never bypassed: the default WebViewClient behaviour cancels them.
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view,
                                             ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;
                Intent intent;
                try {
                    intent = params.createIntent();
                } catch (RuntimeException error) {
                    intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                }
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                try {
                    startActivityForResult(Intent.createChooser(intent, null), FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException error) {
                    filePathCallback = null;
                    return false;
                }
            }

            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
                progressBar.setProgress(newProgress);
            }
        });
    }

    /** Returns true when the navigation must NOT be loaded by this WebView. */
    private boolean handleUrl(Uri uri, boolean mainFrame) {
        if (uri == null) {
            return true;
        }
        if (isInternal(uri)) {
            return false;
        }
        if (!mainFrame) {
            // Block off-host subframe navigations instead of leaking them to the browser.
            return true;
        }
        openExternally(uri);
        return true;
    }

    /** Exact-host, https-only allowlist. No subdomains, no look-alike suffixes, no userinfo. */
    static boolean isInternal(Uri uri) {
        if (uri == null || !uri.isHierarchical()) {
            return false;
        }
        if (!"https".equalsIgnoreCase(uri.getScheme())) {
            return false;
        }
        if (uri.getUserInfo() != null) {
            return false;
        }
        String host = uri.getHost();
        if (host == null || !APP_HOST.equalsIgnoreCase(host)) {
            return false;
        }
        int port = uri.getPort();
        return port == -1 || port == 443;
    }

    private void openExternally(Uri uri) {
        String scheme = uri.getScheme();
        if (scheme == null
                || !("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme))) {
            return; // never launch arbitrary intent:// / file:// / content:// targets
        }
        Intent browser = new Intent(Intent.ACTION_VIEW, uri);
        browser.addCategory(Intent.CATEGORY_BROWSABLE);
        browser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            startActivity(browser);
        } catch (ActivityNotFoundException | SecurityException ignored) {
            // No browser available: stay in the app rather than crash.
        }
    }

    private LinearLayout buildErrorPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(Color.WHITE);
        panel.setPadding(dp(28), dp(28), dp(28), dp(28));

        TextView title = new TextView(this);
        title.setText("تعذّر الاتصال");
        title.setTextSize(20);
        title.setTextColor(Color.parseColor("#0F172A"));
        title.setGravity(Gravity.CENTER);
        panel.addView(title);

        TextView hint = new TextView(this);
        hint.setText("تحقّق من اتصال الإنترنت ثم أعد المحاولة.");
        hint.setTextSize(15);
        hint.setTextColor(Color.parseColor("#475569"));
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(10), 0, dp(20));
        panel.addView(hint);

        Button retry = new Button(this);
        retry.setText("إعادة المحاولة");
        retry.setOnClickListener(v -> {
            errorPanel.setVisibility(View.GONE);
            String target = webView.getUrl();
            if (target == null || !isInternal(Uri.parse(target))) {
                target = START_URL;
            }
            webView.loadUrl(target);
        });
        panel.addView(retry);
        return panel;
    }

    private void showError() {
        progressBar.setVisibility(View.GONE);
        errorPanel.setVisibility(View.VISIBLE);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && filePathCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK) {
                if (data != null && data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    result = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        result[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data != null && data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            filePathCallback.onReceiveValue(result);
            filePathCallback = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
            outState.putString(STATE_URL, webView.getUrl());
        }
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        if (webView != null) {
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // API 23–32 path. API 33+ uses the OnBackInvokedCallback registered above.
        if (errorPanel != null && errorPanel.getVisibility() == View.VISIBLE) {
            errorPanel.setVisibility(View.GONE);
            return;
        }
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
