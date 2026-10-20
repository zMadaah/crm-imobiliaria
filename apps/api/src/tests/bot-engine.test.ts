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
import { END_MESSAGES, FLOW, STEP_KEYS, type BotContext, type StepKey } from '../modules/bot/qualification-flow';

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
  { id: '2026-10-02T12:00:00.000Z', label: 'Sex, 02/10 às 9h' },
  { id: '2026-10-02T17:00:00.000Z', label: 'Sex, 02/10 às 14h' },
  { id: '2026-10-03T12:00:00.000Z', label: 'Sáb, 03/10 às 9h' },
];

const BUY_PATH: BotInput[] = [
  reply('greeting', 'accept'),
  reply('intent', 'buy'),
  reply('region', 'centro'),
  reply('price', '500k_1m'),
  reply('payment', 'financing_approved'),
  reply('timeline', 'up_to_3m'),
  reply('decision_maker', 'alone'),
  reply('visit', 'yes'),
];

describe('início', () => {
  it('começa com a saudação em botões, incluindo "Falar com corretor"', () => {
    const start = startConversation();
    expect(start.state.step).toBe('greeting');
    const message = start.messages[0];
    expect(message.type).toBe('buttons');
    if (message.type !== 'buttons') return;
    expect(message.body).toContain('LGPD');
    expect(message.buttons.map((b) => b.title)).toEqual(['Sim, vamos lá', 'Agora não', 'Falar com corretor']);
  });
});

describe('fluxo completo', () => {
  it('percorre a compra do início ao fim e grava cada resposta', () => {
    const { results, last } = run(BUY_PATH);

    expect(results.map((r) => r.answer?.questionKey)).toEqual(STEP_KEYS.filter((k) => k !== 'visit_slot'));
    expect(results.every((r) => r.status === 'ACTIVE')).toBe(true);
    // "Sim, quero visitar" leva ao passo de horário; os horários são preenchidos pelo serviço.
    expect(last.state.step).toBe('visit_slot');
    expect(last.state.context.answers).toMatchObject({ intent: 'buy', price: '500k_1m', visit: 'yes' });

    const withSlots: BotState = { ...last.state, context: { ...last.state.context, slots: SLOTS } };
    const booked = handleInput(withSlots, reply('visit_slot', SLOTS[1].id));
    expect(booked.status).toBe('COMPLETED');
    expect(booked.answer).toEqual({ questionKey: 'visit_slot', answerKey: SLOTS[1].id, answerLabel: SLOTS[1].label });
  });

  it('usa lista quando há mais de 2 opções', () => {
    const { results } = run(BUY_PATH.slice(0, 2));
    const regionQuestion = results[1].messages[0];
    expect(regionQuestion.type).toBe('list');
    if (regionQuestion.type !== 'list') return;
    expect(regionQuestion.rows.at(-1)?.title).toBe('Falar com corretor');
  });

  it('recusar visita também conclui, com outra mensagem', () => {
    const { last } = run([...BUY_PATH.slice(0, -1), reply('visit', 'no')]);
    expect(last.status).toBe('COMPLETED');
    expect(last.messages[0]).toEqual({ type: 'text', body: END_MESSAGES.visitNo });
  });
});

describe('passo de horário da visita', () => {
  const atSlotStep = (): BotState => ({
    step: 'visit_slot',
    retryCount: 0,
    context: { answers: { intent: 'buy', visit: 'yes' }, slots: SLOTS },
  });

  it('mostra os horários em lista, com "Outro horário" e "Falar com corretor" no fim', () => {
    const message = renderStep('visit_slot', atSlotStep().context);
    expect(message.type).toBe('list');
    if (message.type !== 'list') return;
    expect(message.rows.map((r) => r.title)).toEqual([...SLOTS.map((s) => s.label), 'Outro horário', 'Falar com corretor']);
  });

  it('"Outro horário" conclui avisando que o corretor vai combinar', () => {
    const result = handleInput(atSlotStep(), reply('visit_slot', 'other'));
    expect(result.status).toBe('COMPLETED');
    expect(result.messages[0]).toEqual({ type: 'text', body: END_MESSAGES.visitOther });
  });

  it('horário que não foi oferecido não é aceito', () => {
    const result = handleInput(atSlotStep(), reply('visit_slot', '2030-01-01T12:00:00.000Z'));
    expect(result.status).toBe('ACTIVE');
    expect(result.state.retryCount).toBe(1);
  });

  it('aceita o horário digitado por extenso', () => {
    const result = handleInput(atSlotStep(), text('sab, 03/10 as 9h'));
    expect(result.answer?.answerKey).toBe(SLOTS[2].id);
  });

  it('mantém os horários no contexto depois de uma resposta', () => {
    const result = handleInput(atSlotStep(), text('?'));
    expect(result.state.context.slots).toEqual(SLOTS);
  });

  it('"Agora não" no convite conclui sem passar pelos horários', () => {
    const state: BotState = { step: 'visit', retryCount: 0, context: { answers: { intent: 'buy' } } };
    const result = handleInput(state, reply('visit', 'no'));
    expect(result.status).toBe('COMPLETED');
    expect(result.messages[0]).toEqual({ type: 'text', body: END_MESSAGES.visitNo });
  });
});

describe('ramificação de aluguel', () => {
  it('mostra faixas de aluguel e pergunta a garantia', () => {
    const { results } = run([reply('greeting', 'accept'), reply('intent', 'rent'), reply('region', 'centro')]);
    const price = results[2].messages[0];
    expect(price.body).toContain('aluguel mensal');
    if (price.type !== 'list') throw new Error('esperava lista');
    expect(price.rows[0].title).toBe('Até R$ 1.500');

    const afterPrice = handleInput(results[2].state, reply('price', '1500_3000'));
    expect(afterPrice.messages[0].body).toContain('garantia');
  });

  it('recusa opção de compra quando a pessoa escolheu alugar', () => {
    const { last } = run([
      reply('greeting', 'accept'),
      reply('intent', 'rent'),
      reply('region', 'centro'),
      reply('price', 'over_2m'),
    ]);
    expect(last.state.step).toBe('price');
    expect(last.state.retryCount).toBe(1);
  });
});

describe('respostas inválidas', () => {
  it('na primeira, repete a pergunta com aviso', () => {
    const { last } = run([reply('greeting', 'accept'), text('bom dia, tudo bem?')]);
    expect(last.status).toBe('ACTIVE');
    expect(last.answer).toBeNull();
    expect(last.state).toMatchObject({ step: 'intent', retryCount: 1 });
    expect(last.messages[0].body).toMatch(/^Não entendi/);
  });

  it('na segunda, grava "sem resposta" e segue', () => {
    const { last } = run([reply('greeting', 'accept'), text('oi'), { kind: 'other' }]);
    expect(last.answer).toEqual({ questionKey: 'intent', answerKey: 'no_answer', answerLabel: 'Sem resposta' });
    expect(last.state).toMatchObject({ step: 'region', retryCount: 0 });
  });

  it('botão de pergunta anterior não vale como resposta', () => {
    const { last } = run([reply('greeting', 'accept'), reply('intent', 'buy'), reply('intent', 'rent')]);
    expect(last.state).toMatchObject({ step: 'region', retryCount: 1 });
    expect(last.state.context.answers.intent).toBe('buy');
  });

  it('aceita a opção digitada por extenso, sem acento e em minúsculas', () => {
    const { last } = run([reply('greeting', 'accept'), text('  comprar ')]);
    expect(last.answer?.answerKey).toBe('buy');
    const { last: other } = run([reply('greeting', 'accept'), reply('intent', 'buy'), reply('region', 'centro'), reply('price', 'up_to_300k'), reply('payment', 'cash'), reply('timeline', 'over_6m'), text('so eu')]);
    expect(other.answer?.answerKey).toBe('alone');
  });

  it('na saudação, duas respostas inválidas encaminham para um corretor', () => {
    const { last } = run([text('qual o valor do apartamento?'), text('?')]);
    expect(last.status).toBe('HANDED_OFF');
    expect(last.answer?.answerKey).toBe('no_answer');
  });
});

describe('saídas do fluxo', () => {
  it('"Agora não" na saudação encerra sem perguntas', () => {
    const { last } = run([reply('greeting', 'decline')]);
    expect(last.status).toBe('DECLINED');
    expect(last.messages[0]).toEqual({ type: 'text', body: END_MESSAGES.declined });
  });

  it('botão "Falar com corretor" encaminha em qualquer passo', () => {
    const { last } = run([reply('greeting', 'accept'), reply('intent', 'buy'), reply('region', 'handoff')]);
    expect(last.status).toBe('HANDED_OFF');
    expect(last.answer).toBeNull();
    expect(last.messages[0]).toEqual({ type: 'text', body: END_MESSAGES.handoff });
  });

  it.each(['quero falar com um corretor', 'tem atendente?', 'Preciso de um HUMANO'])(
    'texto "%s" encaminha para corretor',
    (value) => {
      const { last } = run([reply('greeting', 'accept'), text(value)]);
      expect(last.status).toBe('HANDED_OFF');
    },
  );
});

describe('limites do WhatsApp', () => {
  const eightSlots = Array.from({ length: 8 }, (_, i) => ({ id: `2026-10-0${i + 1}T15:30:00.000Z`, label: 'Sáb, 04/10 às 12h30' }));
  const contexts: BotContext[] = [
    { answers: {} },
    { answers: { intent: 'buy' } },
    { answers: { intent: 'rent' } },
    { answers: { intent: 'buy' }, slots: eightSlots },
  ];

  it.each(STEP_KEYS.flatMap((step) => contexts.map((ctx) => [step, ctx] as const)))(
    'passo %s respeita os limites',
    (step, ctx) => {
      const message = renderStep(step, ctx, 'Não entendi 😅 Escolha uma das opções abaixo, por favor.');
      expect(message.body.length).toBeLessThanOrEqual(1024);

      if (message.type === 'buttons') {
        expect(message.buttons.length).toBeLessThanOrEqual(3);
        for (const b of message.buttons) expect(b.title.length).toBeLessThanOrEqual(20);
      }
      if (message.type === 'list') {
        expect(message.rows.length).toBeLessThanOrEqual(10);
        expect(message.buttonText.length).toBeLessThanOrEqual(20);
        for (const r of message.rows) {
          expect(r.title.length).toBeLessThanOrEqual(24);
          expect(r.id.length).toBeLessThanOrEqual(200);
        }
      }
    },
  );

  it('ids das opções são únicos em cada passo', () => {
    for (const step of STEP_KEYS) {
      for (const ctx of contexts) {
        const ids = FLOW[step].options(ctx).map((o) => o.id);
        expect(new Set(ids).size).toBe(ids.length);
        if (step === 'visit_slot') continue; // ids são datas
        expect(ids).not.toContain('handoff');
        expect(ids).not.toContain('no_answer');
      }
    }
  });
});
