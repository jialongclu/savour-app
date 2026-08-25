module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Must stay last: Reanimated 4 runs its worklet transform through this.
    plugins: ['react-native-worklets/plugin'],
  };
};
