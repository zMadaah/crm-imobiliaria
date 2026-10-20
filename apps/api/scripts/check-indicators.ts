/**
 * Confere os indicadores contra uma base montada à mão.
 * Roda tudo dentro de uma transação que é desfeita no fim: nada fica no seu banco.
 *
 * Uso: npm run check:indicators
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { compareIndicators, FIXTURE_PERIOD, FIXTURE_STATEMENTS } from '../src/modules/reports/indicator-fixture';
import { runIndicatorQueries } from '../src/modules/reports/indicators.queries';

const prisma = new PrismaClient();
class Rollback extends Error {}

async function main() {
  let results: ReturnType<typeof compareIndicators> = [];
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const statement of FIXTURE_STATEMENTS) await tx.$executeRawUnsafe(statement);
        // Em série: a transação usa uma única conexão.
        const indicators = await runIndicatorQueries(
          (sql, params) => tx.$queryRawUnsafe(sql, ...params),
          FIXTURE_PERIOD.start,
          FIXTURE_PERIOD.end,
          { sequential: true },
        );
        results = compareIndicators(indicators);
        throw new Rollback();
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }

  for (const result of results) {
    console.log(`${result.ok ? '✔' : '✘'} ${result.name}`);
    if (!result.ok) {
      console.log('   esperado:', JSON.stringify(result.expected));
      console.log('   obtido:  ', JSON.stringify(result.actual));
    }
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(failed === 0 ? '\nTodos os indicadores batem com a base de conferência.' : `\n${failed} indicador(es) diferente(s).`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
