require('dotenv').config();
const { createClient: createTursoClient } = require('@libsql/client');

const db = createClient: createTursoClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Ensure tables exist
(async () => {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS layanan_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tanggal TEXT NOT NULL,
        nama TEXT NOT NULL,
        nama_perusahaan TEXT,
        jam_mulai TEXT NOT NULL,
        jam_selesai TEXT NOT NULL,
        jenis_layanan TEXT,
        pertanyaan TEXT,
        jawaban TEXT,
        petugas TEXT
      );
    `);

    console.log('Tables ensured.');
  } catch (err) {
    console.error('Failed to create tables:', err.message);
  }
})();

module.exports = {
  // Register a new user
  async createUser(username, password) {
    try {
      const result = await db.execute({
        sql: 'INSERT INTO users (username, password) VALUES (?, ?)',
        args: [username, password]
      });
      return result.lastInsertRowid;
    } catch (err) {
      throw err;
    }
  },

  // Find a user by username and password (for login)
  async findUser(username, password) {
    try {
      const result = await db.execute({
        sql: 'SELECT * FROM users WHERE username = ? AND password = ?',
        args: [username, password]
      });
      return result.rows[0] || null;
    } catch (err) {
      throw err;
    }
  },

  // Find a user by username only (for registration checks)
  async findUserByUsername(username) {
    try {
      const result = await db.execute({
        sql: 'SELECT * FROM users WHERE username = ?',
        args: [username]
      });
      return result.rows[0] || null;
    } catch (err) {
      throw err;
    }
  },

  // List all users (for admin/testing)
  async listUsers() {
    try {
      const result = await db.execute({
        sql: 'SELECT id, username FROM users'
      });
      return result.rows;
    } catch (err) {
      throw err;
    }
  },

  // Add a new layanan record
  async createLayananRecord(data) {
    try {
      const result = await db.execute({
        sql: `
          INSERT INTO layanan_records
            (tanggal, nama, nama_perusahaan, jam_mulai, jam_selesai, jenis_layanan, pertanyaan, jawaban, petugas)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          data.tanggal,
          data.nama,
          data.nama_perusahaan,
          data.jam_mulai,
          data.jam_selesai,
          data.jenis_layanan,
          data.pertanyaan,
          data.jawaban,
          data.petugas
        ]
      });
      return result.lastInsertRowid;
    } catch (err) {
      throw err;
    }
  },

  // Get all layanan records
  async getAllLayananRecords() {
    try {
      const result = await db.execute({
        sql: 'SELECT * FROM layanan_records ORDER BY tanggal DESC, jam_mulai DESC'
      });
      return result.rows;
    } catch (err) {
      throw err;
    }
  }
};
