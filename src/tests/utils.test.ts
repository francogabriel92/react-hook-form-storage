import { describe, it, expect, jest } from '@jest/globals';
import {
  deleteAtPath,
  filterIncludedOrExcludedFields,
  findUnsafePaths,
  getAtPath,
  hasAtPath,
  isUnsafeKey,
  setAtPath,
  toLeafEntries,
  toPathSegments,
  transformValues,
} from '../utils';

describe('toPathSegments', () => {
  it('Should split both notations identically', () => {
    expect(toPathSegments('items.0.email')).toEqual(['items', '0', 'email']);
    expect(toPathSegments('items[0].email')).toEqual(['items', '0', 'email']);
  });

  it('Should drop empty segments', () => {
    expect(toPathSegments('')).toEqual([]);
    expect(toPathSegments('a..b.')).toEqual(['a', 'b']);
  });
});

describe('findUnsafePaths', () => {
  it('Should find a prototype segment anywhere in the path', () => {
    expect(
      findUnsafePaths([
        'card.number',
        'card.__proto__.x',
        'constructor',
        'a.prototype.b',
      ])
    ).toEqual(['card.__proto__.x', 'constructor', 'a.prototype.b']);
  });

  it('Should treat a missing list as empty', () => {
    expect(findUnsafePaths()).toEqual([]);
  });
});

describe('isUnsafeKey', () => {
  it('Should only flag prototype keys', () => {
    expect(isUnsafeKey('__proto__')).toBe(true);
    expect(isUnsafeKey('name')).toBe(false);
  });
});

describe('hasAtPath', () => {
  const values = { card: { cvv: undefined }, items: [{ email: 'a@b.c' }] };

  it('Should tell a missing path from one holding undefined', () => {
    expect(hasAtPath(values, ['card', 'cvv'])).toBe(true);
    expect(hasAtPath(values, ['card', 'number'])).toBe(false);
  });

  it('Should walk array indices', () => {
    expect(hasAtPath(values, ['items', '0', 'email'])).toBe(true);
    expect(hasAtPath(values, ['items', '1', 'email'])).toBe(false);
  });

  it('Should stop at a non-container', () => {
    expect(hasAtPath({ name: 'Ada' }, ['name', 'length'])).toBe(false);
  });

  it('Should not count inherited members as fields', () => {
    expect(hasAtPath(values, ['card', 'toString'])).toBe(false);
  });

  it('Should only count indices as the fields of an array', () => {
    // `length` is an own property, but it is not a field: deleting it throws
    expect(hasAtPath(values, ['items', 'length'])).toBe(false);
    expect(hasAtPath(values, ['items', '0'])).toBe(true);
  });
});

describe('getAtPath', () => {
  it('Should read through objects and arrays', () => {
    expect(getAtPath({ items: [{ email: 'a@b.c' }] }, ['items', '0', 'email']))
      .toBe('a@b.c');
  });

  it('Should return undefined when the path hits a non-container', () => {
    expect(getAtPath({ name: 'Ada' }, ['name', 'deeper'])).toBeUndefined();
  });
});

describe('setAtPath', () => {
  it('Should not mutate the source', () => {
    const source = { card: { number: '1', cvv: '2' } };

    const result = setAtPath(source, ['card', 'cvv'], '9');

    expect(result.card.cvv).toBe('9');
    expect(source.card.cvv).toBe('2');
    expect(result.card.number).toBe('1');
  });

  it('Should build an array for a numeric segment', () => {
    const result = setAtPath({}, ['items', '0', 'email'], 'a@b.c');

    expect(Array.isArray(result.items)).toBe(true);
    expect(result.items[0].email).toBe('a@b.c');
  });

  it('Should replace a non-container standing in the way', () => {
    expect(setAtPath({ card: 'oops' }, ['card', 'cvv'], '9')).toEqual({
      card: { cvv: '9' },
    });
  });

  it('Should return the value itself for an empty path', () => {
    expect(setAtPath({ a: 1 }, [], 'replaced')).toBe('replaced');
  });
});

describe('deleteAtPath', () => {
  it('Should not mutate the source', () => {
    const source = { card: { number: '1', cvv: '2' } };

    const result = deleteAtPath(source, ['card', 'cvv']);

    expect(result).toEqual({ card: { number: '1' } });
    expect(source.card.cvv).toBe('2');
  });

  it('Should leave the source untouched when nothing matches', () => {
    const source = { card: { number: '1' } };

    expect(deleteAtPath(source, ['card', 'cvv'])).toEqual(source);
    // Not even copied when the first segment misses
    expect(deleteAtPath(source, ['other', 'x'])).toBe(source);
    expect(deleteAtPath(source, [])).toBe(source);
    // An inherited member is not a field, so there is nothing to delete
    expect(deleteAtPath(source, ['toString'])).toBe(source);
  });

  it('Should refuse to delete a non-index member of an array', () => {
    const source = { items: [{ a: 1 }] };

    // `delete items.length` would throw and abort the whole save
    expect(deleteAtPath(source, ['items', 'length'])).toEqual(source);
  });

  it('Should fail closed when the path cannot be resolved', () => {
    // No way to remove just `name.deeper` from a string, so the parent goes
    expect(deleteAtPath({ name: 'Ada', email: 'a@b.c' }, ['name', 'deeper']))
      .toEqual({ email: 'a@b.c' });
  });

  it('Should keep sibling indices addressable when deleting inside an array', () => {
    const result = deleteAtPath({ items: [{ a: 1 }, { a: 2 }] }, [
      'items',
      '0',
      'a',
    ]);

    expect(result.items).toEqual([{}, { a: 2 }]);
  });
});

describe('toLeafEntries', () => {
  it('Should flatten plain objects to their deepest paths', () => {
    expect(toLeafEntries({ card: { number: '1', cvv: '2' }, name: 'Ada' }))
      .toEqual([
        ['card.number', '1'],
        ['card.cvv', '2'],
        ['name', 'Ada'],
      ]);
  });

  it('Should keep arrays, class instances and empty objects whole', () => {
    class Money {
      constructor(public amount = 1) {}
    }
    const price = new Money();

    expect(
      toLeafEntries({ items: [1, 2], price, empty: {}, missing: null })
    ).toEqual([
      ['items', [1, 2]],
      ['price', price],
      ['empty', {}],
      ['missing', null],
    ]);
  });

  it('Should drop keys that would touch the prototype', () => {
    const parsed = JSON.parse('{"name":"Ada","__proto__":{"polluted":true}}');

    expect(toLeafEntries(parsed)).toEqual([['name', 'Ada']]);
  });
});

describe('filterIncludedOrExcludedFields', () => {
  const values = {
    name: 'Ada',
    card: { number: '1', cvv: '2' },
    items: [{ email: 'a@b.c', id: 1 }],
  };

  it('Should copy the values when no filter is given', () => {
    const result = filterIncludedOrExcludedFields(values);

    expect(result).toEqual(values);
    expect(result).not.toBe(values);
  });

  it('Should include nested paths without their siblings', () => {
    expect(
      filterIncludedOrExcludedFields(values, ['card.number', 'items.0.email'])
    ).toEqual({ card: { number: '1' }, items: [{ email: 'a@b.c' }] });
  });

  it('Should skip included paths that are absent or unusable', () => {
    expect(
      filterIncludedOrExcludedFields(values, [
        'card.expiry',
        'card.__proto__.x',
        'card.toString',
        '',
        'name',
      ])
    ).toEqual({ name: 'Ada' });
  });

  it('Should exclude nested paths and keep their siblings', () => {
    expect(
      filterIncludedOrExcludedFields(values, undefined, ['card.cvv'])
    ).toEqual({
      name: 'Ada',
      card: { number: '1' },
      items: [{ email: 'a@b.c', id: 1 }],
    });
  });

  it('Should fail closed on an unusable excluded path', () => {
    // The intent was to keep `card` data out, so the root goes rather than leak
    expect(
      filterIncludedOrExcludedFields(values, undefined, ['card.__proto__.x'])
    ).toEqual({ name: 'Ada', items: [{ email: 'a@b.c', id: 1 }] });
  });

  it('Should ignore an empty excluded path', () => {
    expect(filterIncludedOrExcludedFields(values, undefined, [''])).toEqual(
      values
    );
  });

  it('Should let excluded win over included on the same branch', () => {
    expect(
      filterIncludedOrExcludedFields(values, ['card'], ['card.cvv'])
    ).toEqual({ card: { number: '1' } });
  });
});

describe('transformValues', () => {
  it('Should transform a nested path in both directions', () => {
    const serializer = {
      'card.number': {
        serialize: (value: string) => value.split('').reverse().join(''),
        deserialize: (value: string) => value.split('').reverse().join(''),
      },
    };
    const values = { card: { number: 'abc', cvv: '2' } };

    const serialized = transformValues(values, serializer);

    expect(serialized).toEqual({ card: { number: 'cba', cvv: '2' } });
    expect(values.card.number).toBe('abc');
    expect(transformValues(serialized, serializer, true)).toEqual(values);
  });

  it('Should fall back to identity for the missing direction', () => {
    const values = { name: 'ada' };
    const serializer = { name: { serialize: (v: string) => v.toUpperCase() } };

    expect(transformValues(values, serializer, true)).toEqual({ name: 'ada' });
  });

  it('Should not reintroduce a path that was filtered out', () => {
    const serializer = { cvv: { serialize: () => 'LEAKED' } };

    expect(transformValues({ name: 'Ada' }, serializer)).toEqual({
      name: 'Ada',
    });
  });

  it('Should skip an unusable serializer path', () => {
    const parsed = JSON.parse('{"name":"Ada","__proto__":{"polluted":true}}');
    const serializer = {
      '__proto__.polluted': { serialize: () => 'written' },
    };

    const result = transformValues(parsed, serializer);

    // The stored key survives as plain data — what must not happen is a write
    // through it, which is what would reach the prototype.
    expect(result.name).toBe('Ada');
    expect(result.__proto__.polluted).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('Should ignore an empty serializer entry', () => {
    expect(
      transformValues({ name: 'Ada' }, { name: undefined, email: {} })
    ).toEqual({ name: 'Ada' });
  });

  it('Should contain a throwing transform to its own field', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = transformValues(
      { card: { number: '1', cvv: '2' } },
      {
        'card.number': {
          serialize: () => {
            throw new Error('Simulated serialize failure');
          },
        },
        'card.cvv': { serialize: (value: string) => `${value}!` },
      }
    );

    expect(result).toEqual({ card: { number: '1', cvv: '2!' } });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to serialize field "card.number"')
    );

    jest.restoreAllMocks();
  });
});
