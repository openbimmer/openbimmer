const { withAndroidManifest } = require('expo/config-plugins');

const LOCATION = ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'];

module.exports = function withSingleLocationPermission(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const legacy = manifest['uses-permission-sdk-23'];
    if (Array.isArray(legacy)) {
      manifest['uses-permission-sdk-23'] = legacy.filter((p) => !LOCATION.includes(p.$['android:name']));
    }
    return mod;
  });
};
