import { PIPELINE_STAGES } from './stages.js';
import { RESOLVERS } from './resolvers/index.js';

/** Print the corpus build plan and resolver registry. A scaffold entrypoint. */
function main(): void {
  console.log('randomify corpus pipeline\n');

  console.log('Stages:');
  for (const [i, stage] of PIPELINE_STAGES.entries()) {
    console.log(`  ${i + 1}. ${stage.title} — ${stage.detail}`);
  }

  console.log('\nResolvers:');
  for (const resolver of RESOLVERS) {
    const strategies = resolver.strategies.length
      ? resolver.strategies.map((s) => s.name).join(', ')
      : 'search-fallback only (not yet implemented)';
    console.log(`  ${resolver.platform} [${resolver.approach}] — ${strategies}`);
  }
}

main();
