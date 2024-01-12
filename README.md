# Bun SQLite Cache
Bun SQLite cache is a Bun-ified version of [jkelin](https://github.com/jkelin)'s [sqlite-lru-cache](https://github.com/jkelin/cache-sqlite-lru-ttl) (with TTL). Bun's lightning-fast implementation makes this perfect for a quick in-memory caching solution with TTL support.

## Installation
```bash
bun add bun-sqlite-cache
```

## Usage
Using this cache is dead simple: simply create a new BunSQLiteCache instance and you're set
```typescript
import { BunSQLiteCache } from "bun-sqlite-cache";

const cache = new BunSQLiteCache();

await cache.set("foo", { bar: "baz", waldo: [4, 3, 2, 8] });
const value = await cache.get("foo");

console.log(value) // { bar: "baz", waldo: [4, 3, 2, 8] }
```

## Methods
#### Initialize
```typescript
import { BunSQLiteCache, BunSQLiteCacheConfiguration } from "bun-sqlite-cache";

// the given values are the defaults
const options: BunSQLiteCacheConfiguration = {
    database: ":memory:", // database file or in memory: default :- in memory sqlite table
    defaultTtlMs: undefined, // the default time it takes (in ms) for a cached row to expire: default :- no expiry
    maxItems: undefined, // max number of items allowed in cache. if number of items is exceeded then LRU eviction policy is used: default :- no limit
    compress: false // whether to compress data before putting it in the cache (uses Bun's synchronous gzip)
}

const cache = new BunSQLiteCache(options)
```
#### `set(key: string, value: any, opts?: { ttlMs?:  number, compress?: boolean }): Promise<boolean>`
Adds a value to the cache by serializing the given value and adding it to the table
- `key`: the key to store the value under
- `value`: the value to store - can be anything serializable by 'v8'
- opts:
    - `ttlMs`: the time it takes (in ms) for a cached row to expire: default:- no expiry
    - `compress`: whether to compress data before putting it in the cache (uses Bun's synchronous gzip)
- returns: Promise with a `boolean` dictating whether the value was successfully added to the cache

#### `get(key: string): Promise<any>`
Gets a value from the cache by deserializing the value stored under the given key
- `key`: the key to get the value from
- returns: Promise with the deserialized value stored under the given key (`any`)

#### `delete(key: string): Promise<void>`
Deletes a value from the cache
- `key`: the key to delete the value from
- returns: Promise with void - no return value really

#### `clear(): Promise<void>`
Clears the cache
- returns: Promise with void - no return value really

## Contributing
Contributions are welcome! Feel free to open an issue or submit a pull request.

## License
MIT
