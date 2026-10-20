import { describe, expect, it } from 'vitest';
import {
  handleInput,
  renderStep,
  replyId,
  startConversation,
  type BotInput,
  type BotResult,
  type BotState,
} from '../modules/bot/bot-engine';
import {
  END_MESSAGES,
  FLOW,
  questionTitle,
  STEP_KEYS,
  type BotContext,
  type StepKey,
} from '../modules/bot/qualification-flow';

const reply = (step: StepKey, option: string): BotInput => ({ kind: 'reply', id: replyId(step, option) });
const text = (value: string): BotInput => ({ kind: 'text', text: value });

function run(inputs: BotInput[]): { results: BotResult[]; last: BotResult } {
  let state: BotState = startConversation().state;
  const results: BotResult[] = [];
  for (const input of inputs) {
    const result = handleInput(state, input);
    results.push(result);
    state = result.state;
  }
  return { results, last: results[results.length - 1] };
}

const SLOTS = [
  { id: '2026-10-22T12:00:00.000Z', label: 'Qui, 22/10 às 9h' },
  { id: '2026-10-22T17:00:00.000Z', label: 'Qui, 22/10 às 14h' },
  { id: '2026-10-23T12:00:00.000Z', label: 'Sex, 23/10 às 9h' },
];

const FULL_PATH: BotInput[] = [
  reply('greeting', 'accept'),
  reply('goal', 'live_first'),
  reply('search_stage', 'want_visit'),
  reply('interest', 'floor_plans'),
  reply('payment', 'own_funds'),
  reply('timeline', 'up_to_30d'),
  reply('visit', 'yes'),
];

describe('início', () => {
  it('apresenta a CB Engenharia com aviso de uso dos dados', () => {
    const message = startConversation().messages[0];
    expect(message.type).toBe('buttons');
    expect(message.body).toContain('CB Engenharia');
    expect(message.body).toContain('LGPD');
  });
});

describe('as 6 perguntas', () => {
  it('seguem a ordem combinada, com o texto exato', () => {
    const { results } = run(FULL_PATH.slice(0, 6));
    const questions = results.map((r) => r.messages[0].body);
    expect(questions).toEqual([
      'Você está buscando um apartamento para morar ou para investir?',
      'Em que etapa da busca você está?',
      'O que você gostaria de conhecer primeiro sobre o empreendimento?',
      'Como você pretende pagar?',
      'Em quanto tempo pretende dar o próximo passo na compra?',
      'Obrigado pelas respostas! 🙌 Vamos agendar uma visita?',
    ]);
  });

  it('as 5 primeiras são listas e a da visita é botão', () => {
    const { results } = run(FULL_PATH.slice(0, 6));
    expect(results.map((r) => r.messages[0].type)).toEqual(['list', 'list', 'list', 'list', 'list', 'buttons']);
  });

  it('opções da pergunta 1', () => {
    expect(FLOW.goal.options({ answers: {} }).map((o) => o.label)).toEqual([
      'Morar (primeiro imóvel)',
      'Morar (mudança)',
      'Investir',
      'Ainda estou avaliando',
    ]);
  });

  it('financiamento mostra o texto completo na descrição da linha', () => {
    const message = renderStep('payment', { answers: {} });
    if (message.type !== 'list') throw new Error('esperava lista');
    const simulated = message.rows.find((r) => r.id === 'payment:financing_simulated');
    expect(simulated).toEqual({
      id: 'payment:financing_simulated',
      title: 'Financiar (já simulei)',
      description: 'Entrada + financiamento, já fiz simulação',
    });
    expect(message.rows.at(-1)?.title).toBe('Falar com corretor');
  });

  it('percorre o fluxo inteiro e grava cada resposta', () => {
    const { results, last } = run(FULL_PATH);
    expect(results.map((r) => r.answer?.questionKey)).toEqual(STEP_KEYS.filter((k) => k !== 'visit_slot'));
    expect(last.state.step).toBe('visit_slot');

    const withSlots: BotState = { ...last.state, context: { ...last.state.context, slots: SLOTS } };
    const booked = handleInput(withSlots, reply('visit_slot', SLOTS[1].id));
    expect(booked.status).toBe('COMPLETED');
    expect(booked.answer?.answerKey).toBe(SLOTS[1].id);
  });

  it('"Não" na visita conclui sem oferecer horários', () => {
    const { last } = run([...FULL_PATH.slice(0, -1), reply('visit', 'no')]);
    expect(last.status).toBe('COMPLETED');
    expect(last.messages[0]).toEqual({ type: 'text', body: END_MESSAGES.visitNo });
  });
});

describe('passo de horário da visita', () => {
  const atSlotStep = (): BotState => ({ step: 'visit_slot', retryCount: 0, context: { answers: { visit: 'yes' }, slots: SLOTS } });

  it('lista os horários, "Outro horário" e "Falar com corretor"', () => {
    const message = renderStep('visit_slot', atSlotStep().context);
    if (message.type !== 'list') throw new Error('esperava lista');
    expect(message.rows.map((r) => r.title)).toEqual([...SLOTS.map((s) => s.label), 'Outro horário', 'Falar com corretor']);
  });

  it('"Outro horário" conclui avisando que o corretor vai combinar', () => {
    const result = handleInput(atSlotStep(), reply('visit_slot', 'other'));
    expect(result.messages[0]).toEqual({ type: 'text', body: END_MESSAGES.visitOther });
  });

  it('horário que não foi oferecido não é aceito', () => {
    expect(handleInput(atSlotStep(), reply('visit_slot', '2030-01-01T12:00:00.000Z')).state.retryCount).toBe(1);
  });
});

describe('respostas inválidas', () => {
  it('na primeira, repete a pergunta com aviso', () => {
    const { last } = run([reply('greeting', 'accept'), text('bom dia')]);
    expect(last.state).toMatchObject({ step: 'goal', retryCount: 1 });
    expect(last.messages[0].body).toMatch(/^Não entendi/);
  });

  it('na segunda, grava "Sem resposta" e segue', () => {
    const { last } = run([reply('greeting', 'accept'), text('oi'), { kind: 'other' }]);
    expect(last.answer).toEqual({ questionKey: 'goal', answerKey: 'no_answer', answerLabel: 'Sem resposta' });
    expect(last.state.step).toBe('search_stage');
  });

  it('botão de pergunta anterior não vale como resposta', () => {
    const { last } = run([reply('greeting', 'accept'), reply('goal', 'invest'), reply('goal', 'live_move')]);
    expect(last.state).toMatchObject({ step: 'search_stage', retryCount: 1 });
  });

  it('aceita a opção digitada por extenso, sem acento', () => {
    const { last } = run([reply('greeting', 'accept'), text('investir')]);
    expect(last.answer?.answerKey).toBe('invest');
    const { last: other } = run([reply('greeting', 'accept'), reply('goal', 'invest'), text('ja quero visitar')]);
    expect(other.answer?.answerKey).toBe('want_visit');
  });

  it('na saudação, duas respostas inválidas encaminham para um corretor', () => {
    expect(run([text('qual o valor?'), text('?')]).last.status).toBe('HANDED_OFF');
  });
});

describe('saídas do fluxo', () => {
  it('"Agora não" na saudação encerra sem perguntas', () => {
    expect(run([reply('greeting', 'decline')]).last.status).toBe('DECLINED');
  });

  it('"Falar com corretor" encaminha em qualquer passo', () => {
    const { last } = run([reply('greeting', 'accept'), reply('goal', 'invest'), reply('search_stage', 'handoff')]);
    expect(last.status).toBe('HANDED_OFF');
  });

  it.each(['quero falar com um corretor', 'tem atendente?'])('texto "%s" encaminha', (value) => {
    expect(run([reply('greeting', 'accept'), text(value)]).last.status).toBe('HANDED_OFF');
  });
});

describe('títulos no painel', () => {
  it('perguntas novas e antigas têm título legível', () => {
    expect(questionTitle('payment')).toBe('Forma de pagamento');
    expect(questionTitle('region')).toBe('Região');
    expect(questionTitle('qualquer_coisa')).toBe('qualquer_coisa');
  });
});

describe('limites do WhatsApp', () => {
  const eightSlots = Array.from({ length: 8 }, (_, i) => ({ id: `2026-10-2${i}T15:30:00.000Z`, label: 'Sáb, 24/10 às 12h30' }));
  const contexts: BotContext[] = [{ answers: {} }, { answers: {}, slots: eightSlots }];

  it.each(STEP_KEYS.flatMap((step) => contexts.map((ctx) => [step, ctx] as const)))('passo %s respeita os limites', (step, ctx) => {
    const message = renderStep(step, ctx, 'Não entendi 😅 Escolha uma das opções abaixo, por favor.');
    expect(message.body.length).toBeLessThanOrEqual(1024);
    if (message.type === 'buttons') {
      expect(message.buttons.length).toBeLessThanOrEqual(3);
      for (const b of message.buttons) expect(b.title.length).toBeLessThanOrEqual(20);
    }
    if (message.type === 'list') {
      expect(message.rows.length).toBeLessThanOrEqual(10);
      for (const r of message.rows) {
        expect(r.title.length).toBeLessThanOrEqual(24);
        expect((r.description ?? '').length).toBeLessThanOrEqual(72);
        expect(r.id.length).toBeLessThanOrEqual(200);
      }
    }
  });

  it('ids das opções são únicos em cada passo', () => {
    for (const step of STEP_KEYS) {
      if (step === 'visit_slot') continue;
      const ids = FLOW[step].options({ answers: {} }).map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain('handoff');
      expect(ids).not.toContain('no_answer');
    }
  });
});
