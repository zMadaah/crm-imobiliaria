/**
 * Envia uma fixture assinada para o webhook local, simulando a Meta.
 *
 * Uso:
 *   npm run send-fixture -- text-ref
 *   npm run send-fixture -- ctwa-ad --new-id
 *   npm run send-fixture -- text-plain --from 5561988887777 --url http://localhost:3333/webhooks/whatsapp
 *
 * --new-id  gera um id de mensagem novo (sem ele, reenvia o mesmo id: bom para testar duplicadas)
 * --from    troca o telefone do remetente
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signPayload } from '../src/modules/whatsapp/signature';
import type { WhatsAppWebhookPayload } from '../src/modules/whatsapp/webhook.types';

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const fixtureName = process.argv[2];
  if (!fixtureName || fixtureName.startsWith('--')) {
    console.error('Informe a fixture: text-ref, ctwa-ad ou text-plain');
    process.exit(1);
  }

  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) throw new Error('WHATSAPP_APP_SECRET não definido no .env');

  const url = getArg('--url') ?? `http://localhost:${process.env.PORT ?? 3333}/webhooks/whatsapp`;
  const from = getArg('--from');
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const newId = process.argv.includes('--new-id');

  const path = join(__dirname, '..', 'src', 'tests', 'fixtures', `${fixtureName}.json`);
  const payload = JSON.parse(readFileSync(path, 'utf8')) as WhatsAppWebhookPayload;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value.messages ?? []) {
        if (newId) message.id = `wamid.TESTE_${randomUUID()}`;
        if (from) message.from = from;
        message.timestamp = String(Math.floor(Date.now() / 1000));
      }
      if (from) for (const contact of change.value.contacts ?? []) contact.wa_id = from;
      // Com o número configurado no .env, a fixture finge chegar a ele.
      if (phoneNumberId) change.value.metadata.phone_number_id = phoneNumberId;
    }
  }

  const body = JSON.stringify(payload);
  const started = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': signPayload(body, secret),
    },
    body,
  });

  console.log(`${response.status} ${response.statusText} em ${Date.now() - started} ms`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
