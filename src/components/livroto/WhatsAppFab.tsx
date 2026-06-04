import { MessageCircle } from "lucide-react";
import { genericWhatsAppUrl } from "@/lib/whatsapp";

export function WhatsAppFab() {
  return (
    <a
      href={genericWhatsAppUrl()}
      target="_blank"
      rel="noreferrer"
      aria-label="WhatsApp Livroto"
      className="fixed bottom-20 right-5 md:bottom-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-[color:var(--whatsapp)] text-white shadow-lg shadow-emerald-900/30 hover:scale-105 active:scale-95 transition"
    >
      <MessageCircle className="h-7 w-7" />
    </a>
  );
}