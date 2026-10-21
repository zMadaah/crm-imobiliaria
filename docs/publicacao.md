# Publicação: WhatsApp da CB Engenharia no ar

Número do bot: **+55 61 99866-5922** (na API e nos links: `5561998665922`).

Siga na ordem. Cada parte termina com uma conferência; só avance quando ela passar.

---

## Parte A. Número na WhatsApp Cloud API (Meta)

1. **O número não pode estar ativo no aplicativo do WhatsApp** (nem no WhatsApp Business).
   Se estiver, faça backup das conversas e exclua a conta no app:
   Configurações > Conta > Apagar conta. Sem isso, a Meta recusa o cadastro.
2. Em business.facebook.com > Configurações do negócio > Contas do WhatsApp > sua conta >
   **Números de telefone** > Adicionar número. Informe `+55 61 99866-5922` e confirme pelo código (SMS ou ligação).
3. Defina o **nome de exibição**: `CB Engenharia`. A Meta revisa o nome; enquanto isso, o número já funciona.
4. Em developers.facebook.com > seu app > WhatsApp > **Configuração da API**, escolha o número novo no campo "De"
   e anote o **ID do número de telefone** (não é o número em si).
5. **Token permanente:** Configurações do negócio > Usuários > **Usuários do sistema** > Adicionar (função Administrador) >
   Atribuir ativos: o app (controle total) e a conta do WhatsApp (controle total) > **Gerar token** com as permissões
   `whatsapp_business_messaging` e `whatsapp_business_management`. Guarde o token num lugar seguro: ele aparece uma vez só.
6. **Forma de pagamento:** no WhatsApp Manager, conta do WhatsApp > Configurações de pagamento.
7. **App Secret:** developers.facebook.com > seu app > Configurações do app > Básico > App Secret.
8. Invente uma senha para o **token de verificação do webhook** (ex.: 24 letras e números aleatórios).

**Conferência:** você tem em mãos ID do número, token permanente, App Secret e token de verificação.

---

## Parte B. API e banco no Render

1. Em render.com: **New > Blueprint** > conecte o GitHub > repositório `zMadaah/crm-imobiliaria`.
   Escolha o branch com este arquivo (depois do merge, `main`).
2. O Render lê o `render.yaml` e propõe criar a API `crm-cb-engenharia-api` e o banco `crm-cb-engenharia-db`.
   Ele pede os valores marcados como segredo:
   | Variável | Valor |
   |---|---|
   | `WHATSAPP_PHONE_NUMBER_ID` | ID do número (Parte A, passo 4) |
   | `WHATSAPP_ACCESS_TOKEN` | token permanente (Parte A, passo 5) |
   | `WHATSAPP_APP_SECRET` | App Secret (Parte A, passo 7) |
   | `WHATSAPP_VERIFY_TOKEN` | senha que você inventou (Parte A, passo 8) |
   | `WEB_ORIGIN` | por enquanto `http://localhost:5173`; troca na Parte D |

   O número da empresa (`WHATSAPP_BUSINESS_NUMBER=5561998665922`) já vem preenchido no `render.yaml`.
   `JWT_SECRET` é gerado sozinho. Os planos já vêm pagos (API sempre ativa); se o Render reclamar do nome de um plano,
   escolha na tela o menor plano pago da API e do banco.
3. Clique em **Apply**. O deploy instala, compila, aplica as migrations e sobe a API.

**Conferência:** abra `https://crm-cb-engenharia-api.onrender.com/health` (o endereço exato aparece no Render).
Deve mostrar `"database": "ok"` e, em `whatsapp`, `"mode": "real"` e `"ready": true`. Se `ready` vier `false`,
a lista `problems` diz qual variável falta.

---

## Parte C. Usuários de produção

As contas de teste (`dono@imobiliaria.local`) não devem ir para produção. No Render, abra o banco >
**Connect** > copie a **External Database URL**. No seu Mac, em `apps/api`:

```bash
DATABASE_URL="cole-a-external-database-url" \
SEED_PASSWORD="uma-senha-forte-provisoria" \
SEED_OWNER="Nome do Dono <dono@cbengenharia.com.br>" \
SEED_BROKERS="Corretor A <a@cbengenharia.com.br>, Corretor B <b@cbengenharia.com.br>" \
npm run db:seed
```

O comando lista cada usuário criado. Todos entram com a senha provisória.

**Conferência:** a saída termina com `Seed concluído`.

---

## Parte D. Painel na Vercel

1. Em vercel.com: **Add New > Project** > importe `zMadaah/crm-imobiliaria`.
2. **Root Directory:** `apps/web`. Framework: Vite (detectado sozinho).
3. Variável de ambiente: `VITE_API_URL` = endereço da API no Render (sem barra no fim).
4. **Deploy.** Anote o endereço do painel (ex.: `https://crm-cb-engenharia.vercel.app`).
5. Volte ao Render > API > Environment > `WEB_ORIGIN` = endereço do painel > Save (a API reinicia).

Observação: o plano gratuito da Vercel é para uso não comercial. Para o painel de um cliente, confira se o plano pago se aplica.

**Conferência:** abra o painel, entre com o e-mail do dono e a senha provisória. A lista de leads abre vazia, sem erro.
Em **Anúncios**, o cartão do topo mostra "WhatsApp do bot: +55 61 99866-5922" e "Conectado à Meta".

---

## Parte E. Webhook da Meta apontando para o Render

1. developers.facebook.com > seu app > WhatsApp > **Configuração**.
2. URL de callback: `https://SEU-ENDERECO.onrender.com/webhooks/whatsapp`
3. Token de verificação: o mesmo `WHATSAPP_VERIFY_TOKEN` > **Verificar e salvar**.
4. Em Campos do webhook, assine **messages**.
5. Coloque o app no modo **Publicado** (pede URL de política de privacidade).

**Conferência:** de outro celular, mande `Olá, vi o anúncio REF-101` para **+55 61 99866-5922**.
O bot responde com a saudação da CB Engenharia e, no painel, o lead aparece com a origem "Post REF-101".

---

## Parte F. Links dos anúncios

Um código por anúncio, no destino **Site** do Meta Ads:

```
https://wa.me/5561998665922?text=Ol%C3%A1!%20Vi%20o%20an%C3%BAncio%20REF-101
```

Troque `REF-101` pelo código de cada anúncio e guarde a tabela anúncio → código.

---

## Se algo der errado

| Sintoma | Onde olhar |
|---|---|
| `/health` com `database` indisponível | banco do Render parado ou `DATABASE_URL` errada |
| Meta não verifica o webhook | API fora do ar, URL sem `/webhooks/whatsapp` ou token de verificação diferente |
| Cliente escreve e o bot não responde | Logs da API no Render: "outro número ... ignorada" = `WHATSAPP_PHONE_NUMBER_ID` errado; erro 401 da Meta = token inválido |
| Painel diz que não consegue falar com o servidor | `VITE_API_URL` errada na Vercel ou `WEB_ORIGIN` errada no Render |
