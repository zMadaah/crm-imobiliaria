import { describe, expect, it } from 'vitest';
import { decideHumanReplyEffects } from '../modules/leads/human-reply';
import { leadAccessWhere } from '../modules/leads/lead-access';
import { getServiceWindow, SERVICE_WINDOW_MS } from '../modules/leads/service-window';

describe('leadAccessWhere', () => {
  it('dono vê todos', () => {
    expect(leadAccessWhere({ id: 'dono', role: 'OWNER', active: true })).toEqual({});
  });

  it('corretor vê só os leads atribuídos a ele', () => {
    expect(leadAccessWhere({ id: 'c1', role: 'BROKER', active: true })).toEqual({ brokerId: 'c1' });
  });

  it('corretor nunca recebe filtro de outro corretor', () => {
    const c1 = leadAccessWhere({ id: 'c1', role: 'BROKER' });
    const c2 = leadAccessWhere({ id: 'c2', role: 'BROKER' });
    expect(c1).not.toEqual(c2);
  });

  it.each(['OWNER', 'BROKER'] as const)('usuário inativo (%s) não vê nada', (role) => {
    expect(leadAccessWhere({ id: 'x', role, active: false })).toEqual({ id: { in: [] } });
  });
});

describe('getServiceWindow', () => {
  const lastInbound = new Date('2026-09-30T12:00:00.000Z');
  const at = (ms: number) => new Date(lastInbound.getTime() + ms);

  it('aberta logo depois da mensagem do cliente', () => {
    expect(getServiceWindow(lastInbound, at(60_000)).open).toBe(true);
  });

  it('aberta com 23h59', () => {
    expect(getServiceWindow(lastInbound, at(SERVICE_WINDOW_MS - 60_000)).open).toBe(true);
  });

  it('fechada exatamente com 24h00', () => {
    expect(getServiceWindow(lastInbound, at(SERVICE_WINDOW_MS)).open).toBe(false);
  });

  it('fechada depois de 24 horas', () => {
    expect(getServiceWindow(lastInbound, at(SERVICE_WINDOW_MS + 1)).open).toBe(false);
  });

  it('fechada quando o cliente nunca escreveu', () => {
    expect(getServiceWindow(null)).toEqual({ open: false, closesAt: null });
  });

  it('informa quando fecha', () => {
    expect(getServiceWindow(lastInbound, at(0)).closesAt?.toISOString()).toBe('2026-10-01T12:00:00.000Z');
  });
});

describe('decideHumanReplyEffects', () => {
  const broker = { id: 'c1', role: 'BROKER' as const };
  const owner = { id: 'dono', role: 'OWNER' as const };

  it('corretor responde no meio do bot: para o bot, vai para atendimento, fica com o lead e recalcula', () => {
    expect(decideHumanReplyEffects({ botStatus: 'ACTIVE', stage: 'NEW', brokerId: null, replier: broker })).toEqual({
      stopBot: true,
      newStage: 'IN_SERVICE',
      assign: 'replier',
      rescore: true,
    });
  });

  it('dono responde lead sem corretor: distribui pelo rodízio', () => {
    const effects = decideHumanReplyEffects({ botStatus: 'ACTIVE', stage: 'NEW', brokerId: null, replier: owner });
    expect(effects.assign).toBe('rotation');
  });

  it('lead qualificado recebendo a primeira resposta vai para atendimento, sem mexer no bot', () => {
    expect(
      decideHumanReplyEffects({ botStatus: 'COMPLETED', stage: 'QUALIFIED', brokerId: 'c1', replier: broker }),
    ).toEqual({ stopBot: false, newStage: 'IN_SERVICE', assign: null, rescore: false });
  });

  it.each(['IN_SERVICE', 'VISIT_SCHEDULED', 'NEGOTIATION', 'WON', 'LOST'] as const)(
    'etapa %s não muda quando alguém responde',
    (stage) => {
      expect(decideHumanReplyEffects({ botStatus: 'HANDED_OFF', stage, brokerId: 'c1', replier: broker }).newStage).toBeNull();
    },
  );

  it('lead que já tem corretor não é reatribuído', () => {
    expect(decideHumanReplyEffects({ botStatus: null, stage: 'IN_SERVICE', brokerId: 'c2', replier: owner }).assign).toBeNull();
  });

  it.each(['COMPLETED', 'HANDED_OFF', 'DECLINED', null] as const)('bot %s não é interrompido', (botStatus) => {
    expect(decideHumanReplyEffects({ botStatus, stage: 'IN_SERVICE', brokerId: 'c1', replier: broker }).stopBot).toBe(false);
  });
});
