import { runProductionNativeHostEntry } from './entry.js';
import { createNativeHostProductionEnvironment } from './platform.js';

const productionEnvironment = createNativeHostProductionEnvironment(import.meta.url);

void runProductionNativeHostEntry(productionEnvironment).then(
  (status) => productionEnvironment.settleExitCode(status),
  () => productionEnvironment.settleExitCode(1),
);
