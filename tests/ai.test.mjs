import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { TOOLS } from '@/lib/ai/schema';
import { toDeclaration, toGeminiSchema } from '@/lib/ai/client';

/**
 * The tool surface has to survive translation to the provider.
 *
 * Gemini takes a subset of OpenAPI, not full JSON Schema. An unknown key
 * anywhere in a declaration is not ignored — the request is rejected, and the
 * visible symptom is the model answering from memory because it was handed no
 * tools at all. That is indistinguishable from the model choosing not to use
 * them, which is the exact failure this architecture exists to prevent, so it
 * gets a test rather than a code review.
 */

/** Everything Gemini's Schema accepts. Anything else must be stripped. */
const ALLOWED = new Set([
  'anyOf', 'default', 'description', 'enum', 'example', 'format', 'items',
  'maxItems', 'maxLength', 'maxProperties', 'maximum', 'minItems', 'minLength',
  'minProperties', 'minimum', 'nullable', 'pattern', 'properties',
  'propertyOrdering', 'required', 'title', 'type',
]);

const TYPES = new Set([
  'TYPE_UNSPECIFIED', 'STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'ARRAY', 'OBJECT', 'NULL',
]);

function walk(node, path, visit) {
  if (typeof node !== 'object' || node === null) return;
  visit(node, path);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties') {
      for (const [name, child] of Object.entries(value)) walk(child, `${path}.${name}`, visit);
    } else if (key === 'items') {
      walk(value, `${path}[]`, visit);
    } else if (key === 'anyOf') {
      value.forEach((child, i) => walk(child, `${path}|${i}`, visit));
    }
  }
}

describe('the tool surface translates to the provider', () => {
  test('every tool produces a declaration', () => {
    assert.ok(TOOLS.length > 0, 'no tools defined');
    for (const tool of TOOLS) {
      const declared = toDeclaration(tool);
      assert.equal(declared.name, tool.name);
      assert.ok(declared.description?.length > 0, `${tool.name} has no description`);
      assert.ok(declared.parameters, `${tool.name} produced no parameters`);
    }
  });

  test('names match what the API accepts', () => {
    for (const tool of TOOLS) {
      assert.match(tool.name, /^[a-zA-Z0-9_.-]{1,64}$/, `${tool.name} is not a legal tool name`);
    }
  });

  test('no unsupported schema key survives translation', () => {
    for (const tool of TOOLS) {
      walk(toDeclaration(tool).parameters, tool.name, (node, path) => {
        for (const key of Object.keys(node)) {
          assert.ok(ALLOWED.has(key), `${path}: "${key}" is not a Gemini Schema field`);
        }
      });
    }
  });

  test('types are the upper-case enum, not JSON Schema strings', () => {
    for (const tool of TOOLS) {
      walk(toDeclaration(tool).parameters, tool.name, (node, path) => {
        if (node.type !== undefined) {
          assert.ok(TYPES.has(node.type), `${path}: type "${node.type}" is not a Gemini Type`);
        }
      });
    }
  });

  test('additionalProperties is stripped rather than passed through', () => {
    // It is the one JSON Schema key our own tool definitions actually carry,
    // so this is the case most likely to regress.
    const before = TOOLS.some((t) => 'additionalProperties' in t.input_schema);
    assert.ok(before, 'expected at least one tool to declare additionalProperties');

    for (const tool of TOOLS) {
      walk(toDeclaration(tool).parameters, tool.name, (node, path) => {
        assert.ok(!('additionalProperties' in node), `${path}: additionalProperties leaked`);
      });
    }
  });

  test('required names only properties that exist', () => {
    for (const tool of TOOLS) {
      walk(toDeclaration(tool).parameters, tool.name, (node, path) => {
        for (const name of node.required ?? []) {
          assert.ok(node.properties?.[name], `${path}: required "${name}" has no property`);
        }
      });
    }
  });
});

describe('schema translation', () => {
  test('recurses into nested objects and arrays', () => {
    const out = toGeminiSchema({
      type: 'object',
      additionalProperties: false,
      properties: {
        list: {
          type: 'array',
          items: { type: 'object', additionalProperties: false, properties: { n: { type: 'integer' } } },
        },
      },
    });
    assert.equal(out.type, 'OBJECT');
    assert.equal(out.properties.list.type, 'ARRAY');
    assert.equal(out.properties.list.items.type, 'OBJECT');
    assert.equal(out.properties.list.items.properties.n.type, 'INTEGER');
    assert.ok(!('additionalProperties' in out.properties.list.items));
  });

  test('keeps the constraints Gemini does understand', () => {
    const out = toGeminiSchema({
      type: 'string',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      description: 'A Dublin date.',
      enum: ['a', 'b'],
    });
    assert.equal(out.pattern, '^\\d{4}-\\d{2}-\\d{2}$');
    assert.equal(out.description, 'A Dublin date.');
    assert.deepEqual(out.enum, ['a', 'b']);
  });
});

describe('nullable fields', () => {
  test("a JSON Schema union collapses to a type plus nullable", () => {
    // `type: ['string', 'null']` uppercased verbatim becomes "STRING,NULL",
    // which the API rejects — and one rejected declaration takes every other
    // tool down with it, so the model silently loses its whole surface.
    const out = toGeminiSchema({ type: ['string', 'null'], description: 'Optional.' });
    assert.equal(out.type, 'STRING');
    assert.equal(out.nullable, true);
    assert.equal(out.description, 'Optional.');
  });

  test('a plain type is untouched and not marked nullable', () => {
    const out = toGeminiSchema({ type: 'integer' });
    assert.equal(out.type, 'INTEGER');
    assert.equal(out.nullable, undefined);
  });
});
