// Lets `node --test` import the app's TypeScript modules directly.
//
// Node 24 strips types from .ts files on its own; what it does not do is
// resolve the two things TypeScript lets us write: the `@/` alias, and
// imports with no file extension. Twenty lines here beats adding a test
// runner and a build step to run assertions on pure arithmetic.

import { pathToFileURL } from 'node:url';

const ROOT = pathToFileURL(`${process.cwd()}/`).href;

export async function resolve(specifier, context, next) {
  const mapped = specifier.startsWith('@/')
    ? new URL(specifier.slice(2), ROOT).href
    : specifier;

  try {
    return await next(mapped, context);
  } catch (error) {
    // Extensionless relative import — TypeScript's habit, not Node's.
    if (/\.[a-z]+$/i.test(mapped)) throw error;
    return next(`${mapped}.ts`, context);
  }
}
