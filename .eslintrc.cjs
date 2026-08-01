module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: [
    'airbnb',
    'airbnb-typescript',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['react-refresh'],
  settings: {
    react: { version: 'detect' },
    'import/resolver': {
      typescript: { project: './tsconfig.json' },
    },
  },
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // Vite's JSX transform doesn't require React in scope.
    'react/react-in-jsx-scope': 'off',
    'react/jsx-uses-react': 'off',
    // Global ambient .d.ts types (src/@types) are a deliberate project convention.
    'import/prefer-default-export': 'off',
    // defaultProps on function components is deprecated (React 18.3+ warns on it) - TS optional
    // props plus a destructured default value is the modern replacement this rule doesn't know
    // about.
    'react/require-default-props': 'off',
    // Thin wrapper components (ButtonLink forwarding arbitrary MUI ButtonProps) need to spread
    // - enumerating every prop they forward would defeat the point of the wrapper.
    'react/jsx-props-no-spreading': 'off',
  },
};
