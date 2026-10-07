#!/bin/zsh
set -e
cd "$(dirname "$0")/.."
export ANDROID_HOME=${ANDROID_HOME:-$HOME/Library/Android/sdk}
CI=1 bunx expo prebuild --platform android --no-install
P=credentials/keystore.properties
cd android
if [[ -f "../$P" ]]; then
  SF=$(grep storeFile "../$P" | cut -d= -f2); SP=$(grep storePassword "../$P" | cut -d= -f2)
  KA=$(grep keyAlias "../$P" | cut -d= -f2); KP=$(grep keyPassword "../$P" | cut -d= -f2)
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a -Pandroid.injected.signing.store.file="$SF" -Pandroid.injected.signing.store.password="$SP" \
    -Pandroid.injected.signing.key.alias="$KA" -Pandroid.injected.signing.key.password="$KP"
else
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
fi
mkdir -p ../build
cp app/build/outputs/apk/release/app-release.apk ../build/OpenBimmer.apk
echo "APK: build/OpenBimmer.apk"
