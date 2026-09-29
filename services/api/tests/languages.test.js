const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { LANGUAGES, listLanguages, getLanguageBySlug } = require('../src/config/languages');

describe('Supported languages', () => {
  it('exposes the Judge0 CE 1.13 catalog IDs used by the UI', () => {
    const bySlug = Object.fromEntries(LANGUAGES.map((language) => [language.slug, language.judge0Id]));
    assert.deepEqual(bySlug, {
      python: 71,
      cpp: 54,
      java: 62,
      javascript: 63,
    });
  });

  it('lists public language metadata without embedding full templates', () => {
    const listed = listLanguages();
    assert.equal(listed.length, 4);
    for (const language of listed) {
      assert.ok(language.slug);
      assert.ok(language.label);
      assert.equal(typeof language.judge0Id, 'number');
      assert.ok(language.template.includes('Hello CodeArena'));
    }
  });

  it('resolves known slugs and rejects unknown ones', () => {
    assert.equal(getLanguageBySlug('python').judge0Id, 71);
    assert.equal(getLanguageBySlug('go'), null);
  });
});
