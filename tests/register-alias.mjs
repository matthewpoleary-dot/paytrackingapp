// Installs the alias loader before the test files are imported.
import { register } from 'node:module';
register('./alias-loader.mjs', import.meta.url);
