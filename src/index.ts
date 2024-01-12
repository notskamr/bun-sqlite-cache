import z from "zod";
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

const BunSQLiteCacheConfigurationSchema = z.object({
    database: z.string().optional().default(":memory:"),
    defaultTtlMs: z.number().optional(),
    maxItems: z.number().positive().optional(),
    compress: z.boolean().optional().default(false),
})

async function initSqliteCache(configuration: BunSQLiteCacheConfiguration) {
    const db = new Database(configuration.database || ":memory:");
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

export class BunSQLiteCache<TData = any> {
    private readonly db: ReturnType<typeof initSqliteCache>;
    private readonly checkInterval: NodeJS.Timeout;
    isClosed: boolean = false;

    constructor(private readonly configuration: BunSQLiteCacheConfiguration = {}) {
        const config = BunSQLiteCacheConfigurationSchema.parse(configuration);
        this.db = initSqliteCache(config);
        this.checkInterval = setInterval(this.checkForExpiredItems, 500);
    }

    public async get<T = TData>(key: string): Promise<T | undefined> {
        if (this.isClosed) {
            throw new Error("Cache is closed");
        }
        const db = await this.db;
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
        return deserialize(Buffer.from(value));
    }
    public async set<T = TData>(
        key: string,
        value: T,
        opts: { ttlMs?: number; compress?: boolean; } = {}
    ): Promise<boolean> {
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

        try {
            const db = await this.db;
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

        setImmediate(this.checkForExpiredItems.bind(this));
    }

    public async delete(key: string) {
        if (this.isClosed) {
            throw new Error("Cache is closed");
        }
        (await this.db).deleteStatement.run({ $key: key });
    }

    public async clear() {
        if (this.isClosed) {
            throw new Error("Cache is closed");
        }

        (await this.db).clearStatement.run({});
    }

    public async close() {
        clearInterval(this.checkInterval);
        (await this.db).db.close();
        this.isClosed = true;
    }

    private checkForExpiredItems =
        async () => {
            if (this.isClosed) {
                return;
            }

            try {
                const db = await this.db;
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
        }

}

export default BunSQLiteCache;