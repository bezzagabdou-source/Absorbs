package app.dzexchange.marketplace;

import android.app.Application;
import android.webkit.WebView;

/**
 * Application entry point.
 *
 * The only global configuration the shell needs is the WebView data-directory
 * suffix: it isolates cookies/storage of the marketplace from any other WebView
 * in the same process and keeps the multi-process package name valid.
 */
public class DzExchangeApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            WebView.setDataDirectorySuffix("dz-exchange");
        }
    }
}
