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
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.OAuthProvider

class MainActivity : ComponentActivity() {
    private lateinit var status: TextView
    private lateinit var email: EditText
    private lateinit var password: EditText

    private val smsRoleLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        refreshStatus()
        if (isDefaultSmsApp()) {
            requestSmsPermissions()
            Toast.makeText(this, "Market-Cash Admin est maintenant l’application SMS par défaut.", Toast.LENGTH_LONG).show()
        } else {
            Toast.makeText(this, "Market-Cash Admin n’a pas encore reçu le rôle SMS par défaut.", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        FirebaseRuntime.ensure(this)
        buildUi()
        refreshStatus()

        // Important: Android exige que l'app demande d'abord le rôle SMS par défaut,
        // puis seulement les permissions SMS associées à ce rôle.
        if (isDefaultSmsApp()) {
            requestSmsPermissions()
            PendingSmsStore.flush(this) { refreshStatus() }
        }
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
        val separator = TextView(this).apply {
            text = "OU"
            textSize = 12f
            gravity = android.view.Gravity.CENTER
            setPadding(0, pad / 2, 0, pad / 2)
        }
        val googleLogin = Button(this).apply {
            text = "Continuer avec Google"
            setOnClickListener { signInWithGoogle() }
        }
        val smsRole = Button(this).apply {
            text = "Définir Market-Cash comme application SMS"
            setOnClickListener { requestDefaultSmsRole() }
        }
        val importExisting = Button(this).apply {
            text = "Importer les SMS de paiement existants"
            setOnClickListener { importExistingPayments() }
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
        root.addView(separator)
        root.addView(googleLogin)
        root.addView(smsRole)
        root.addView(importExisting)
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
                onAdminSignedIn()
            }
            .addOnFailureListener {
                Toast.makeText(this, it.localizedMessage ?: "Connexion impossible.", Toast.LENGTH_LONG).show()
                refreshStatus()
            }
    }

    private fun signInWithGoogle() {
        val auth = FirebaseAuth.getInstance()
        val provider = OAuthProvider.newBuilder("google.com", auth).apply {
            addCustomParameter("prompt", "select_account")
            setScopes(listOf("email", "profile"))
        }

        Toast.makeText(this, "Ouverture de la connexion Google…", Toast.LENGTH_SHORT).show()
        auth.startActivityForSignInWithProvider(this, provider.build())
            .addOnSuccessListener { onAdminSignedIn() }
            .addOnFailureListener {
                Toast.makeText(this, it.localizedMessage ?: "Connexion Google impossible.", Toast.LENGTH_LONG).show()
                refreshStatus()
            }
    }

    private fun onAdminSignedIn() {
        val account = FirebaseAuth.getInstance().currentUser?.email ?: "compte Google"
        Toast.makeText(this, "Connecté à Market-Cash : $account", Toast.LENGTH_SHORT).show()
        PendingSmsStore.flush(this) { refreshStatus() }
        refreshStatus()
    }

    private fun importExistingPayments() {
        if (!isDefaultSmsApp()) {
            Toast.makeText(this, "Définissez d’abord Market-Cash Admin comme application SMS par défaut.", Toast.LENGTH_LONG).show()
            requestDefaultSmsRole()
            return
        }
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
            requestSmsPermissions()
            Toast.makeText(this, "Autorisez l’accès aux SMS puis relancez l’import.", Toast.LENGTH_LONG).show()
            return
        }
        if (FirebaseAuth.getInstance().currentUser == null) {
            Toast.makeText(this, "Connectez d’abord le compte administrateur.", Toast.LENGTH_LONG).show()
            return
        }
        Toast.makeText(this, "Recherche des SMS de paiement des 30 derniers jours…", Toast.LENGTH_SHORT).show()
        SmsInboxImporter.importRecentPayments(this) { imported, failed ->
            Toast.makeText(this, "$imported SMS synchronisés${if (failed > 0) ", $failed en attente" else ""}.", Toast.LENGTH_LONG).show()
            refreshStatus()
        }
    }

    private fun requestSmsPermissions() {
        if (!isDefaultSmsApp()) return
        val permissions = arrayOf(
            android.Manifest.permission.RECEIVE_SMS,
            android.Manifest.permission.READ_SMS,
            android.Manifest.permission.SEND_SMS
        )
        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) ActivityCompat.requestPermissions(this, missing.toTypedArray(), 1001)
    }

    private fun isDefaultSmsApp(): Boolean = Telephony.Sms.getDefaultSmsPackage(this) == packageName

    private fun requestDefaultSmsRole() {
        if (isDefaultSmsApp()) {
            requestSmsPermissions()
            refreshStatus()
            return
        }

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
            val roleManager = getSystemService(RoleManager::class.java)
            if (roleManager.isRoleAvailable(RoleManager.ROLE_SMS)) {
                smsRoleLauncher.launch(roleManager.createRequestRoleIntent(RoleManager.ROLE_SMS))
            } else {
                Toast.makeText(this, "Le rôle SMS n’est pas disponible sur cet appareil.", Toast.LENGTH_LONG).show()
            }
        } else {
            val intent = Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT)
                .putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, packageName)
            smsRoleLauncher.launch(intent)
        }
    }

    override fun onResume() {
        super.onResume()
        if (::status.isInitialized) refreshStatus()
    }

    private fun refreshStatus() {
        val signedIn = FirebaseAuth.getInstance().currentUser?.email ?: "non connecté"
        val defaultSms = if (isDefaultSmsApp()) "OUI" else "NON"
        status.text = buildString {
            appendLine("Téléphone : ${DeviceId.get(this@MainActivity)}")
            appendLine("Compte admin : $signedIn")
            appendLine("Application SMS par défaut : $defaultSms")
            append("SMS en attente de synchronisation : ${PendingSmsStore.count(this@MainActivity)}")
        }
    }
}
