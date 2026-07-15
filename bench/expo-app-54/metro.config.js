// Jetplane: cross-project transform caching inside Expo's real (device-bootable) Metro
// pipeline. In a published project this would be:
//     config.transformerPath = require.resolve('jetplane/transformer')
// Here (in-repo) we resolve the source relative to this file — no machine-specific paths.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.transformerPath = path.resolve(__dirname, '../../src/jetplane-transformer.cjs');
config.cacheStores = []; // our worker owns caching; disable Metro's root-dependent store

module.exports = config;
