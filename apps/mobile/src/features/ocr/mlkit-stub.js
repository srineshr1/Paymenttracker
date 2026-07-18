/**
 * Stub used when @react-native-ml-kit/text-recognition is not installed.
 * Metro resolves the real package name to this file so the app still bundles.
 */
module.exports = {
  default: {
    async recognize() {
      throw new Error("ML_KIT_UNAVAILABLE");
    },
  },
  async recognize() {
    throw new Error("ML_KIT_UNAVAILABLE");
  },
};
