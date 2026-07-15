// Tram: cross-project transform caching inside Expo's real (device-bootable) Metro
// pipeline, via a custom transformer worker that content-addresses by a root-independent
// key. Same module transforms ONCE and is reused across different projects.
//
// Vanilla fallback: delete this file to run stock Expo (boots fast in Expo Go).
// With this file: the FIRST bundle is slower (cold — it builds the shared ~/.tram/tstore
// cache); other same-dep projects then reuse it (warm, no re-transform).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformerPath = '/Users/sanketsahu/projects/tram/src/tram-transformer.cjs';
config.cacheStores = []; // our worker owns caching; disable Metro's root-dependent store

module.exports = config;
