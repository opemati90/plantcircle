import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { catalogs } from '@plantcircle/copy';

/**
 * functions/push-dispatch/copy.json is the `notify` block of every catalogue, so push text is
 * rendered server-side in the member's language. `UPDATE_PUSH_COPY=1 pnpm --filter
 * @plantcircle/mobile test pushCopy` regenerates it; this test keeps it in sync.
 */
const FILE = join(__dirname, '../../../../../supabase/functions/push-dispatch/copy.json');

const expected = Object.fromEntries(
  Object.entries(catalogs).map(([language, catalog]) => [
    language,
    { notify: catalog.notify, appName: 'PlantCircle' },
  ]),
);

test('the push copy file matches the catalogues', () => {
  const text = `${JSON.stringify(expected, null, 2)}\n`;
  if (process.env['UPDATE_PUSH_COPY']) writeFileSync(FILE, text);
  expect(readFileSync(FILE, 'utf8')).toBe(text);
});
