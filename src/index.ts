import Database from "bun:sqlite";
import { serialize, deserialize } from "v8";
import { gzipSync, gunzipSync } from "bun";

const COMPRESSION_MIN_LENGTH = 1024;

export interface BunSQLiteCacheConfiguration {
    readonly database?: string;
    readonly defaultTtlMs?: number;
    readonly maxItems?: number;
    readonly compress?: boolean;
}


function initSqliteCache(configuration: BunSQLiteCacheConfiguration) {
    const db = new Database(configuration.database || ":memory:");
    db.exec("PRAGMA journal_mode = WAL;");
    db.transaction(() => {
        db.prepare(
            `CREATE TABLE IF NOT EXISTS cache (
          key TEXT PRIMARY KEY,
          value BLOB,
          expires INT,
          lastAccess INT,
          compressed BOOLEAN
        )`
        ).run();
        db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS key ON cache (key)`).run();
        db.prepare(`CREATE INDEX IF NOT EXISTS expires ON cache (expires)`).run();
        db.prepare(
            `CREATE INDEX IF NOT EXISTS lastAccess ON cache (lastAccess)`
        ).run();
    })();
    return {
        db,
        getStatement: db.prepare(
            `UPDATE OR IGNORE cache
        SET lastAccess = $now
        WHERE key = $key AND (expires > $now OR expires IS NULL)
        RETURNING value, compressed`
        ),
        setStatement: db.prepare(
            `INSERT OR REPLACE INTO cache
        (key, value, expires, lastAccess, compressed) VALUES ($key, $value, $expires, $now, $compressed)`
        ),
        deleteStatement: db.prepare(`DELETE FROM cache WHERE key = $key`),
        clearStatement: db.prepare(`DELETE FROM cache`),
        cleanupExpiredStatement: db.prepare(`
        DELETE FROM cache WHERE expires < $now
      `),
        cleanupLruStatement: db.prepare(`
        WITH lru AS (SELECT key FROM cache ORDER BY lastAccess DESC LIMIT -1 OFFSET $maxItems)
        DELETE FROM cache WHERE key IN lru
      `),
    };
}

const now = Date.now;

type ValueWithMeta<T> = { value: T, key: string, compressed: boolean; };

const parseConfig = (config: BunSQLiteCacheConfiguration) => {
    const rawConfig = config;
    let errors: string[] = [];
    if (rawConfig.database && typeof rawConfig.database !== "string") {
        errors.push("'database'");
    }
    if (rawConfig.defaultTtlMs && typeof rawConfig.defaultTtlMs !== "number") {
        errors.push("'defaultTtlMs'");
    }
    if (rawConfig.maxItems && typeof rawConfig.maxItems !== "number") {
        errors.push("'maxItems'");
    }
    if (rawConfig.compress && typeof rawConfig.compress !== "boolean") {
        errors.push("'compress'");
    }
    if (errors.length > 0) {
        throw new Error(`Invalid ${errors.join(",")} configuration`);
    }
    return {
        database: rawConfig.database ?? ":memory:",
        defaultTtlMs: rawConfig.defaultTtlMs,
        maxItems: rawConfig.maxItems,
        compress: rawConfig.compress,

    };
};

/**
 * Represents a cache implementation using SQLite as the underlying storage.
 */
export class BunSQLiteCache<TData = any> {
    private readonly db: ReturnType<typeof initSqliteCache>;
    private readonly checkInterval: NodeJS.Timeout;
    isClosed: boolean = false;

    constructor(private readonly configuration: BunSQLiteCacheConfiguration = {}) {
        this.configuration = parseConfig(configuration);
        this.db = initSqliteCache(this.configuration);
        this.checkInterval = setInterval(this.checkForExpiredItems, 500);
    }
    /**
     * Retrieves the value associated with the specified key from the cache.
     * 
     * @param key - The key of the value to retrieve.
     * @param withMeta - Optional. Specifies whether to include metadata in the returned value.
     * @returns The retrieved value, or undefined if the key does not exist in the cache.
     *          If `withMeta` is true, returns an object containing the value, key, and compression status.
     */
    public get<T = any>(key: string, withMeta?: false): T | undefined;
    public get<T = any>(key: string, withMeta: true): ValueWithMeta<T> | undefined;
    public get<T = TData>(key: string, withMeta?: boolean): T | ValueWithMeta<T> | undefined {
        if (this.isClosed) {
            throw new Error("Cache is closed");
        }
        const db = this.db;
        const res = db.getStatement.get({
            $key: key,
            $now: now(),
        });
        if (!res) {
            return undefined;
        }
        let value: any = (res as any).value;
        if ((res as any).compressed) {
            value = gunzipSync(Buffer.from(value));
        }
        const deserialized = deserialize(Buffer.from(value));

        if (withMeta) {
            return { value: deserialized, key, compressed: (res as any).compressed === 1 ? true : false };
        }
        return deserialized;
    }
    /**
     * Sets a value in the cache with the specified key.
     * 
     * @param key - The key to associate with the value.
     * @param value - The value to be stored in the cache.
     * @param opts - Optional settings for the cache item.
     * @param opts.ttlMs - The time-to-live for the cache item in milliseconds.
     * @param opts.compress - Indicates whether to compress the value before storing it in the cache.
     * @returns True if the value was successfully set in the cache, false otherwise.
     * @throws Error if the cache is closed.
     */
    public set<T = TData>(
        key: string,
        value: T,
        opts: { ttlMs?: number; compress?: boolean; } = {}
    ): boolean {
        if (this.isClosed) {
            throw new Error("Cache is closed");
        }

        const ttl = opts.ttlMs ?? this.configuration.defaultTtlMs;
        const expires = ttl !== undefined ? new Date(now() + ttl) : undefined;
        let compression = opts.compress ?? this.configuration.compress ?? false;
        let valueBuffer = serialize(value);

        if (compression && valueBuffer.length >= COMPRESSION_MIN_LENGTH) {
            const compressed = Buffer.from(gzipSync(valueBuffer));
            if (compressed.length >= valueBuffer.length) {
                compression = false;
            } else {
                valueBuffer = compressed;
            }
        } else {
            compression = false;
        }
        setImmediate(this.checkForExpiredItems.bind(this));
        try {
            const db = this.db;
            db.setStatement.run({
                $key: key,
                $value: valueBuffer,
                $expires: expires ? expires.getTime() : null,
                $now: now(),
                $compressed: compression ? 1 : 0
            });
            return true;
        } catch (ex) {
            console.error(
                "Error in bun-sqlite-cache when setting cache item",
                ex
            );
            return false;
        }

    }

    /**
     * Deletes a cache entry with the specified key.
     * 
     * @param key - The key of the cache entry to delete.
     * @throws Error if the cache is closed.
     */
    public delete(key: string) {
        if (this.isClosed) {
            throw new Error("Cache is closed");
        }
        this.db.deleteStatement.run({ $key: key });
    }

    /**
     * Clears the cache by running the clearStatement.
     * @throws {Error} If the cache is closed.
     */
    public clear() {
        if (this.isClosed) {
            throw new Error("Cache is closed");
        }
        this.db.clearStatement.run({});
    }

    /**
     * Closes the cache and releases any resources associated with it.
     */
    public close() {
        clearInterval(this.checkInterval);
        this.db.db.close();
        this.isClosed = true;
    }

    private checkForExpiredItems =
        () => {
            if (this.isClosed) {
                return;
            }

            try {
                const db = this.db;
                db.cleanupExpiredStatement.run({ $now: now() });

                if (this.configuration.maxItems) {
                    db.cleanupLruStatement.run({
                        $maxItems: this.configuration.maxItems,
                    });
                }
            } catch (ex) {
                console.error(
                    "Error in bun-sqlite-cache when checking for expired items",
                    ex
                );
            }
        };

}

export default BunSQLiteCache;