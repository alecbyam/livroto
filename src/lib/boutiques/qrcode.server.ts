// Génération d'image QR côté serveur (jamais côté client : évite d'expédier
// la lib qrcode + ses dépendances dans le bundle navigateur).
import QRCode from "qrcode";

export async function genererQrCodePng(data: string): Promise<Buffer> {
  return QRCode.toBuffer(data, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 400,
  });
}
