const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'db.sqlite'), (err) => {
  if (err) {
    console.error('Failed to connect to database:', err.message);
  } else {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )`);

    // Layanan records table
    db.run(`CREATE TABLE IF NOT EXISTS layanan_records (
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
    )`);
  }
});

module.exports = {
  // Register a new user
  createUser: (username, password, callback) => {
    db.run(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, password],
      function (err) {
        if (err) return callback(err);
        callback(null, this.lastID);
      }
    );
  },

  // Find a user by username and password (login)
  findUser: (username, password, callback) => {
    db.get(
      'SELECT * FROM users WHERE username = ? AND password = ?',
      [username, password],
      (err, user) => {
        if (err) return callback(err);
        callback(null, user);
      }
    );
  },

  // Check if a username exists
  findUserByUsername: (username, callback) => {
    db.get(
      'SELECT * FROM users WHERE username = ?',
      [username],
      (err, user) => {
        if (err) return callback(err);
        callback(null, user);
      }
    );
  },

  // List all users (for admin/testing)
  listUsers: (callback) => {
    db.all(
      'SELECT id, username FROM users',
      [],
      (err, users) => {
        if (err) return callback(err);
        callback(null, users);
      }
    );
  },

  // Add a new layanan record
  createLayananRecord: (data, callback) => {
    db.run(
      `INSERT INTO layanan_records
        (tanggal, nama, nama_perusahaan, jam_mulai, jam_selesai, jenis_layanan, pertanyaan, jawaban, petugas)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.tanggal,
        data.nama,
        data.nama_perusahaan,
        data.jam_mulai,
        data.jam_selesai,
        data.jenis_layanan,
        data.pertanyaan,
        data.jawaban,
        data.petugas
      ],
      function (err) {
        if (err) return callback(err);
        callback(null, this.lastID);
      }
    );
  },

  // Get all layanan records
  getAllLayananRecords: (callback) => {
    db.all(
      `SELECT * FROM layanan_records ORDER BY tanggal DESC, jam_mulai DESC`,
      [],
      (err, rows) => {
        if (err) return callback(err);
        callback(null, rows);
      }
    );
  }
};