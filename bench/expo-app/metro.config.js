// Tram: cross-project transform caching inside Expo's real (device-bootable) Metro
// pipeline, via a custom transformer worker that content-addresses by a root-independent
// key. Same module transforms ONCE and is reused across different projects.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformerPath = '/Users/sanketsahu/projects/tram/src/tram-transformer.cjs';
config.cacheStores = []; // our worker owns caching; disable Metro's root-dependent store

module.exports = config;
