# CRM imobiliário

Etapas implementadas: **1 (modelo de dados)**, **2 (webhook da WhatsApp Cloud API)** e **3 (chatbot de qualificação)**.

```
apps/api   backend Node + TypeScript + Express + Prisma
apps/web   (a partir da Etapa 5)
```

## Rodando localmente

```bash
docker compose up -d                # Postgres em localhost:5432
cd apps/api
cp .env.example .env                # preencha WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN e SEED_PASSWORD
npm install
npm run db:reset                    # apaga o banco, aplica as migrations do zero e roda o seed
npm run dev                         # API em http://localhost:3333
```

## Testes automáticos

```bash
npm test          # origem (REF e anúncio), assinatura e conteúdo das mensagens
npm run typecheck
```

## Aceite da Etapa 1

Depois do `npm run db:reset`, abra `npm run db:studio` e confira os 3 usuários
(dono@imobiliaria.local, corretor1@imobiliaria.local, corretor2@imobiliaria.local),
todos com a senha definida em `SEED_PASSWORD`.

## Aceite da Etapa 2

**Sem a Meta (fixtures assinadas):**

```bash
npm run send-fixture -- text-ref      # lead Maria, origem REF-042
npm run send-fixture -- ctwa-ad       # lead João, origem do anúncio
npm run send-fixture -- text-plain    # lead Carlos, origem UNKNOWN
npm run send-fixture -- text-ref      # mesmo id de novo: NÃO duplica a mensagem
```

Cada envio deve responder `200` em poucos milissegundos. No Prisma Studio,
confira `leads` (com `origin_post` e `origin_source`), `messages`,
`lead_stage_history` (entrada NEW para cada lead) e `webhook_events` (PROCESSED).

**Com a Meta (mensagem real):**

1. Exponha a API: `ngrok http 3333` (ou Cloudflare Tunnel).
2. No painel do app na Meta, em WhatsApp > Configuração, cadastre
   `https://SEU-TUNEL/webhooks/whatsapp` e o mesmo `WHATSAPP_VERIFY_TOKEN` do `.env`.
3. Assine o campo `messages`.
4. Cadastre seu celular como destinatário do número de teste.
5. Mande "Olá, vi o imóvel REF-042" para o número de teste e confira o lead no banco.

## Decisões desta etapa

- O webhook valida a assinatura, grava o payload em `webhook_events` e responde 200.
  O processamento roda logo depois, fora da requisição.
- Se o servidor cair no meio, uma varredura a cada minuto retoma eventos pendentes
  (até 5 tentativas; depois o evento fica FAILED com o erro em `last_error`).
- Mensagem duplicada é ignorada pelo `wa_message_id` único.
- Origem por primeiro toque: só é gravada se o lead ainda não tiver uma.
- Webhooks só de status (entregue, lida) e download de mídia ficam para etapas futuras.
- Travas no banco (CHECK): telefone só com dígitos, score não negativo,
  venda exige valor e perda exige motivo.

## Etapa 3: chatbot de qualificação

Fluxo: saudação com aviso LGPD → comprar ou alugar → região → faixa de preço →
pagamento (ou garantia, no aluguel) → prazo → quem decide → convite para visita.

- Textos, regiões e faixas de preço: `src/modules/bot/qualification-flow.ts` (procure os `TODO`).
- Até 2 opções vira botões; mais que isso vira lista. "Falar com corretor" aparece em toda pergunta.
- Digitar "corretor", "atendente" ou "humano" também encaminha.
- Resposta inválida: repete a pergunta uma vez; na segunda, grava "Sem resposta" e segue.
- Ao concluir ou ser encaminhado, o lead vai para QUALIFIED ou IN_SERVICE e recebe um corretor por rodízio.
- Pontos das respostas ficam em 0 até a Etapa 4.

### Atualizando um banco que já tem as Etapas 1 e 2

```bash
npm run db:deploy     # aplica só a migration nova, sem apagar dados
```

### Aceite sem a Meta

Com `WHATSAPP_DRY_RUN="true"` no `.env` e a API rodando (`npm run dev`), em outro terminal:

```bash
npm run chat
```

Digite qualquer texto para começar ("Olá, vi o REF-042"), depois o número das opções.
No fim o simulador mostra o resumo: etapa, corretor e as respostas gravadas.
Teste também: um texto qualquer no meio (repete a pergunta), dois seguidos (grava "Sem resposta"),
e digitar "quero falar com um corretor".

### Aceite com a Meta

No `.env`: `WHATSAPP_DRY_RUN="false"`, `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`
(painel do app > WhatsApp > Configuração da API). Reinicie a API, deixe o túnel ativo e
mande uma mensagem do seu celular para o número de teste.
