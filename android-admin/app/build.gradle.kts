plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
}

android {
    namespace = "com.marketcash.admin"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.marketcash.admin"
        minSdk = 26
        targetSdk = 36
        versionCode = 3
        versionName = "0.2.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // CI uses a persistent key so Google OAuth and APK updates keep the same identity.
    val ciKeystore = System.getenv("ANDROID_ADMIN_KEYSTORE_PATH")
    if (!ciKeystore.isNullOrBlank()) {
        signingConfigs.getByName("debug") {
            storeFile = file(ciKeystore)
            storeType = "PKCS12"
            storePassword = requireNotNull(System.getenv("ANDROID_ADMIN_KEYSTORE_PASSWORD"))
            keyAlias = "market-cash-admin"
            keyPassword = storePassword
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
        }
    }
}

dependencies {
    implementation("com.google.android.gms:play-services-auth:21.3.0")
    implementation(platform("com.google.firebase:firebase-bom:34.2.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-functions")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
}
