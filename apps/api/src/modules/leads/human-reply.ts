import type { BotSessionStatus, LeadStage, UserRole } from '@prisma/client';

export type HumanReplyInput = {
  botStatus: BotSessionStatus | null;
  stage: LeadStage;
  brokerId: string | null;
  replier: { id: string; role: UserRole };
};

export type HumanReplyEffects = {
  /** Interrompe o bot que estava no meio do fluxo */
  stopBot: boolean;
  newStage: LeadStage | null;
  /** Quem passa a ser o corretor do lead, se ele estava sem */
  assign: 'replier' | 'rotation' | null;
  /** Calcula o score com as respostas que já existem */
  rescore: boolean;
};

const STAGES_BEFORE_SERVICE: LeadStage[] = ['NEW', 'QUALIFIED'];

/** O que acontece quando alguém da equipe responde o cliente pelo painel. Função pura. */
export function decideHumanReplyEffects(input: HumanReplyInput): HumanReplyEffects {
  const stopBot = input.botStatus === 'ACTIVE';

  let assign: HumanReplyEffects['assign'] = null;
  if (!input.brokerId) assign = input.replier.role === 'BROKER' ? 'replier' : 'rotation';

  return {
    stopBot,
    newStage: STAGES_BEFORE_SERVICE.includes(input.stage) ? 'IN_SERVICE' : null,
    assign,
    rescore: stopBot,
  };
}
