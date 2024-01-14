import { describe, it, expect } from 'bun:test';
import { BunSQLiteCache } from '../src';

describe('BunSQLiteCache', () => {

  it('Setting a cache value: value equal', () => {
    const cache = new BunSQLiteCache();
    const testObj = { a: 1, b: 2 };
    cache.set('test', testObj);
    const value = cache.get('test');
    cache.close();
    expect(value).toEqual(testObj);
  });

  it('No matching cache value: no value found', () => {
    const cache = new BunSQLiteCache();
    cache.set('other_field', { a: 1, b: 2 });
    const value = cache.get('test');
    cache.close();
    expect(value).toBeUndefined();
  });

  it('Deleting a cache value: no value found', () => {
    const cache = new BunSQLiteCache();
    cache.set('test', { a: 1, b: 2 });
    cache.delete('test');
    const value = cache.get('test');
    cache.close();
    expect(value).toBeUndefined();
  });

  it('Clearing the cache: no value found', () => {
    const cache = new BunSQLiteCache();
    cache.set('test', { a: 1, b: 2 });
    cache.clear();
    const value = cache.get('test');
    cache.close();
    expect(value).toBeUndefined();
  });

  it('Closing the cache - get value test: throw error', () => {
    const cache = new BunSQLiteCache();
    cache.set('test', { a: 1, b: 2 });
    cache.close();
    expect(() => { cache.get('test') }).toThrow('Cache is closed');
  });

  it('Closing the cache - set and check isClosed: be closed', () => {
    const cache = new BunSQLiteCache();
    cache.set('test', { a: 1, b: 2 });
    cache.close();
    const isClosed = cache.isClosed;
    expect(isClosed).toBeTrue();
  });

  it("Value equal after compression", () => {
    const cache = new BunSQLiteCache({ compress: true });
    const testObj: any = {};
    for (let i = 0; i < 10000; i++) {
      testObj[i] = Math.random();
    }
    cache.set('test', testObj);
    const value = cache.get('test', true);
    cache.close();
    expect(value?.value).toEqual(testObj);
    expect(value?.compressed).toEqual(true);
  });

  it("Throw error on invalid config", () => {
    expect(() => { new BunSQLiteCache({ database: 4 as any }) }).toThrow("Invalid 'database' configuration");
    expect(() => { new BunSQLiteCache({ defaultTtlMs: "4" as any }) }).toThrow("Invalid 'defaultTtlMs' configuration");
    expect(() => { new BunSQLiteCache({ compress: "false" as any }) }).toThrow("Invalid 'compress' configuration");
    expect(() => { new BunSQLiteCache({ maxItems: "7" as any }) }).toThrow("Invalid 'maxItems' configuration");
  });

  // Additional tests


  it('Setting and retrieving multiple cache values', () => {
    const cache = new BunSQLiteCache();
    const testObj1 = { a: 1, b: 2 };
    const testObj2 = { x: 'abc', y: [1, 2, 3] };
    cache.set('key1', testObj1);
    cache.set('key2', testObj2);
    const value1 = cache.get('key1');
    const value2 = cache.get('key2');
    cache.close();
    expect(value1).toEqual(testObj1);
    expect(value2).toEqual(testObj2);
  });

  it('Setting cache value with custom TTL and checking expiration', (done) => {
    const cache = new BunSQLiteCache();
    const testObj = { a: 1, b: 2 };
    cache.set('test', testObj, { ttlMs: 1000 });
    setTimeout(() => {
      const value = cache.get('test');
      expect(value).toBeUndefined();
      cache.close();
      done();
    }, 1500);
  });

  it('Setting cache value with compression and checking compression status', () => {
    const cache = new BunSQLiteCache({ compress: true });
    const testObj = { a: 1, b: 2 };
    cache.set('test', testObj);
    const valueWithMeta = cache.get('test', true);
    cache.close();
    expect(valueWithMeta?.compressed).toEqual(false);
  });

  it('Deleting cache values and checking if deleted', () => {
    const cache = new BunSQLiteCache();
    const testObj = { a: 1, b: 2 };
    cache.set('test', testObj);
    cache.delete('test');
    const value = cache.get('test');
    cache.close();
    expect(value).toBeUndefined();
  });

  it('Clearing the cache and checking if cleared', () => {
    const cache = new BunSQLiteCache();
    const testObj = { a: 1, b: 2 };
    cache.set('test', testObj);
    cache.clear();
    const value = cache.get('test');
    cache.close();
    expect(value).toBeUndefined();
  });

  it('Throw error on accessing closed cache', () => {
    const cache = new BunSQLiteCache();
    cache.close();
    expect(() => { cache.get('test') }).toThrow('Cache is closed');
  });

  it('Check if cache is closed after closing', () => {
    const cache = new BunSQLiteCache();
    cache.close();
    const isClosed = cache.isClosed;
    expect(isClosed).toBeTrue();
  });

  it('Throw error on invalid configuration parameters', () => {
    expect(() => { new BunSQLiteCache({ database: 4 as any }) }).toThrow("Invalid 'database' configuration");
    expect(() => { new BunSQLiteCache({ defaultTtlMs: "4" as any }) }).toThrow("Invalid 'defaultTtlMs' configuration");
    expect(() => { new BunSQLiteCache({ compress: "false" as any }) }).toThrow("Invalid 'compress' configuration");
    expect(() => { new BunSQLiteCache({ maxItems: "7" as any }) }).toThrow("Invalid 'maxItems' configuration");
  });
});
