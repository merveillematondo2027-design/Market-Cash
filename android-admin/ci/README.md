# Internal APK signing and Google authentication

Both APK workflows restore the same PKCS12 signing key from the encrypted GitHub
repository secrets `ANDROID_ADMIN_KEYSTORE_BASE64` and
`ANDROID_ADMIN_KEYSTORE_PASSWORD`. Do not rotate these secrets casually: Android
updates and Google OAuth depend on this signing identity. The alias is
`market-cash-admin`. Only the public certificate is committed here.

In Firebase project `automarket-fintech`, select the Android application
`com.marketcash.admin` and register this certificate:

- SHA-1: `37:81:21:19:B4:DA:F9:74:7A:EA:A6:82:67:AC:B7:70:8D:67:1F:23`
- SHA-256: `1A:DE:7F:F8:08:1B:6F:B9:3E:EA:FF:7C:36:5F:51:C2:23:7E:1D:E2:9F:12:5A:26:7B:96:25:0C:A0:78:5E:80`

Enable the Google provider in Firebase Authentication. The app requests an ID
token using the web OAuth client in `google-services.json`, then exchanges it
with Firebase Auth using `GoogleAuthProvider`.

After adding fingerprints, download the updated `google-services.json` and
replace `android-admin/app/google-services.json` when its OAuth configuration
changes. Registering the certificate in Firebase is a separate required action;
committing this public certificate does not register it.

Pull requests compile with a disposable debug key and do not publish installable
artifacts. Published push/manual builds fail if the persistent signing secrets
are absent, rather than silently using a new identity.

The first persistent-key APK cannot update an APK signed with a previous
ephemeral CI debug key. Before removing that old installation, synchronize any
pending SMS because uninstalling clears the local queue. Subsequent APKs signed
with the persistent key can update this installation.

These are internal debug APKs, not Play Store release builds.
