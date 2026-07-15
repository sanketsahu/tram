// Tram: cross-project transform caching inside Expo's real (device-bootable) Metro
// pipeline. Same deps as expo-app-54 / -b -> vendor transforms are REUSED from the
// shared ~/.tram/tstore. Only this app's own screens transform fresh.
//
// Vanilla fallback: delete this file to run stock Expo.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformerPath = '/Users/sanketsahu/projects/tram/src/tram-transformer.cjs';
config.cacheStores = [];

module.exports = config;
