import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, type UserRole } from '@prisma/client';

const prisma = new PrismaClient();

type SeedUser = { name: string; email: string; role: UserRole };

/** Usuários de teste, usados quando SEED_OWNER e SEED_BROKERS não estão definidos. */
const LOCAL_USERS: SeedUser[] = [
  { name: 'Dono da Imobiliária', email: 'dono@imobiliaria.local', role: 'OWNER' },
  { name: 'Corretor Um', email: 'corretor1@imobiliaria.local', role: 'BROKER' },
  { name: 'Corretor Dois', email: 'corretor2@imobiliaria.local', role: 'BROKER' },
];

/** "Nome <email>" → { name, email } */
function parsePerson(text: string): { name: string; email: string } {
  const match = /^\s*(.+?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(text);
  if (!match) throw new Error(`Formato inválido: "${text}". Use: Nome Sobrenome <email@dominio.com>`);
  return { name: match[1], email: match[2].toLowerCase() };
}

/**
 * Em produção, defina:
 *   SEED_OWNER="Nome do Dono <dono@empresa.com>"
 *   SEED_BROKERS="Corretor A <a@empresa.com>, Corretor B <b@empresa.com>"
 */
function usersFromEnv(): SeedUser[] {
  const owner = process.env.SEED_OWNER?.trim();
  const brokers = process.env.SEED_BROKERS?.trim();
  if (!owner && !brokers) return LOCAL_USERS;
  if (!owner) throw new Error('Defina SEED_OWNER junto com SEED_BROKERS.');

  return [
    { ...parsePerson(owner), role: 'OWNER' },
    ...(brokers ? brokers.split(',').filter((b) => b.trim()).map((b) => ({ ...parsePerson(b), role: 'BROKER' as const })) : []),
  ];
}

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('Defina SEED_PASSWORD com pelo menos 8 caracteres.');
  }

  const users = usersFromEnv();
  const passwordHash = await bcrypt.hash(password, 10);

  for (const user of users) {
    // Rodar o seed de novo não duplica nem troca a senha de quem já existe.
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role },
      create: { ...user, passwordHash },
    });
    console.log(`  ${user.role === 'OWNER' ? 'Dono    ' : 'Corretor'}  ${user.name} <${user.email}>`);
  }

  console.log(`Seed concluído: ${users.length} usuários.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
