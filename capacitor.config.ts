import type { CapacitorConfig } from "@capacitor/cli";

// appId INCHANGÉ volontairement (com.livroto.bunia) : c'est l'identifiant de
// package Android/iOS — le changer casserait la continuité de mise à jour si
// l'app a déjà été publiée en store. À changer uniquement sur demande explicite.
const config: CapacitorConfig = {
  appId: "com.livroto.bunia",
  appName: "JuntoxShop",
  webDir: ".output/public",

  // Mode remote : charge directement depuis le domaine personnalisé du frontend.
  // Toutes les mises à jour déployées sur Railway sont instantanément disponibles dans l'app.
  server: {
    url: "https://shop.juntoxrdc.com",
    cleartext: false,
    androidScheme: "https",
  },

  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },

  ios: {
    scheme: "JuntoxShop",
    contentInset: "automatic",
    scrollEnabled: true,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: "#123F6E",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#123F6E",
    },
    App: {
      launchUrl: "https://shop.juntoxrdc.com",
    },
  },
};

export default config;
