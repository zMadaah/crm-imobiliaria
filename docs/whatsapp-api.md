# Próxima feature: bot pelo WhatsApp (Cloud API)

O CRM já tem o bot do WhatsApp pronto. Para ligar, é preciso cadastrar o número na Meta,
preencher as variáveis no Render e apontar o webhook. Hoje o atendimento é pela página do site.

Número: **+55 61 99866-5922** (`5561998665922`). Atenção: se ele estiver no aplicativo WhatsApp Business,
a Meta só aceita o cadastro na API depois de apagar a conta no aplicativo (ou pela coexistência, via provedor parceiro).

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

## Parte B. Variáveis no Render

Na API, em Environment, acrescente e salve (a API reinicia):

| Variável | Valor |
|---|---|
| `WHATSAPP_DRY_RUN` | `false` |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número (Parte A, passo 4) |
| `WHATSAPP_ACCESS_TOKEN` | token permanente (Parte A, passo 5) |
| `WHATSAPP_APP_SECRET` | App Secret (Parte A, passo 7) |
| `WHATSAPP_VERIFY_TOKEN` | senha que você inventou (Parte A, passo 8) |

**Conferência:** `/health` mostra `"mode": "real"` e `"ready": true`.

---

## Parte C. Webhook da Meta apontando para o Render

1. developers.facebook.com > seu app > WhatsApp > **Configuração**.
2. URL de callback: `https://SEU-ENDERECO.onrender.com/webhooks/whatsapp`
3. Token de verificação: o mesmo `WHATSAPP_VERIFY_TOKEN` > **Verificar e salvar**.
4. Em Campos do webhook, assine **messages**.
5. Coloque o app no modo **Publicado** (pede URL de política de privacidade).

**Conferência:** de outro celular, mande `Olá, vi o anúncio REF-101` para **+55 61 99866-5922**.
O bot responde com a saudação da CB Engenharia e, no painel, o lead aparece com a origem "Post REF-101".

---

