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
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider

class MainActivity : ComponentActivity() {
    private lateinit var status: TextView
    private var email: EditText? = null
    private var password: EditText? = null
    private lateinit var googleSignInClient: GoogleSignInClient

    private val smsRoleLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        refreshStatus()
        if (isDefaultSmsApp()) {
            requestSmsPermissions()
            Toast.makeText(this, "Market-Cash Admin est maintenant l’application SMS par défaut.", Toast.LENGTH_LONG).show()
        } else Toast.makeText(this, "Android n’a pas encore confirmé le rôle SMS pour Market-Cash Admin.", Toast.LENGTH_LONG).show()
    }

    private val googleLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(com.google.android.gms.common.api.ApiException::class.java)
            val token = account.idToken
            if (token.isNullOrBlank()) {
                Toast.makeText(this, "Google n’a pas fourni de jeton d’authentification. Vérifiez la configuration Firebase OAuth.", Toast.LENGTH_LONG).show()
                return@registerForActivityResult
            }
            FirebaseAuth.getInstance().signInWithCredential(GoogleAuthProvider.getCredential(token, null))
                .addOnSuccessListener { onAdminSignedIn() }
                .addOnFailureListener { Toast.makeText(this, it.localizedMessage ?: "Connexion Firebase avec Google impossible.", Toast.LENGTH_LONG).show() }
        } catch (e: Exception) {
            Toast.makeText(this, "Connexion Google impossible : ${e.localizedMessage ?: e.javaClass.simpleName}", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        FirebaseRuntime.ensure(this)
        val clientId = resources.getIdentifier("default_web_client_id", "string", packageName)
        if (clientId != 0) {
            val options = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(getString(clientId)).requestEmail().build()
            googleSignInClient = GoogleSignIn.getClient(this, options)
        }
        buildUi()
        if (isDefaultSmsApp()) { requestSmsPermissions(); PendingSmsStore.flush(this) { refreshStatus() } }
    }

    private fun baseRoot() = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; val p=(20*resources.displayMetrics.density).toInt(); setPadding(p,p,p,p) }
    private fun buildUi() { if (FirebaseAuth.getInstance().currentUser == null) buildLoginUi() else buildDashboardUi(); refreshStatus() }

    private fun buildLoginUi() {
        val p=(20*resources.displayMetrics.density).toInt(); val root=baseRoot()
        root.addView(TextView(this).apply{text="Market-Cash Admin";textSize=26f})
        root.addView(TextView(this).apply{text="Contrôle des paiements";textSize=17f})
        status=TextView(this).apply{textSize=14f;setPadding(0,p/2,0,p)}
        email=EditText(this).apply{hint="E-mail administrateur Market-Cash";inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS}
        password=EditText(this).apply{hint="Mot de passe";inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD}
        root.addView(status);root.addView(email,ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT);root.addView(password,ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.WRAP_CONTENT)
        root.addView(Button(this).apply{text="CONNECTER L’ADMINISTRATEUR";setOnClickListener{signIn()}})
        root.addView(TextView(this).apply{text="OU";gravity=Gravity.CENTER;setPadding(0,p/2,0,p/2)})
        root.addView(Button(this).apply{text="CONTINUER AVEC GOOGLE";setOnClickListener{signInWithGoogle()}})
        root.addView(Button(this).apply{text="DÉFINIR MARKET-CASH COMME APPLICATION SMS";setOnClickListener{requestDefaultSmsRole()}})
        setContentView(ScrollView(this).apply{addView(root)})
    }

    private fun buildDashboardUi() {
        val root=baseRoot(); email=null;password=null
        root.addView(TextView(this).apply{text="Market-Cash Admin";textSize=26f});root.addView(TextView(this).apply{text="Tableau de bord · Contrôle des paiements";textSize=17f})
        status=TextView(this).apply{textSize=14f};root.addView(status)
        root.addView(Button(this).apply{text="IMPORTER LES SMS DE PAIEMENT EXISTANTS";setOnClickListener{importExistingPayments()}})
        root.addView(Button(this).apply{text="SYNCHRONISER LES SMS EN ATTENTE";setOnClickListener{PendingSmsStore.flush(this@MainActivity){refreshStatus()}}})
        root.addView(Button(this).apply{text=if(isDefaultSmsApp())"APPLICATION SMS : ACTIVE" else "ACTIVER MARKET-CASH COMME APPLICATION SMS";setOnClickListener{requestDefaultSmsRole()}})
        root.addView(TextView(this).apply{text="CONTRÔLE DES PAIEMENTS\n\nLes SMS M-Pesa, Airtel Money et Orange Money reçus sont analysés et synchronisés vers Market-Cash.\n\nRapprochement automatique : montant, référence, numéro et heure.\n\nLes paiements ambigus restent à vérifier.";textSize=15f})
        root.addView(Button(this).apply{text="ACTUALISER L’ÉTAT";setOnClickListener{refreshStatus()}})
        root.addView(Button(this).apply{text="DÉCONNECTER CE TÉLÉPHONE";setOnClickListener{FirebaseAuth.getInstance().signOut();buildUi()}})
        setContentView(ScrollView(this).apply{addView(root)})
    }

    private fun signIn() {
        val m=email?.text?.toString()?.trim().orEmpty();val p=password?.text?.toString().orEmpty()
        if(m.isBlank()||p.isBlank()){Toast.makeText(this,"E-mail et mot de passe requis.",Toast.LENGTH_SHORT).show();return}
        FirebaseAuth.getInstance().signInWithEmailAndPassword(m,p).addOnSuccessListener{onAdminSignedIn()}.addOnFailureListener{Toast.makeText(this,it.localizedMessage?:"Connexion impossible.",Toast.LENGTH_LONG).show()}
    }

    private fun signInWithGoogle() {
        if(!::googleSignInClient.isInitialized){Toast.makeText(this,"Configuration Google OAuth absente du google-services.json. Téléchargez la configuration Firebase Android mise à jour.",Toast.LENGTH_LONG).show();return}
        googleSignInClient.signOut().addOnCompleteListener { googleLauncher.launch(googleSignInClient.signInIntent) }
    }

    private fun onAdminSignedIn(){val a=FirebaseAuth.getInstance().currentUser?.email?:"compte Google";Toast.makeText(this,"Connecté à Market-Cash : $a",Toast.LENGTH_SHORT).show();buildUi();PendingSmsStore.flush(this){refreshStatus()}}

    private fun importExistingPayments(){if(!isDefaultSmsApp()){requestDefaultSmsRole();return};if(ContextCompat.checkSelfPermission(this,android.Manifest.permission.READ_SMS)!=PackageManager.PERMISSION_GRANTED){requestSmsPermissions();return};if(FirebaseAuth.getInstance().currentUser==null){Toast.makeText(this,"Connectez d’abord le compte administrateur.",Toast.LENGTH_LONG).show();return};SmsInboxImporter.importRecentPayments(this){i,f->Toast.makeText(this,"$i SMS synchronisés${if(f>0)", $f en attente" else ""}.",Toast.LENGTH_LONG).show();refreshStatus()}}
    private fun requestSmsPermissions(){if(!isDefaultSmsApp())return;val ps=arrayOf(android.Manifest.permission.RECEIVE_SMS,android.Manifest.permission.READ_SMS,android.Manifest.permission.SEND_SMS);val m=ps.filter{ContextCompat.checkSelfPermission(this,it)!=PackageManager.PERMISSION_GRANTED};if(m.isNotEmpty())ActivityCompat.requestPermissions(this,m.toTypedArray(),1001)}
    private fun isDefaultSmsApp():Boolean{val p=Telephony.Sms.getDefaultSmsPackage(this)==packageName;if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.Q){val r=getSystemService(RoleManager::class.java);return (r?.isRoleAvailable(RoleManager.ROLE_SMS)==true&&r.isRoleHeld(RoleManager.ROLE_SMS))||p};return p}
    private fun requestDefaultSmsRole(){if(isDefaultSmsApp()){requestSmsPermissions();refreshStatus();return};if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.Q){val r=getSystemService(RoleManager::class.java);if(r.isRoleAvailable(RoleManager.ROLE_SMS))smsRoleLauncher.launch(r.createRequestRoleIntent(RoleManager.ROLE_SMS))}else smsRoleLauncher.launch(Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT).putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME,packageName))}
    override fun onResume(){super.onResume();if(::status.isInitialized){refreshStatus();if(isDefaultSmsApp())requestSmsPermissions()}}
    private fun refreshStatus(){if(!::status.isInitialized)return;val u=FirebaseAuth.getInstance().currentUser?.email?:"non connecté";status.text="Téléphone : ${DeviceId.get(this)}\nCompte admin : $u\nApplication SMS par défaut : ${if(isDefaultSmsApp())"OUI" else "NON"}\nPackage SMS Android : ${Telephony.Sms.getDefaultSmsPackage(this)?:"aucune"}\nSMS en attente de synchronisation : ${PendingSmsStore.count(this)}"}
}
