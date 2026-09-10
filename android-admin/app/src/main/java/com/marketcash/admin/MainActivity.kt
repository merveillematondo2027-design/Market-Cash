package com.marketcash.admin

import android.app.role.RoleManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.Telephony
import android.text.InputType
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.firebase.auth.FirebaseAuth

class MainActivity : ComponentActivity() {
    private lateinit var status: TextView
    private lateinit var email: EditText
    private lateinit var password: EditText

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        FirebaseRuntime.ensure(this)
        buildUi()
        requestSmsPermissions()
        refreshStatus()
        PendingSmsStore.flush(this) { refreshStatus() }
    }

    private fun buildUi() {
        val pad = (20 * resources.displayMetrics.density).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
        val title = TextView(this).apply {
            text = "Market-Cash Admin · Contrôle paiements"
            textSize = 22f
        }
        status = TextView(this).apply {
            textSize = 14f
            setPadding(0, pad / 2, 0, pad)
        }
        email = EditText(this).apply {
            hint = "E-mail administrateur Market-Cash"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        password = EditText(this).apply {
            hint = "Mot de passe"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        val login = Button(this).apply {
            text = "Connecter l’administrateur"
            setOnClickListener { signIn() }
        }
        val smsRole = Button(this).apply {
            text = "Définir Market-Cash comme application SMS"
            setOnClickListener { requestDefaultSmsRole() }
        }
        val sync = Button(this).apply {
            text = "Synchroniser les SMS en attente"
            setOnClickListener { PendingSmsStore.flush(this@MainActivity) { refreshStatus() } }
        }
        val logout = Button(this).apply {
            text = "Déconnecter ce téléphone"
            setOnClickListener {
                FirebaseAuth.getInstance().signOut()
                refreshStatus()
            }
        }
        root.addView(title)
        root.addView(status)
        root.addView(email, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        root.addView(password, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        root.addView(login)
        root.addView(smsRole)
        root.addView(sync)
        root.addView(logout)
        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun signIn() {
        val mail = email.text.toString().trim()
        val pass = password.text.toString()
        if (mail.isBlank() || pass.isBlank()) {
            Toast.makeText(this, "E-mail et mot de passe requis.", Toast.LENGTH_SHORT).show()
            return
        }
        FirebaseAuth.getInstance().signInWithEmailAndPassword(mail, pass)
            .addOnSuccessListener {
                password.setText("")
                Toast.makeText(this, "Téléphone connecté à Market-Cash.", Toast.LENGTH_SHORT).show()
                PendingSmsStore.flush(this) { refreshStatus() }
                refreshStatus()
            }
            .addOnFailureListener {
                Toast.makeText(this, it.localizedMessage ?: "Connexion impossible.", Toast.LENGTH_LONG).show()
                refreshStatus()
            }
    }

    private fun requestSmsPermissions() {
        val permissions = arrayOf(
            android.Manifest.permission.RECEIVE_SMS,
            android.Manifest.permission.READ_SMS
        )
        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) ActivityCompat.requestPermissions(this, missing.toTypedArray(), 1001)
    }

    private fun requestDefaultSmsRole() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            val roleManager = getSystemService(RoleManager::class.java)
            if (roleManager.isRoleAvailable(RoleManager.ROLE_SMS) && !roleManager.isRoleHeld(RoleManager.ROLE_SMS)) {
                startActivityForResult(roleManager.createRequestRoleIntent(RoleManager.ROLE_SMS), 1002)
            } else refreshStatus()
        } else if (Telephony.Sms.getDefaultSmsPackage(this) != packageName) {
            val intent = Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT)
                .putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, packageName)
            startActivityForResult(intent, 1002)
        } else refreshStatus()
    }

    override fun onResume() {
        super.onResume()
        if (::status.isInitialized) refreshStatus()
    }

    private fun refreshStatus() {
        val signedIn = FirebaseAuth.getInstance().currentUser?.email ?: "non connecté"
        val defaultSms = if (Telephony.Sms.getDefaultSmsPackage(this) == packageName) "OUI" else "NON"
        status.text = buildString {
            appendLine("Téléphone : ${DeviceId.get(this@MainActivity)}")
            appendLine("Compte admin : $signedIn")
            appendLine("Application SMS par défaut : $defaultSms")
            append("SMS en attente de synchronisation : ${PendingSmsStore.count(this@MainActivity)}")
        }
    }
}
