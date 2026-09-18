import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      // Fremder, minifizierter Code — einmal kopiert, nicht gepflegt.
      'public/vendor/**',
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    /*
     * Der Dexie-Adapter ist die einzige Stelle, die IndexedDB kennen darf.
     * Diese Regel ist nicht Kosmetik: Sie hält die Zusage ein, dass der
     * Wechsel auf eine zentrale DB nur die Datenschicht betrifft.
     */
    files: ['components/**/*.tsx', 'app/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['dexie', '**/data/local/*'],
              message:
                'UI-Code greift nur über useRepository()/useSnapshot() auf Daten zu, niemals direkt auf Dexie.',
            },
          ],
        },
      ],
    },
  },
];

export default config;
