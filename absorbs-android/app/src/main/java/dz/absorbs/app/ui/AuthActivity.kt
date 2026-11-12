package dz.absorbs.app.ui

import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import dz.absorbs.app.R
import dz.absorbs.app.data.Api
import dz.absorbs.app.data.Config
import dz.absorbs.app.data.Session

/** Native animated glass auth — floating aurora blobs, Lottie mascot, email-activation flow. */
class AuthActivity : AppCompatActivity() {
    private var signupMode = false
    private var lastEmail = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.init(this)
        if (Session.loggedIn) {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }
        setContentView(R.layout.activity_auth)

        animateAmbience()

        val groupSignup = findViewById<LinearLayout>(R.id.groupSignup)
        val groupActivate = findViewById<LinearLayout>(R.id.groupActivate)
        val etDisplay = findViewById<EditText>(R.id.etDisplay)
        val etUsername = findViewById<EditText>(R.id.etUsername)
        val etEmail = findViewById<EditText>(R.id.etEmail)
        val etPassword = findViewById<EditText>(R.id.etPassword)
        val tvError = findViewById<TextView>(R.id.tvAuthError)
        val btnAuth = findViewById<Button>(R.id.btnAuth)
        val tabLogin = findViewById<TextView>(R.id.btnTabLogin)
        val tabSignup = findViewById<TextView>(R.id.btnTabSignup)

        // Entrance: card rises into place.
        val card = findViewById<View>(R.id.authCard)
        card.translationY = 70f; card.alpha = 0f
        card.animate().translationY(0f).alpha(1f).setDuration(650).setStartDelay(150).start()

        fun showActivate(email: String) {
            lastEmail = email
            groupActivate.visibility = View.VISIBLE
            tvError.visibility = View.GONE
        }

        fun setMode(signup: Boolean) {
            signupMode = signup
            groupSignup.visibility = if (signup) View.VISIBLE else View.GONE
            btnAuth.text = if (signup) "إنشاء حسابي" else "دخول"
            tabLogin.setTextColor(Color.parseColor(if (signup) "#3D5750" else "#059669"))
            tabSignup.setTextColor(Color.parseColor(if (signup) "#059669" else "#3D5750"))
            tvError.visibility = View.GONE
        }
        tabLogin.setOnClickListener { setMode(false) }
        tabSignup.setOnClickListener { setMode(true) }

        findViewById<TextView>(R.id.btnResend).setOnClickListener {
            val email = etEmail.text.toString().trim().ifBlank { lastEmail }
            if (!email.contains("@")) {
                Toast.makeText(this, "أدخل بريدك أولًا", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            Api.resendConfirmation(email) { err ->
                runOnUiThread {
                    Toast.makeText(
                        this,
                        if (err == null) "أُرسل رابط تفعيل جديد — افحص بريدك (والرسائل غير المرغوبة)" else err,
                        Toast.LENGTH_LONG,
                    ).show()
                }
            }
        }

        findViewById<TextView>(R.id.tvPrivacy).setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${Config.SITE_URL}/privacy")))
        }
        findViewById<TextView>(R.id.tvTerms).setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${Config.SITE_URL}/terms")))
        }

        btnAuth.setOnClickListener {
            val email = etEmail.text.toString().trim()
            val pass = etPassword.text.toString()
            fun fail(msg: String) {
                tvError.text = msg
                tvError.visibility = View.VISIBLE
                btnAuth.isEnabled = true
                btnAuth.text = if (signupMode) "إنشاء حسابي" else "دخول"
            }
            if (!email.contains("@")) return@setOnClickListener fail("أدخل بريدًا إلكترونيًا صحيحًا")
            if (pass.length < 6) return@setOnClickListener fail("كلمة المرور: 6 أحرف على الأقل")
            btnAuth.isEnabled = false
            btnAuth.text = "لحظة…"
            if (signupMode) {
                val username = etUsername.text.toString().trim().lowercase()
                val display = etDisplay.text.toString().trim()
                if (!username.matches(Regex("^[a-z0-9_.]{3,20}$"))) {
                    return@setOnClickListener fail("اسم المستخدم: 3-20 حرفًا (a-z, 0-9, . _)")
                }
                if (display.isBlank()) return@setOnClickListener fail("أدخل اسمك الكامل")
                Api.signUp(email, pass, username, display) { err ->
                    runOnUiThread {
                        btnAuth.isEnabled = true
                        btnAuth.text = "إنشاء حسابي"
                        when {
                            err == null -> goMain()
                            err.contains("فعّل بريدك") || err.contains("confirm", true) -> showActivate(email)
                            else -> fail(err)
                        }
                    }
                }
            } else {
                Api.signIn(email, pass) { err ->
                    runOnUiThread {
                        btnAuth.isEnabled = true
                        btnAuth.text = "دخول"
                        when {
                            err == null -> goMain()
                            err.contains("not confirmed", true) || err.contains("تفعيل") -> showActivate(email)
                            else -> fail(err)
                        }
                    }
                }
            }
        }
    }

    private fun animateAmbience() {
        fun floatView(id: Int, dist: Float, dur: Long, delay: Long) {
            val v = findViewById<View>(id)
            ObjectAnimator.ofPropertyValuesHolder(
                v,
                PropertyValuesHolder.ofFloat(View.TRANSLATION_Y, 0f, dist),
                PropertyValuesHolder.ofFloat(View.TRANSLATION_X, 0f, dist * 0.4f),
            ).apply {
                duration = dur
                startDelay = delay
                repeatCount = ObjectAnimator.INFINITE
                repeatMode = ObjectAnimator.REVERSE
                start()
            }
        }
        floatView(R.id.blobSky, 26f, 5200, 0)
        floatView(R.id.blobMint, -20f, 4600, 400)
        floatView(R.id.blobGold, 16f, 3900, 800)
        val halo = findViewById<View>(R.id.authHalo)
        ObjectAnimator.ofPropertyValuesHolder(
            halo,
            PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.14f),
            PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.14f),
            PropertyValuesHolder.ofFloat(View.ALPHA, 0.85f, 0.4f),
        ).apply {
            duration = 1300
            repeatCount = ObjectAnimator.INFINITE
            repeatMode = ObjectAnimator.REVERSE
            start()
        }
    }

    private fun goMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
