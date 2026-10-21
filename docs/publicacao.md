# Publicação: CRM da CB Engenharia no ar

O cliente toca no anúncio, abre a **página de atendimento** e responde às perguntas do bot.
O lead aparece no painel já pontuado, e o corretor chama o cliente no WhatsApp pelo botão do painel.
Não depende da API do WhatsApp (isso fica para a próxima feature: `docs/whatsapp-api.md`).

Siga na ordem. Cada parte termina com uma conferência.

---

## Parte 1. Código no GitHub

O Render e a Vercel publicam a partir do GitHub. Faça o merge do branch `feat/cb-engenharia-bot-anuncios` em `main`.

---

## Parte 2. API e banco no Render

1. Em render.com: **New > Blueprint** > conecte o GitHub > repositório `zMadaah/crm-imobiliaria`, branch `main`.
2. O Render lê o `render.yaml` e propõe criar a API `crm-cb-engenharia-api` e o banco `crm-cb-engenharia-db`.
   Ele pede só `WEB_ORIGIN`: por enquanto coloque `http://localhost:5173` (troca na Parte 4).
   `JWT_SECRET` é gerado sozinho. Os planos são pagos de propósito: a API fica sempre ativa e o banco não expira.
   Se o Render reclamar do nome de um plano, escolha na tela o menor plano pago.
3. **Apply.** O deploy instala, compila, aplica as migrations e sobe a API.

**Conferência:** abra `https://SEU-ENDERECO.onrender.com/health` (o endereço aparece no Render).
Deve mostrar `"status": "ok"` e `"database": "ok"`.

---

## Parte 3. Usuários reais

No Render, abra o banco > **Connect** > copie a **External Database URL**. No seu Mac, em `apps/api`:

```bash
DATABASE_URL="cole-a-external-database-url" \
SEED_PASSWORD="uma-senha-forte-provisoria" \
SEED_OWNER="Nome do Dono <dono@cbengenharia.com.br>" \
SEED_BROKERS="Corretor A <a@cbengenharia.com.br>, Corretor B <b@cbengenharia.com.br>" \
npm run db:seed
```

**Conferência:** a saída lista cada usuário e termina com `Seed concluído`.

---

## Parte 4. Painel e página de atendimento na Vercel

1. vercel.com > **Add New > Project** > importe `zMadaah/crm-imobiliaria`.
2. **Root Directory:** `apps/web`. Framework: Vite.
3. Variável: `VITE_API_URL` = endereço da API no Render, sem barra no fim.
4. **Deploy.** Anote o endereço (ex.: `https://crm-cb-engenharia.vercel.app`).
5. No Render > API > Environment: `WEB_ORIGIN` = endereço da Vercel > Save.

O plano gratuito da Vercel é para uso não comercial; para o painel de um cliente, confira o plano pago.

**Conferência:**
- `https://SEU-PAINEL/entrar`: entre com o e-mail do dono e a senha provisória.
- `https://SEU-PAINEL/atendimento?anuncio=REF-101` no celular: responda tudo com um número seu.
  O lead aparece no painel com o selo **Site**, a origem `Post REF-101` e o botão **Chamar no WhatsApp**.

---

## Parte 5. Link de cada anúncio

No Meta Ads, cada anúncio usa o destino **Site**, com um código diferente:

```
https://SEU-PAINEL/atendimento?anuncio=REF-101
https://SEU-PAINEL/atendimento?anuncio=REF-102
...
```

Guarde a tabela anúncio → código. Editar o link manda o anúncio de volta para a revisão da Meta.

---

## Se algo der errado

| Sintoma | Onde olhar |
|---|---|
| `/health` com `database` indisponível | banco do Render parado ou `DATABASE_URL` errada |
| Página de atendimento diz que não consegue enviar | `VITE_API_URL` errada na Vercel ou `WEB_ORIGIN` errada no Render |
| "Muitas mensagens em pouco tempo" | limite por aparelho (10 atendimentos novos por hora); espere ou teste de outra rede |
| Lead não aparece no painel | o cliente parou antes de informar o WhatsApp: o lead só é criado depois dele |
