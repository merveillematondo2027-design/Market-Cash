package com.marketcash.admin

import android.app.role.RoleManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Telephony
import android.text.InputType
import android.view.Gravity
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
    private var email: EditText? = null
    private var password: EditText? = null

    private val smsRoleLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        refreshStatus()
        if (isDefaultSmsApp()) {
            requestSmsPermissions()
            Toast.makeText(this, "Market-Cash Admin est maintenant l’application SMS par défaut.", Toast.LENGTH_LONG).show()
        } else {
            Toast.makeText(this, "Android n’a pas encore confirmé le rôle SMS pour Market-Cash Admin.", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        FirebaseRuntime.ensure(this)
        buildUi()

        if (isDefaultSmsApp()) {
            requestSmsPermissions()
            PendingSmsStore.flush(this) { refreshStatus() }
        }
    }

    private fun buildUi() {
        if (FirebaseAuth.getInstance().currentUser == null) {
            buildLoginUi()
        } else {
            buildDashboardUi()
        }
        refreshStatus()
    }

    private fun baseRoot(): LinearLayout {
        val pad = (20 * resources.displayMetrics.density).toInt()
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }
    }

    private fun buildLoginUi() {
        val pad = (20 * resources.displayMetrics.density).toInt()
        val root = baseRoot()

        root.addView(TextView(this).apply {
            text = "Market-Cash Admin"
            textSize = 26f
        })
        root.addView(TextView(this).apply {
            text = "Contrôle des paiements"
            textSize = 17f
            setPadding(0, 0, 0, pad / 2)
        })

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
            text = "CONNECTER L’ADMINISTRATEUR"
            setOnClickListener { signIn() }
        }
        val separator = TextView(this).apply {
            text = "OU"
            textSize = 12f
            gravity = Gravity.CENTER
            setPadding(0, pad / 2, 0, pad / 2)
        }
        val googleLogin = Button(this).apply {
            text = "CONTINUER AVEC GOOGLE"
            setOnClickListener { signInWithGoogle() }
        }
        val smsRole = Button(this).apply {
            text = "DÉFINIR MARKET-CASH COMME APPLICATION SMS"
            setOnClickListener { requestDefaultSmsRole() }
        }

        root.addView(status)
        root.addView(email, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        root.addView(password, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        root.addView(login)
        root.addView(separator)
        root.addView(googleLogin)
        root.addView(smsRole)

        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun buildDashboardUi() {
        val pad = (20 * resources.displayMetrics.density).toInt()
        val root = baseRoot()
        email = null
        password = null

        root.addView(TextView(this).apply {
            text = "Market-Cash Admin"
            textSize = 26f
        })
        root.addView(TextView(this).apply {
            text = "Tableau de bord · Contrôle des paiements"
            textSize = 17f
            setPadding(0, 0, 0, pad / 2)
        })

        status = TextView(this).apply {
            textSize = 14f
            setPadding(0, pad / 2, 0, pad)
        }
        root.addView(status)

        root.addView(sectionTitle("RÉCEPTION & SYNCHRONISATION"))
        root.addView(Button(this).apply {
            text = "IMPORTER LES SMS DE PAIEMENT EXISTANTS"
            setOnClickListener { importExistingPayments() }
        })
        root.addView(Button(this).apply {
            text = "SYNCHRONISER LES SMS EN ATTENTE"
            setOnClickListener { PendingSmsStore.flush(this@MainActivity) { refreshStatus() } }
        })
        root.addView(Button(this).apply {
            text = if (isDefaultSmsApp()) "APPLICATION SMS : ACTIVE" else "ACTIVER MARKET-CASH COMME APPLICATION SMS"
            setOnClickListener { requestDefaultSmsRole() }
        })

        root.addView(sectionTitle("CONTRÔLE DES PAIEMENTS"))
        root.addView(infoCard("Paiements reçus", "Les SMS M-Pesa, Airtel Money et Orange Money reçus sur ce téléphone sont analysés puis synchronisés vers Market-Cash."))
        root.addView(infoCard("Rapprochement", "Market-Cash rapproche automatiquement montant, référence, numéro et heure avec les demandes de paiement."))
        root.addView(infoCard("À vérifier", "Les paiements non rapprochés ou ambigus restent en attente de vérification administrateur."))

        root.addView(sectionTitle("TÉLÉPHONE ADMIN"))
        root.addView(Button(this).apply {
            text = "ACTUALISER L’ÉTAT"
            setOnClickListener {
                refreshStatus()
                Toast.makeText(this@MainActivity, "État actualisé.", Toast.LENGTH_SHORT).show()
            }
        })
        root.addView(Button(this).apply {
            text = "DÉCONNECTER CE TÉLÉPHONE"
            setOnClickListener {
                FirebaseAuth.getInstance().signOut()
                buildUi()
            }
        })

        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun sectionTitle(textValue: String): TextView = TextView(this).apply {
        val pad = (16 * resources.displayMetrics.density).toInt()
        text = textValue
        textSize = 14f
        setPadding(0, pad, 0, pad / 3)
    }

    private fun infoCard(title: String, description: String): TextView = TextView(this).apply {
        val pad = (12 * resources.displayMetrics.density).toInt()
        text = "$title\n$description"
        textSize = 15f
        setPadding(pad, pad, pad, pad)
    }

    private fun signIn() {
        val mail = email?.text?.toString()?.trim().orEmpty()
        val pass = password?.text?.toString().orEmpty()
        if (mail.isBlank() || pass.isBlank()) {
            Toast.makeText(this, "E-mail et mot de passe requis.", Toast.LENGTH_SHORT).show()
            return
        }
        FirebaseAuth.getInstance().signInWithEmailAndPassword(mail, pass)
            .addOnSuccessListener { onAdminSignedIn() }
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
        buildUi()
        PendingSmsStore.flush(this) { refreshStatus() }
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

    private fun isDefaultSmsApp(): Boolean {
        val packageMatch = Telephony.Sms.getDefaultSmsPackage(this) == packageName
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val roleManager = getSystemService(RoleManager::class.java)
            val roleHeld = roleManager?.isRoleAvailable(RoleManager.ROLE_SMS) == true &&
                roleManager.isRoleHeld(RoleManager.ROLE_SMS)
            return roleHeld || packageMatch
        }
        return packageMatch
    }

    private fun requestDefaultSmsRole() {
        if (isDefaultSmsApp()) {
            requestSmsPermissions()
            refreshStatus()
            Toast.makeText(this, "Market-Cash Admin est déjà l’application SMS par défaut.", Toast.LENGTH_SHORT).show()
            return
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
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
        if (::status.isInitialized) {
            refreshStatus()
            if (isDefaultSmsApp()) requestSmsPermissions()
        }
    }

    private fun refreshStatus() {
        if (!::status.isInitialized) return
        val signedIn = FirebaseAuth.getInstance().currentUser?.email ?: "non connecté"
        val defaultSms = if (isDefaultSmsApp()) "OUI" else "NON"
        val defaultPackage = Telephony.Sms.getDefaultSmsPackage(this) ?: "aucune"
        status.text = buildString {
            appendLine("Téléphone : ${DeviceId.get(this@MainActivity)}")
            appendLine("Compte admin : $signedIn")
            appendLine("Application SMS par défaut : $defaultSms")
            appendLine("Package SMS Android : $defaultPackage")
            append("SMS en attente de synchronisation : ${PendingSmsStore.count(this@MainActivity)}")
        }
    }
}
