import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.flowbarber.app",
  appName: "FlowBarber",
  webDir: "mobile-web",
  server: {
    url: "https://barberflow-citas.vercel.app",
    androidScheme: "https",
    cleartext: false
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#111111"
  }
};

export default config;
