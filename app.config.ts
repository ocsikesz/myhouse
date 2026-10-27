import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Extinde app.json. În CI, BUILD_NUMBER (numărul rulării GitHub Actions)
 * devine versionCode, ca fiecare APK nou să se poată instala peste cel vechi.
 */
const SUPABASE_URL = 'https://seydlydmhggpvcagjibm.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNleWRseWRtaGdncHZjYWdqaWJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwODMyOTgsImV4cCI6MjEwODY1OTI5OH0.uyinkz8fUpzyu4tNyFvHWDgyXUHLMvdehbjKRzTKrdk';

export default ({ config }: ConfigContext): ExpoConfig => {
  const buildNumber = Number(process.env.BUILD_NUMBER ?? '1');
  return {
    ...(config as ExpoConfig),
    android: {
      ...config.android,
      versionCode: buildNumber,
    },
    extra: {
      ...config.extra,
      // Sincronizarea de familie (Supabase, proiectul „Brasov5b/51”). Secretele repo-ului au prioritate.
      // Cheia „anon” e publică prin design (ajunge oricum în APK) — datele sunt protejate de login + RLS.
      supabaseUrl: process.env.SUPABASE_URL || SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY,
    },
  };
};
