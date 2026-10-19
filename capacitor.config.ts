import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.flowreservas.flowbarber",
  appName: "FlowBarber",
  webDir: "mobile-web",
  plugins: {
    PushNotifications: {
      presentationOptions: ["banner", "sound"]
    }
  },
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
