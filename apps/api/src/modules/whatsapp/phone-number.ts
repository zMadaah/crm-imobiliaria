/**
 * O bot atende um único número. Quando WHATSAPP_PHONE_NUMBER_ID está preenchido,
 * mensagens que chegam a outros números da mesma conta na Meta são ignoradas,
 * para nunca serem respondidas pelo número errado. Vazio (modo de teste) aceita todos.
 */
export function isConfiguredNumber(incomingPhoneNumberId: string | undefined, configured: string | undefined): boolean {
  if (!configured) return true;
  return incomingPhoneNumberId === configured;
}
