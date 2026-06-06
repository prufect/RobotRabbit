import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

const entries = [
  'analyze',
  'search-contractors',
  'notify-contractors',
  'contractor-reply',
  'telegram-webhook',
  'finalize-booking',
  'status',
  'process-agent-jobs',
];

await mkdir('dist/functions', { recursive: true });

await Promise.all(entries.map(slug => build({
  entryPoints: [`functions/${slug}.ts`],
  outfile: `dist/functions/${slug}.ts`,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  external: ['npm:@insforge/sdk'],
  banner: {
    js: '// Bundled for InsForge Edge Functions. Deploy with npx @insforge/cli functions deploy <slug> --file dist/functions/<slug>.ts',
  },
})));
