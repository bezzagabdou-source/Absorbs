package dz.absorbs.app.ui

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.animation.OvershootInterpolator
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import dz.absorbs.app.R
import dz.absorbs.app.data.Api

/** Native shell: Feed · Reels · Create · Messages · Profile + floating Dz connect ai orb. */
class MainActivity : AppCompatActivity() {
    private lateinit var tabs: List<LinearLayout>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.init(this)
        setContentView(R.layout.activity_main)

        tabs = listOf(
            findViewById(R.id.navFeed),
            findViewById(R.id.navReels),
            findViewById(R.id.navMessages),
            findViewById(R.id.navProfile),
        )
        findViewById<LinearLayout>(R.id.navFeed).setOnClickListener { select(0, FeedFragment()) }
        findViewById<LinearLayout>(R.id.navReels).setOnClickListener { select(1, ReelsFragment()) }
        findViewById<LinearLayout>(R.id.navMessages).setOnClickListener { select(2, MessagesFragment()) }
        findViewById<LinearLayout>(R.id.navProfile).setOnClickListener { select(3, ProfileFragment()) }
        findViewById<LinearLayout>(R.id.navCreate).setOnClickListener {
            it.animate().scaleX(0.85f).scaleY(0.85f).setDuration(90).withEndAction {
                it.animate().scaleX(1f).scaleY(1f).setDuration(220).setInterpolator(OvershootInterpolator(2f)).start()
                startActivity(Intent(this, ComposerActivity::class.java))
            }.start()
        }
        val fab = findViewById<View>(R.id.btnAiFab)
        fab.setOnClickListener {
            supportFragmentManager.beginTransaction().replace(R.id.container, AiFragment()).commit()
        }
        fab.animate().scaleX(0f).scaleY(0f).setDuration(1).withEndAction {
            fab.animate().scaleX(1f).scaleY(1f).setDuration(500).setStartDelay(350)
                .setInterpolator(OvershootInterpolator(1.8f)).start()
        }.start()

        if (savedInstanceState == null) select(0, FeedFragment())
    }

    private fun select(index: Int, fragment: Fragment) {
        tabs.forEachIndexed { i, tab ->
            val active = i == index
            val color = Color.parseColor(if (active) "#059669" else "#3D5750")
            (tab.getChildAt(0) as? ImageView)?.setColorFilter(color)
            (tab.getChildAt(1) as? TextView)?.setTextColor(color)
            if (active) {
                tab.getChildAt(0)?.animate()?.scaleX(1.15f)?.scaleY(1.15f)?.setDuration(140)
                    ?.withEndAction { tab.getChildAt(0)?.animate()?.scaleX(1f)?.scaleY(1f)?.setDuration(140)?.start() }
                    ?.start()
            }
        }
        supportFragmentManager.beginTransaction().replace(R.id.container, fragment).commit()
    }
}
