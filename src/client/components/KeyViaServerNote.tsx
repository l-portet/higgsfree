import { Server } from "lucide-react";

/** Right under a key field: this provider's key goes through the higgsfree server (`KEY_VIA_SERVER` in providers.ts). */
export function KeyViaServerNote({ id, text }: { id?: string; text: string }) {
  return (
    <p id={id} className="mt-2 flex items-start gap-2 rounded-control border border-warning/25 bg-warning/5 p-3 text-meta text-fg">
      <Server size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
      <span>{text}</span>
    </p>
  );
}
