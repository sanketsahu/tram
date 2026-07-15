// Tram: cross-project transform caching inside Expo's real (device-bootable) Metro
// pipeline. Same deps as expo-app-54 -> vendor transforms are REUSED from the shared
// ~/.tram/tstore (populated when you ran expo-app-54). Only this app's own screens are
// transformed fresh.
//
// Vanilla fallback: delete this file to run stock Expo.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformerPath = '/Users/sanketsahu/projects/tram/src/tram-transformer.cjs';
config.cacheStores = [];

module.exports = config;
