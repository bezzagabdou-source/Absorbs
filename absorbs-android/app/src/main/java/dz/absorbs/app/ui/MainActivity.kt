package dz.absorbs.app.ui

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import dz.absorbs.app.R
import dz.absorbs.app.data.Api

/** Native shell with a glass bottom bar — Feed · Messages · Create · AI · Profile. */
class MainActivity : AppCompatActivity() {
    private lateinit var tabs: List<LinearLayout>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.init(this)
        setContentView(R.layout.activity_main)

        tabs = listOf(
            findViewById(R.id.navFeed),
            findViewById(R.id.navMessages),
            findViewById(R.id.navAi),
            findViewById(R.id.navProfile),
        )
        findViewById<LinearLayout>(R.id.navFeed).setOnClickListener { select(0, FeedFragment()) }
        findViewById<LinearLayout>(R.id.navMessages).setOnClickListener { select(1, MessagesFragment()) }
        findViewById<LinearLayout>(R.id.navAi).setOnClickListener { select(2, AiFragment()) }
        findViewById<LinearLayout>(R.id.navProfile).setOnClickListener { select(3, ProfileFragment()) }
        findViewById<LinearLayout>(R.id.navCreate).setOnClickListener {
            startActivity(Intent(this, ComposerActivity::class.java))
        }
        if (savedInstanceState == null) select(0, FeedFragment())
    }

    private fun select(index: Int, fragment: Fragment) {
        tabs.forEachIndexed { i, tab ->
            val active = i == index
            val color = Color.parseColor(if (active) "#059669" else "#3D5750")
            (tab.getChildAt(0) as? ImageView)?.setColorFilter(color)
            (tab.getChildAt(1) as? TextView)?.setTextColor(color)
        }
        supportFragmentManager.beginTransaction().replace(R.id.container, fragment).commit()
    }
}
