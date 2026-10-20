// Tipos do payload de webhook da WhatsApp Cloud API (campo "messages").
// Só o que usamos; a Meta envia mais campos.

export interface WhatsAppWebhookPayload {
  object: string;
  entry?: WebhookEntry[];
}

export interface WebhookEntry {
  id: string;
  changes?: WebhookChange[];
}

export interface WebhookChange {
  field: string;
  value: WebhookValue;
}

export interface WebhookValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WaContact[];
  messages?: WaMessage[];
  statuses?: unknown[];
}

export interface WaContact {
  wa_id: string;
  profile?: { name?: string };
}

export interface WaMedia {
  id: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
}

/** Presente quando a conversa começou por anúncio Click-to-WhatsApp. */
export interface WaReferral {
  source_url?: string;
  source_id?: string;
  source_type?: string; // "ad" ou "post"
  headline?: string;
  body?: string;
  media_type?: string;
  ctwa_clid?: string;
}

export interface WaMessage {
  id: string;
  from: string;
  timestamp: string; // segundos Unix, em string
  type: string;
  text?: { body: string };
  image?: WaMedia;
  video?: WaMedia;
  audio?: WaMedia;
  document?: WaMedia;
  sticker?: WaMedia;
  button?: { text: string; payload?: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  referral?: WaReferral;
}
