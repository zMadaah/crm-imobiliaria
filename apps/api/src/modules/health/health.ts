/**
 * Diagnóstico da configuração do WhatsApp para a rota /health. Função pura.
 * Nunca devolve valores: só se cada item está preenchido.
 */
export type WhatsAppConfig = {
  WHATSAPP_DRY_RUN: boolean;
  WHATSAPP_ACCESS_TOKEN?: string;
  WHATSAPP_PHONE_NUMBER_ID?: string;
  WHATSAPP_APP_SECRET: string;
  WHATSAPP_VERIFY_TOKEN: string;
};

const PLACEHOLDERS = ['cole-o-app-secret-aqui', 'troque-este-token'];

export function whatsappStatus(config: WhatsAppConfig) {
  const filled = (value?: string) => Boolean(value && !PLACEHOLDERS.includes(value));
  const problems: string[] = [];

  if (!filled(config.WHATSAPP_APP_SECRET)) problems.push('WHATSAPP_APP_SECRET não preenchido');
  if (!filled(config.WHATSAPP_VERIFY_TOKEN)) problems.push('WHATSAPP_VERIFY_TOKEN não preenchido');
  if (!config.WHATSAPP_DRY_RUN) {
    if (!filled(config.WHATSAPP_ACCESS_TOKEN)) problems.push('WHATSAPP_ACCESS_TOKEN não preenchido');
    if (!filled(config.WHATSAPP_PHONE_NUMBER_ID)) problems.push('WHATSAPP_PHONE_NUMBER_ID não preenchido');
  }

  return {
    mode: config.WHATSAPP_DRY_RUN ? 'teste (não envia para a Meta)' : 'real',
    phoneNumberConfigured: filled(config.WHATSAPP_PHONE_NUMBER_ID),
    ready: problems.length === 0,
    problems,
  };
}
