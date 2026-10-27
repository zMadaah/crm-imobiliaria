import { describe, expect, it } from 'vitest';
import { replyId, type BotInput } from '../modules/bot/bot-engine';
import type { StepKey } from '../modules/bot/qualification-flow';
import { checkMobile, checkName, normalizeAdCode } from '../modules/webchat/contact';
import { handleWebInput, startWebFlow, WEB_TEXT, type WebResult, type WebState } from '../modules/webchat/web-flow';

const reply = (step: StepKey, option: string): BotInput => ({ kind: 'reply', id: replyId(step, option) });
const text = (value: string): BotInput => ({ kind: 'text', text: value });

function run(inputs: BotInput[]): { results: WebResult[]; last: WebResult } {
  let state: WebState = startWebFlow().state;
  const results: WebResult[] = [];
  for (const input of inputs) {
    const result = handleWebInput(state, input);
    results.push(result);
    state = result.state;
  }
  return { results, last: results[results.length - 1] };
}

const CONTACT = [reply('greeting', 'accept'), text('Maria Silva'), text('(61) 99999-8888')];

describe('checkName', () => {
  it.each(['Maria', '  João   da  Silva ', 'Ana-Luíza'])('aceita "%s"', (raw) => expect(checkName(raw).ok).toBe(true));
  it('limpa espaços', () => expect(checkName('  João   da  Silva ')).toEqual({ ok: true, value: 'João da Silva' }));
  it.each(['', 'a', '61999998888', '!!!', 'x'.repeat(61)])('recusa "%s"', (raw) => expect(checkName(raw).ok).toBe(false));
});

describe('checkMobile', () => {
  it.each(['(61) 99999-8888', '61999998888', '+55 61 99999-8888', '5561999998888', '061 99999-8888'])('aceita "%s"', (raw) => {
    expect(checkMobile(raw)).toEqual({ ok: true, value: '5561999998888' });
  });
  it('recusa número incompleto', () => expect(checkMobile('9999-8888')).toMatchObject({ ok: false, error: expect.stringContaining('incompleto') }));
  it('recusa DDD que não existe', () => expect(checkMobile('(20) 99999-8888')).toMatchObject({ ok: false, error: expect.stringContaining('DDD') }));
  it('recusa fixo', () => expect(checkMobile('(61) 3333-44445')).toMatchObject({ ok: false, error: expect.stringContaining('celular') }));
  it('recusa número repetido', () => expect(checkMobile('(61) 99999-9999')).toMatchObject({ ok: false }));
});

describe('normalizeAdCode', () => {
  it.each([
    ['REF-101', 'REF-101'],
    ['ref101', 'REF-101'],
    ['101', 'REF-101'],
    ['ilha-do-sol', 'ILHA-DO-SOL'],
  ])('"%s" vira %s', (raw, expected) => expect(normalizeAdCode(raw)).toBe(expected));
  it.each([undefined, '', '<script>', 'a'.repeat(31), ['REF-1']])('ignora %j', (raw) => expect(normalizeAdCode(raw)).toBeNull());
});

describe('fluxo da página de atendimento', () => {
  it('começa com a saudação da CB Engenharia e os botões', () => {
    const start = startWebFlow();
    expect(start.state.phase).toBe('consent');
    expect(start.messages[0].body).toContain('CB Engenharia');
  });

  it('depois do aceite, pede nome e WhatsApp antes das perguntas', () => {
    const { results } = run(CONTACT);
    expect(results[0].messages[0].body).toBe(WEB_TEXT.askName);
    expect(results[0].answer).toMatchObject({ questionKey: 'greeting', answerKey: 'accept' });
    expect(results[1].messages[0].body).toContain('Prazer, Maria!');
    expect(results[2].contact).toEqual({ name: 'Maria Silva', phone: '5561999998888' });
    expect(results[2].messages[0].body).toBe('Você está buscando um apartamento para morar ou para investir?');
    expect(results[2].state.phase).toBe('questions');
  });

  it('WhatsApp inválido explica o erro e pede de novo', () => {
    const { last } = run([reply('greeting', 'accept'), text('Maria'), text('9999')]);
    expect(last.contact).toBeNull();
    expect(last.state.phase).toBe('phone');
    expect(last.messages[0].body).toContain('DDD');
  });

  it('botão tocado na hora de digitar o nome pede para digitar', () => {
    const { last } = run([reply('greeting', 'accept'), reply('greeting', 'accept')]);
    expect(last.state.phase).toBe('name');
    expect(last.messages[0].body).toBe(WEB_TEXT.typeIt);
  });

  it('percorre as 6 perguntas e conclui', () => {
    const { last } = run([
      ...CONTACT,
      reply('goal', 'invest'),
      reply('search_stage', 'comparing'),
      reply('interest', 'location'),
      reply('payment', 'own_funds'),
      reply('timeline', 'up_to_3m'),
      reply('visit', 'no'),
    ]);
    expect(last.state).toMatchObject({ phase: 'done', status: 'COMPLETED' });
    expect(last.answer).toMatchObject({ questionKey: 'visit', answerKey: 'no' });
  });

  it('"Sim" na visita leva ao passo de horário (os horários vêm do serviço)', () => {
    const { last } = run([
      ...CONTACT,
      reply('goal', 'invest'),
      reply('search_stage', 'comparing'),
      reply('interest', 'location'),
      reply('payment', 'own_funds'),
      reply('timeline', 'up_to_3m'),
      reply('visit', 'yes'),
    ]);
    expect(last.state.engine.step).toBe('visit_slot');
    expect(last.state.status).toBe('ACTIVE');
  });

  it('"Falar com corretor" na saudação pede o contato e encerra depois dele', () => {
    const { results, last } = run([reply('greeting', 'handoff'), text('João'), text('61988887777')]);
    expect(results[0].messages[0].body).toBe(WEB_TEXT.askNameHandoff);
    expect(last.contact).toEqual({ name: 'João', phone: '5561988887777' });
    expect(last.state).toMatchObject({ phase: 'done', status: 'HANDED_OFF' });
  });

  it('"Falar com corretor" no meio das perguntas encerra sem pedir contato de novo', () => {
    const { last } = run([...CONTACT, reply('goal', 'handoff')]);
    expect(last.contact).toBeNull();
    expect(last.state).toMatchObject({ phase: 'done', status: 'HANDED_OFF' });
  });

  it('"Agora não" encerra sem pedir contato', () => {
    const { last } = run([reply('greeting', 'decline')]);
    expect(last.state).toMatchObject({ phase: 'done', status: 'DECLINED' });
    expect(last.contact).toBeNull();
  });

  it('depois de encerrado, novas mensagens não fazem nada', () => {
    const { last } = run([reply('greeting', 'decline'), text('oi')]);
    expect(last.messages).toEqual([]);
  });
});

import { RateLimiter } from '../modules/webchat/public-limits';
import { inputFor } from '../modules/webchat/web-flow';

describe('inputFor', () => {
  it('saudação: botões', () => {
    const spec = inputFor(startWebFlow().state);
    expect(spec.kind).toBe('options');
    if (spec.kind === 'options') expect(spec.options.map((o) => o.title)).toEqual(['Sim, vamos lá', 'Agora não', 'Falar com corretor']);
  });

  it('nome e WhatsApp: campo de texto com o tipo certo', () => {
    const { results } = run([reply('greeting', 'accept'), text('Maria')]);
    expect(inputFor(results[0].state)).toMatchObject({ kind: 'text', field: 'name' });
    expect(inputFor(results[1].state)).toMatchObject({ kind: 'text', field: 'phone' });
  });

  it('no site, as opções aparecem com o texto completo (sem o limite do WhatsApp)', () => {
    const { last } = run([...CONTACT, reply('goal', 'invest'), reply('search_stage', 'comparing'), reply('interest', 'location')]);
    const spec = inputFor(last.state);
    if (spec.kind !== 'options') throw new Error('esperava opções');
    expect(spec.options.map((o) => o.title)).toEqual([
      'Recursos próprios',
      'Entrada + financiamento, já fiz simulação',
      'Entrada + financiamento, ainda não simulei',
      'Venda de outro imóvel',
      'Quero entender as opções',
      'Falar com corretor',
    ]);
  });

  it('encerrado: sem campo', () => expect(inputFor(run([reply('greeting', 'decline')]).last.state)).toEqual({ kind: 'done' }));
});

describe('RateLimiter', () => {
  it('bloqueia depois do limite e libera na janela seguinte', () => {
    const limiter = new RateLimiter(2, 1_000);
    expect([limiter.hit('ip', 0), limiter.hit('ip', 10), limiter.hit('ip', 20)]).toEqual([true, true, false]);
    expect(limiter.hit('outro-ip', 20)).toBe(true);
    expect(limiter.hit('ip', 1_000)).toBe(true);
  });
});

import { WEB_END } from '../modules/webchat/web-flow';

describe('mensagens finais', () => {
  it('citam o primeiro nome do corretor sem supor gênero', () => {
    expect(WEB_END.handedOff('Ana Paula Souza')).toBe('Pronto! Ana, da equipe da CB Engenharia, vai te chamar no WhatsApp em breve.');
  });
  it('sem corretor ainda, falam da equipe', () => {
    expect(WEB_END.handedOff(null)).toBe('Pronto! Um corretor da CB Engenharia vai te chamar no WhatsApp em breve.');
  });
});
