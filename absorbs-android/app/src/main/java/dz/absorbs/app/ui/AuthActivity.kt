package dz.absorbs.app.ui

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

/** Native glass auth — white pearl glass, emerald/teal/sky. No WebView. */
class AuthActivity : AppCompatActivity() {
    private var signupMode = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.init(this)
        if (Session.loggedIn) {
            startActivity(Intent(this, MainActivity::class.java))
            finish()
            return
        }
        setContentView(R.layout.activity_auth)

        val groupSignup = findViewById<LinearLayout>(R.id.groupSignup)
        val etDisplay = findViewById<EditText>(R.id.etDisplay)
        val etUsername = findViewById<EditText>(R.id.etUsername)
        val etEmail = findViewById<EditText>(R.id.etEmail)
        val etPassword = findViewById<EditText>(R.id.etPassword)
        val tvError = findViewById<TextView>(R.id.tvAuthError)
        val btnAuth = findViewById<Button>(R.id.btnAuth)
        val tabLogin = findViewById<TextView>(R.id.btnTabLogin)
        val tabSignup = findViewById<TextView>(R.id.btnTabSignup)

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
                        if (err == null) goMain()
                        else if (err.startsWith("تم إنشاء")) {
                            Toast.makeText(this, err, Toast.LENGTH_LONG).show()
                            setMode(false); btnAuth.isEnabled = true; btnAuth.text = "دخول"
                        } else fail(err)
                    }
                }
            } else {
                Api.signIn(email, pass) { err ->
                    runOnUiThread { if (err == null) goMain() else fail(err) }
                }
            }
        }
    }

    private fun goMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }
}
