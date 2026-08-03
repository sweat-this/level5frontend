import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Testing Library's auto-cleanup hooks into a global `afterEach` - this project doesn't enable
// vitest's `globals` option, so it never registers without doing it explicitly here.
afterEach(() => {
  cleanup();
});
