package dz.absorbs.app.ui

import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.animation.OvershootInterpolator
import androidx.appcompat.app.AppCompatActivity
import dz.absorbs.app.R
import dz.absorbs.app.data.Api
import dz.absorbs.app.data.Session

/** Animated splash: pulsing halo + spring logo, then route by session. */
class SplashActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.init(this)
        setContentView(R.layout.activity_splash)

        val halo = findViewById<View>(R.id.splashHalo)
        val logo = findViewById<View>(R.id.splashLogo)
        val name = findViewById<View>(R.id.splashName)

        ObjectAnimator.ofPropertyValuesHolder(
            halo,
            PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.18f),
            PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.18f),
            PropertyValuesHolder.ofFloat(View.ALPHA, 0.9f, 0.45f),
        ).apply {
            duration = 1100
            repeatCount = ObjectAnimator.INFINITE
            repeatMode = ObjectAnimator.REVERSE
            start()
        }
        logo.scaleX = 0.5f; logo.scaleY = 0.5f; logo.alpha = 0f
        logo.animate().scaleX(1f).scaleY(1f).alpha(1f)
            .setDuration(750).setInterpolator(OvershootInterpolator(1.6f)).start()
        name.alpha = 0f
        name.animate().alpha(1f).setDuration(700).setStartDelay(250).start()

        Handler(Looper.getMainLooper()).postDelayed({
            val next = if (Session.loggedIn) MainActivity::class.java else AuthActivity::class.java
            startActivity(Intent(this, next))
            finish()
        }, 1700)
    }
}
