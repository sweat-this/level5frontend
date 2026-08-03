import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default defineConfig(
  // Matches the project's original lint scope (`eslint src/**/*.{ts,tsx}`): root-level config
  // files were never linted before switching the script to `eslint .` for flat-config's sake.
  globalIgnores(['dist', 'vite.config.ts', 'eslint.config.js', 'vitest.setup.ts']),
  js.configs.recommended,
  tseslint.configs.recommended,
  react.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      // Explicit version, not 'detect': eslint-plugin-react's auto-detection calls a context
      // API (getFilename) that ESLint 10 removed, crashing every lint run.
      react: { version: '19.2.8' },
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Vite's JSX transform doesn't require React in scope.
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      // defaultProps on function components is deprecated (React 18.3+ warns on it) - TS optional
      // props plus a destructured default value is the modern replacement this rule doesn't know
      // about.
      'react/require-default-props': 'off',
      // Thin wrapper components (ButtonLink forwarding arbitrary MUI ButtonProps) need to spread
      // - enumerating every prop they forward would defeat the point of the wrapper.
      'react/jsx-props-no-spreading': 'off',
    },
  },
  prettier,
);
