export type AndroidRole = 'rider' | 'driver';
export type AndroidReleasePlan = {
  role: AndroidRole; applicationId: string; name: string; startPath: string;
  versionName: string; versionCode: number;
};
export const androidRelease: {
  versionName: string; versionCodeBase: number; compileSdk: number; targetSdk: number;
  minSdk: number; buildTools: string; gradleVersion: string; gradleSha256: string; origin: string;
  roles: Record<AndroidRole, { applicationId: string; name: string; startPath: string }>;
};
export function releasePlan(role: string, runNumber: string | number): AndroidReleasePlan;
export function capacitorConfig(plan: AndroidReleasePlan): {
  appId: string; appName: string; webDir: string; loggingBehavior: string;
  server: { url: string; cleartext: boolean; androidScheme: string };
  android: { allowMixedContent: boolean; webContentsDebuggingEnabled: boolean };
  plugins: Record<string, unknown>;
};
export function configureReleaseGradle(source: string, plan: AndroidReleasePlan): string;
export function configureRootGradle(source: string): string;
export function hardenManifest(xml: string): string;
