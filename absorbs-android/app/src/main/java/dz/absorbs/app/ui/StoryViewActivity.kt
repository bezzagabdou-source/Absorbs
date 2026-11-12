package dz.absorbs.app.ui

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.ImageView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.bumptech.glide.Glide
import dz.absorbs.app.R
import dz.absorbs.app.data.TimeAr

class StoryViewActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private val closer = Runnable { if (!isFinishing) finish() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_story_view)
        val image = intent.getStringExtra("image") ?: ""
        val caption = intent.getStringExtra("caption") ?: ""
        val author = intent.getStringExtra("author") ?: ""
        val avatar = intent.getStringExtra("avatar") ?: ""
        val time = intent.getStringExtra("time") ?: ""

        Glide.with(this).load(image).fitCenter().into(findViewById<ImageView>(R.id.ivStoryFull))
        val ivAuthor = findViewById<ImageView>(R.id.ivStoryAuthor)
        if (avatar.isNotBlank()) {
            Glide.with(this).load(avatar).circleCrop().into(ivAuthor)
            ivAuthor.setPadding(0, 0, 0, 0)
        }
        findViewById<TextView>(R.id.tvStoryAuthor).text = author
        findViewById<TextView>(R.id.tvStoryTime).text = TimeAr.ago(time)
        findViewById<TextView>(R.id.tvStoryCaption).text = caption
        findViewById<TextView>(R.id.btnStoryClose).setOnClickListener { finish() }
        handler.postDelayed(closer, 7000)
    }

    override fun onDestroy() {
        handler.removeCallbacks(closer)
        super.onDestroy()
    }
}
