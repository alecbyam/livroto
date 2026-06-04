import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.livroto.bunia",
  appName: "Livroto",
  webDir: ".vercel/output/static",

  // Mode remote : charge directement depuis livroto.vercel.app
  // Toutes les mises à jour Vercel sont instantanément disponibles dans l'app
  server: {
    url: "https://livroto.vercel.app",
    cleartext: false,
    androidScheme: "https",
  },

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  ios: {
    scheme: "Livroto",
    contentInset: "automatic",
    scrollEnabled: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: "#0f3d2e",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0f3d2e",
    },
    App: {
      launchUrl: "https://livroto.vercel.app",
    },
  },
};

export default config;
