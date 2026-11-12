package dz.absorbs.app.ui

import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.bumptech.glide.Glide
import dz.absorbs.app.R
import dz.absorbs.app.data.Api
import dz.absorbs.app.data.Config

class ProfileFragment : Fragment() {
    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        val v = inflater.inflate(R.layout.fragment_profile, container, false)
        val iv = v.findViewById<ImageView>(R.id.ivProfileAvatar)
        Api.fetchMyProfile { profile, _ ->
            activity?.runOnUiThread {
                if (profile != null) {
                    v.findViewById<TextView>(R.id.tvProfileName).text = profile.displayName
                    v.findViewById<TextView>(R.id.tvProfileUser).text = "@${profile.username}"
                    v.findViewById<TextView>(R.id.tvProfileBio).text = profile.bio ?: ""
                    if (!profile.avatarUrl.isNullOrBlank()) {
                        Glide.with(requireContext()).load(profile.avatarUrl).circleCrop().into(iv)
                        iv.setPadding(0, 0, 0, 0)
                    }
                }
            }
        }
        v.findViewById<TextView>(R.id.btnPrivacy).setOnClickListener { open("${Config.SITE_URL}/privacy") }
        v.findViewById<TextView>(R.id.btnTerms).setOnClickListener { open("${Config.SITE_URL}/terms") }
        v.findViewById<TextView>(R.id.btnOpenSite).setOnClickListener { open(Config.SITE_URL) }
        v.findViewById<TextView>(R.id.btnDeleteAccount).setOnClickListener {
            AlertDialog.Builder(requireContext())
                .setTitle("حذف الحساب نهائيًا")
                .setMessage("سيتم حذف حسابك وكل منشوراتك ورسائلك نهائيًا ولا يمكن التراجع. هل أنت متأكد؟")
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("حذف نهائي") { _, _ ->
                    Api.deleteAccount { err ->
                        activity?.runOnUiThread {
                            if (err == null) {
                                Toast.makeText(requireContext(), "تم حذف حسابك", Toast.LENGTH_LONG).show()
                                goAuth()
                            } else {
                                Toast.makeText(requireContext(), err, Toast.LENGTH_LONG).show()
                                open("${Config.SITE_URL}/delete-account")
                            }
                        }
                    }
                }
                .show()
        }
        v.findViewById<Button>(R.id.btnLogout).setOnClickListener {
            Api.signOut()
            goAuth()
        }
        return v
    }

    private fun open(url: String) {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }

    private fun goAuth() {
        val i = Intent(requireContext(), AuthActivity::class.java)
        i.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(i)
    }
}
