import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extinde app.json. În CI, BUILD_NUMBER (numărul rulării GitHub Actions)
 * devine versionCode, ca fiecare APK nou să se poată instala peste cel vechi.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const buildNumber = Number(process.env.BUILD_NUMBER ?? '1');
  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      versionCode: buildNumber,
    },
  };
};
