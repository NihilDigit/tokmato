module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "react" }]],
    plugins: [
      // react-native-reanimated must be last
      "react-native-reanimated/plugin",
    ],
  };
};
