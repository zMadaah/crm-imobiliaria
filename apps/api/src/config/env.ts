import 'dotenv/config';
import { z } from 'zod';
import { normalizeBusinessNumber } from '../modules/whatsapp/business-number';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3333),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
    WHATSAPP_VERIFY_TOKEN: z.string().min(1, 'WHATSAPP_VERIFY_TOKEN é obrigatória'),
    WHATSAPP_APP_SECRET: z.string().min(1, 'WHATSAPP_APP_SECRET é obrigatória'),
    // Com true, nada é enviado para a Meta: as mensagens do bot só são gravadas e mostradas no terminal.
    WHATSAPP_DRY_RUN: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    // Número da empresa, com 55 e DDD (ex.: 5561998665922). Aparece no painel e nos links wa.me.
    WHATSAPP_BUSINESS_NUMBER: z
      .string()
      .optional()
      .transform((value, ctx) => {
        if (!value?.trim()) return undefined;
        try {
          return normalizeBusinessNumber(value);
        } catch (error) {
          ctx.addIssue({ code: 'custom', message: (error as Error).message });
          return z.NEVER;
        }
      }),
    WHATSAPP_API_VERSION: z.string().default('v23.0'),
    // Painel (Etapa 4)
    JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres'),
    JWT_EXPIRES_IN: z.string().default('12h'),
    // Endereço(s) do painel, separados por vírgula
    WEB_ORIGIN: z.string().default('http://localhost:5173'),
  })
  .superRefine((value, ctx) => {
    if (value.WHATSAPP_DRY_RUN) return;
    if (!value.WHATSAPP_ACCESS_TOKEN) {
      ctx.addIssue({ code: 'custom', path: ['WHATSAPP_ACCESS_TOKEN'], message: 'obrigatória quando WHATSAPP_DRY_RUN=false' });
    }
    if (!value.WHATSAPP_PHONE_NUMBER_ID) {
      ctx.addIssue({ code: 'custom', path: ['WHATSAPP_PHONE_NUMBER_ID'], message: 'obrigatória quando WHATSAPP_DRY_RUN=false' });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variáveis de ambiente inválidas:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
