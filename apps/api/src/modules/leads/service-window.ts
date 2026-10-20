/**
 * Janela de atendimento do WhatsApp: a empresa só pode enviar mensagem livre
 * até 24 horas depois da última mensagem do cliente.
 */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ServiceWindow = { open: boolean; closesAt: Date | null };

export function getServiceWindow(lastInboundAt: Date | null, now: Date = new Date()): ServiceWindow {
  if (!lastInboundAt) return { open: false, closesAt: null };
  const closesAt = new Date(lastInboundAt.getTime() + SERVICE_WINDOW_MS);
  return { open: now.getTime() < closesAt.getTime(), closesAt };
}
