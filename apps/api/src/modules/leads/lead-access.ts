import type { Prisma, UserRole } from '@prisma/client';

export type AccessUser = { id: string; role: UserRole; active?: boolean };

/**
 * Quem vê quais leads. Toda consulta de lead feita pelo painel passa por aqui.
 * - dono: todos
 * - corretor: só os atribuídos a ele
 * - usuário inativo: nenhum
 */
export function leadAccessWhere(user: AccessUser): Prisma.LeadWhereInput {
  if (user.active === false) return { id: { in: [] } };
  if (user.role === 'OWNER') return {};
  return { brokerId: user.id };
}
