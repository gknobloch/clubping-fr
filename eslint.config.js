import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'docs', '.vite', 'coverage', 'test-results', 'playwright-report'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // #284: a local `const teamIdFor = (side) => ...` shadowed the imported
      // teamIdFor(clubId, phaseId, number), so a call meant for the import
      // recursed into the local one with the wrong arguments, returned null,
      // and inserted teams with a NULL id in production. functions/ is not
      // typechecked by `npm run build` (root tsconfig only includes src), so
      // nothing caught it — this rule does, everywhere, for pennies.
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
    },
  }
)
