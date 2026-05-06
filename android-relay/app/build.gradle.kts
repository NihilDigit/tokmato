plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.google.services)
}

val relayVersionCode = (project.findProperty("relayVersionCode") as String?)?.toInt() ?: 1
val relayVersionName = (project.findProperty("relayVersionName") as String?) ?: "0.1"
val relayApiBase = (project.findProperty("relayApiBase") as String?) ?: "https://tokmato.nihildigit.dev"

val releaseStoreFile = project.findProperty("RELEASE_STORE_FILE") as String?
val releaseStorePassword = project.findProperty("RELEASE_STORE_PASSWORD") as String?
val releaseKeyAlias = project.findProperty("RELEASE_KEY_ALIAS") as String?
val releaseKeyPassword = project.findProperty("RELEASE_KEY_PASSWORD") as String?

android {
    namespace = "dev.nihildigit.tokmato"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.nihildigit.tokmato"
        minSdk = 26
        targetSdk = 35
        versionCode = relayVersionCode
        versionName = relayVersionName
        vectorDrawables { useSupportLibrary = true }

        buildConfigField("String", "API_BASE", "\"$relayApiBase\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    signingConfigs {
        if (releaseStoreFile != null) {
            create("release") {
                storeFile = file(releaseStoreFile)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (releaseStoreFile != null) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        debug {
            isDebuggable = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources.excludes += setOf(
            "/META-INF/{AL2.0,LGPL2.1}",
            "/META-INF/DEPENDENCIES",
            "/META-INF/LICENSE",
            "/META-INF/LICENSE.txt",
            "/META-INF/NOTICE",
            "/META-INF/NOTICE.txt",
        )
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    // Pin fragment to a version that satisfies the
    // InvalidFragmentVersionForActivityResult lint check. Transitive
    // resolution otherwise picks up an older fragment via core/activity
    // metadata and lint -Werror trips on every release build.
    implementation(libs.androidx.fragment.ktx)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
}
