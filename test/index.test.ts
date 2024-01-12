import { describe, it, expect } from 'bun:test'
import { BunSQLiteCache } from '../src'

describe('should', () => {
  it('Setting a cache value: value equal', async () => {
    const cache = new BunSQLiteCache()
    const testObj = { a: 1, b: 2 }
    await cache.set('test', testObj)
    const value = await cache.get('test')
    await cache.close()
    expect(value).toEqual(testObj)
  })

  it('No matching cache value: no value found', async () => {
    const cache = new BunSQLiteCache()
    await cache.set('other_field', { a: 1, b: 2 })
    const value = await cache.get('test')
    await cache.close()
    expect(value).toBeUndefined()
  })

  it('Deleting a cache value: no value found', async () => {
    const cache = new BunSQLiteCache()
    await cache.set('test', { a: 1, b: 2 })
    await cache.delete('test')
    const value = await cache.get('test')
    await cache.close()
    expect(value).toBeUndefined()
  })

  it('Clearing the cache: no value found', async () => {
    const cache = new BunSQLiteCache()
    await cache.set('test', { a: 1, b: 2 })
    await cache.clear()
    const value = await cache.get('test')
    await cache.close()
    expect(value).toBeUndefined()
  })

  it('Closing the cache - get value test: throw error', async () => {
    const cache = new BunSQLiteCache()
    await cache.set('test', { a: 1, b: 2 })
    await cache.close()
    expect(cache.get('test')).rejects.toThrow('Cache is closed')
  })

  it('Closing the cache - set and check isClosed: be closed', async () => {
    const cache = new BunSQLiteCache()
    await cache.set('test', { a: 1, b: 2 })
    await cache.close()
    const isClosed = cache.isClosed;
    expect(isClosed).toBeTrue()
  })
})
