import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Testing Library's auto-cleanup hooks into a global `afterEach` - this project doesn't enable
// vitest's `globals` option, so it never registers without doing it explicitly here.
afterEach(() => {
  cleanup();
});

// The `server-only` package throws on import unless resolved under React's
// "react-server" condition (see node_modules/server-only/index.js), which plain vitest
// doesn't set up. Every test run is effectively "server" context here - there's no
// Client Component bundle under test - so this mirrors what that condition would
// resolve to (an empty module) rather than disabling the real safeguard Next's build
// still enforces.
vi.mock('server-only', () => ({}));
