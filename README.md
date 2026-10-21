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

## Etapa final: CB Engenharia, número do WhatsApp e anúncios

### Perguntas do bot

Saudação da CB Engenharia com aviso de uso dos dados, e depois:

1. Morar ou investir: Morar (primeiro imóvel), Morar (mudança), Investir, Ainda estou avaliando
2. Etapa da busca: Comecei a pesquisar, Comparando opções, Já quero visitar
3. O que conhecer primeiro: Plantas, Localização e estrutura, Condições de pagamento
4. Como pagar: Recursos próprios, Financiar (já simulei), Financiar (não simulei), Venda de outro imóvel, Quero entender opções
5. Prazo: Até 30 dias, Até 3 meses, Até 6 meses, Ainda não sei
6. Visita: Sim, Não (o "Sim" oferece os horários livres do corretor)

As listas do WhatsApp aceitam até 24 caracteres no título da opção; os textos mais longos
aparecem completos na linha de descrição. Pesos padrão somam no máximo 100 e continuam editáveis em Pontuação.
Respostas de leads antigos continuam visíveis; conversas paradas numa pergunta antiga recomeçam do início.

### Número do WhatsApp

Com `WHATSAPP_PHONE_NUMBER_ID` preenchido, o bot só atende mensagens que chegam a esse número e responde por ele.
Mensagens para outros números da mesma conta na Meta são ignoradas. Vazio (testes locais), aceita todas.

### Anúncios

- Cada anúncio Click-to-WhatsApp é cadastrado sozinho quando traz o primeiro lead (menu **Anúncios**, só o dono).
- O dono dá um nome ("Apto 3 quartos, Torre A") e o imóvel; o nome aparece nos leads e nos indicadores.
- Se a mensagem do anúncio trouxer um código `REF-...`, ele é guardado junto como imóvel do lead.
- Simular cliente vindo de anúncio: `npm run chat -- --anuncio 111 --titulo "Torre A"`.

### Atualizando

```bash
cd apps/api && npm install && npm run db:deploy   # pare a API antes
cd ../web && npm install
```

### Aceite

1. `npm run chat -- --anuncio 111 --titulo "Torre A"` e `npm run chat -- --anuncio 222 --titulo "Torre B"`:
   percorra as 6 perguntas. Os dois leads aparecem com anúncios diferentes.
2. Em **Anúncios**, dê nomes aos dois. A lista de leads e os Indicadores passam a mostrar os nomes.
3. `npm run chat` começando com "Olá, vi o REF-101": origem "Post REF-101".
4. `npm run check:indicators`: 7 linhas com ✔.

## Atendimento pelo site (sem WhatsApp)

O anúncio aponta para `/atendimento?anuncio=REF-101`, uma página pública com o mesmo bot:
saudação, nome e WhatsApp do cliente, as 6 perguntas e, se ele quiser, a visita.

- O lead só é criado quando o cliente informa o WhatsApp (celular com DDD, conferido).
  Cliente que volta com o mesmo número não duplica: respostas e score são atualizados e o corretor é avisado.
- No painel, leads do site têm o selo **Site** e, no lugar do campo de resposta, o botão
  **Chamar no WhatsApp**, que abre o WhatsApp de quem está no painel com uma mensagem pronta.
- Proteção: campo escondido contra robôs e limite por aparelho (em produção, 10 atendimentos novos por hora).

## Rodar localmente

Três terminais, a partir da pasta do projeto.

**Primeira vez (ou depois de atualizar):**

```bash
cd apps/api
npm install
npx prisma generate
npm run db:deploy
npm run db:seed          # se ainda não tiver os usuários
cd ../web
npm install
```

**Terminal 1, API:** `cd apps/api && npm run dev` (porta 3333)

**Terminal 2, painel e página:** `cd apps/web && npm run dev` (porta 5173)

**No navegador:**

- Painel: `http://localhost:5173`, com `dono@imobiliaria.local` e a senha do `SEED_PASSWORD`.
- Página do cliente: `http://localhost:5173/atendimento?anuncio=REF-101`.
  Abra numa janela anônima (ou no celular, se estiver na mesma rede) e responda como cliente.
  O lead aparece no painel na hora. Para começar outro atendimento, use "Começar de novo" no fim.

No `apps/api/.env`, para o site basta `WHATSAPP_DRY_RUN="true"`; as variáveis da Meta podem ficar vazias.

## Publicação

Roteiro completo: [`docs/publicacao.md`](docs/publicacao.md). Para ligar o bot no WhatsApp depois: [`docs/whatsapp-api.md`](docs/whatsapp-api.md).

- `render.yaml`: Blueprint do Render com a API (sempre ativa) e o banco.
- `GET /health`: confirma o banco e a configuração do WhatsApp, sem mostrar segredos.
- Seed de produção com usuários reais: `SEED_OWNER` e `SEED_BROKERS` (formato `Nome <email>`).
