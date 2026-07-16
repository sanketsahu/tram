// Jetplane cross-project transform cache, wired exactly the way a shipped project is
// (what `jetplane init` writes): chain to Expo's default transformer as the UPSTREAM so
// its behavior is preserved, and let jetplane own caching. This is the path that must stay
// root-independent for the cross-project cache to work — see bench/xproject-hitrate.mjs.
// In-repo we resolve the worker by relative path instead of require.resolve('jetplane/transformer').
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.transformer.upstreamTransformerPath = config.transformerPath;
config.transformerPath = path.resolve(__dirname, '../../src/jetplane-transformer.cjs');
config.cacheStores = []; // our worker owns caching; disable Metro's root-dependent store

module.exports = config;
