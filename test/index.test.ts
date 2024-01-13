import { describe, it, expect } from 'bun:test'
import { BunSQLiteCache } from '../src'

describe('should', () => {
  it('Setting a cache value: value equal', () => {
    const cache = new BunSQLiteCache()
    const testObj = { a: 1, b: 2 }
    cache.set('test', testObj)
    const value = cache.get('test')
    cache.close()
    expect(value).toEqual(testObj)
  })

  it('No matching cache value: no value found', () => {
    const cache = new BunSQLiteCache()
    cache.set('other_field', { a: 1, b: 2 })
    const value = cache.get('test')
    cache.close()
    expect(value).toBeUndefined()
  })

  it('Deleting a cache value: no value found', () => {
    const cache = new BunSQLiteCache()
    cache.set('test', { a: 1, b: 2 })
    cache.delete('test')
    const value = cache.get('test')
    cache.close()
    expect(value).toBeUndefined()
  })

  it('Clearing the cache: no value found', () => {
    const cache = new BunSQLiteCache()
    cache.set('test', { a: 1, b: 2 })
    cache.clear()
    const value = cache.get('test')
    cache.close()
    expect(value).toBeUndefined()
  })

  it('Closing the cache - get value test: throw error', () => {
    const cache = new BunSQLiteCache()
    cache.set('test', { a: 1, b: 2 })
    cache.close()
    expect(() => { cache.get('test') }).toThrow('Cache is closed')
  })

  it('Closing the cache - set and check isClosed: be closed', () => {
    const cache = new BunSQLiteCache()
    cache.set('test', { a: 1, b: 2 })
    cache.close()
    const isClosed = cache.isClosed;
    expect(isClosed).toBeTrue()
  })

  it("Value equal after compression", () => {
    const cache = new BunSQLiteCache({ compress: true })
    // generate a very large random object with 10000 keys
    const testObj: any = {};
    for (let i = 0; i < 10000; i++) {
      testObj[i] = Math.random()
    }
    cache.set('test', testObj)
    const value = cache.get('test', true)
    cache.close()
    expect(value?.value).toEqual(testObj)
    expect(value?.compressed).toEqual(true)
  })
})
