import knexLib from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './init.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(__dirname, '../../db.sqlite');

const knex = knexLib({
    client: 'better-sqlite3',
    connection: { filename: dbPath },
    useNullAsDefault: true,
});

// 启动时初始化数据库
let initialized = false;
export async function ensureDB() {
    if (initialized) return;
    initialized = true;
    await initDatabase(knex);
}

export default knex;
