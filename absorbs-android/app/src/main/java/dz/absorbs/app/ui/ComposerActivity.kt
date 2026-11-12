package dz.absorbs.app.ui

import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.bumptech.glide.Glide
import dz.absorbs.app.R
import dz.absorbs.app.data.Api

class ComposerActivity : AppCompatActivity() {
    private var imageUri: Uri? = null
    private var publishing = false

    private val picker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            imageUri = uri
            val iv = findViewById<ImageView>(R.id.ivPreview)
            iv.visibility = View.VISIBLE
            Glide.with(this).load(uri).centerCrop().into(iv)
        }
    }

    private var storyMode = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_composer)
        storyMode = intent.getStringExtra("mode") == "story"
        if (storyMode) {
            findViewById<TextView>(R.id.tvComposerTitle).text = "قصة جديدة — تختفي بعد 24 ساعة"
            findViewById<TextView>(R.id.btnPublish).text = "نشر القصة"
        }
        val et = findViewById<EditText>(R.id.etPost)
        findViewById<TextView>(R.id.btnCancelPost).setOnClickListener { finish() }
        findViewById<TextView>(R.id.btnPickImage).setOnClickListener { picker.launch("image/*") }
        findViewById<TextView>(R.id.btnPublish).setOnClickListener {
            if (publishing) return@setOnClickListener
            val content = et.text.toString().trim()
            if (content.isBlank() && imageUri == null) {
                Toast.makeText(this, "اكتب شيئًا أو أضف صورة أولًا", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            publishing = true
            Toast.makeText(this, "جارٍ النشر…", Toast.LENGTH_SHORT).show()
            val uri = imageUri
            if (storyMode) {
                if (uri == null) { done("القصة تحتاج صورة أولًا"); return@setOnClickListener }
                val sBytes = contentResolver.openInputStream(uri)?.readBytes()
                val sMime = contentResolver.getType(uri) ?: "image/jpeg"
                if (sBytes == null) { done("تعذّر قراءة الصورة"); return@setOnClickListener }
                Api.createStory(sBytes, sMime, content) { err -> done(err) }
                return@setOnClickListener
            }
            if (uri == null) {
                Api.createPost(content, null, "image") { err -> done(err) }
            } else {
                val bytes = contentResolver.openInputStream(uri)?.readBytes()
                val mime = contentResolver.getType(uri) ?: "image/jpeg"
                if (bytes == null) { done("تعذّر قراءة الصورة"); return@setOnClickListener }
                Api.uploadImage(bytes, mime) { url, err ->
                    if (url == null) done(err) else Api.createPost(content, url, "image") { e2 -> done(e2) }
                }
            }
        }
    }

    private fun done(err: String?) {
        runOnUiThread {
            publishing = false
            if (err == null) {
                Toast.makeText(this, "تم نشر منشورك", Toast.LENGTH_SHORT).show()
                finish()
            } else Toast.makeText(this, err, Toast.LENGTH_LONG).show()
        }
    }
}
