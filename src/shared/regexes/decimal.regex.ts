import assert from 'node:assert/strict';

export const DECIMAL_REGEX = /^-?\d+(\.\d+)?$/;
assert.match('0', DECIMAL_REGEX);
assert.match('100.25', DECIMAL_REGEX);
assert.match('-100.25', DECIMAL_REGEX);
assert.doesNotMatch('1e5', DECIMAL_REGEX);
assert.doesNotMatch('NaN', DECIMAL_REGEX);
assert.doesNotMatch('Infinity', DECIMAL_REGEX);
assert.doesNotMatch('100.', DECIMAL_REGEX);
assert.doesNotMatch('.25', DECIMAL_REGEX);
assert.doesNotMatch('', DECIMAL_REGEX);
assert.doesNotMatch(' 1 ', DECIMAL_REGEX);
