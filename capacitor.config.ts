import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.example.bybitshell",
  appName: "Bybit Shell",
  webDir: "dist",
  backgroundColor: "#0b0e11",
  plugins: {
    // Routes fetch/XHR through the native HTTP stack so Bybit calls skip browser CORS.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
