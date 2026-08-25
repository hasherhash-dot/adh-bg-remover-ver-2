import '@testing-library/jest-dom/vitest';

process.env.BACKGROUND_REMOVAL_PROVIDER ??= 'mock';
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
