import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIndicatorsSqlDoc } from '../src/modules/reports/indicators.queries';

const path = join(__dirname, '..', 'docs', 'indicadores.sql');
writeFileSync(path, buildIndicatorsSqlDoc());
console.log(`Gerado: ${path}`);
