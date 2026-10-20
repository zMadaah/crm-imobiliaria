import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, type UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const users: { name: string; email: string; role: UserRole }[] = [
  { name: 'Dono da Imobiliária', email: 'dono@imobiliaria.local', role: 'OWNER' },
  { name: 'Corretor Um', email: 'corretor1@imobiliaria.local', role: 'BROKER' },
  { name: 'Corretor Dois', email: 'corretor2@imobiliaria.local', role: 'BROKER' },
];

async function main() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('Defina SEED_PASSWORD no .env com pelo menos 8 caracteres.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  for (const user of users) {
    // Rodar o seed de novo não duplica nem troca a senha de quem já existe.
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role },
      create: { ...user, passwordHash },
    });
  }

  console.log(`Seed concluído: ${users.length} usuários.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
