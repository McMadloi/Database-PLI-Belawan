const express = require('express');
const { createClient } = require('@libsql/client');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
const { createClient: createRedisClient } = require('redis');
const path = require('path');
const helmet = require('helmet');
require('dotenv').config();

const db = require('./db');

const app = express();

const PUBLIC_DIR = path.join(process.cwd(), 'public');

const redisClient = createRedisClient({
  url: process.env.REDIS_URL,
  legacyMode: true  // Required for connect-redis v5+ with redis v4+
})
redisClient.connect().catch(console.error);

// Middleware
app.use(helmet());
app.use(express.static(PUBLIC_DIR));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true on Vercel!
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}))

// Helpers
function calculateTotalWaktu(jamMulai, jamSelesai) {
  if (!jamMulai || !jamSelesai) return '';
  const [hStart, mStart] = jamMulai.split(':').map(Number);
  const [hEnd, mEnd] = jamSelesai.split(':').map(Number);
  let start = hStart * 60 + mStart;
  let end = hEnd * 60 + mEnd;
  if (end < start) end += 24 * 60;
  const diff = end - start;
  const hDiff = Math.floor(diff / 60);
  const mDiff = diff % 60;
  return `${hDiff}j ${mDiff}m`;
}

function requireLogin(req, res, next) {
  console.log('requireLogin, session:', req.session); // Debug: session on protected route
  if (!req.session.user) {
    console.log('User not logged in, redirecting to /login');
    return res.redirect('/login');
  }
  next();
}

// Routes

app.get('/', (req, res) => {
  res.redirect(req.session.user ? '/user-home' : '/login');
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  console.log('POST /login', { username, password }); // Debug: credentials submitted
  try {
    const user = await db.findUser(username, password);
    console.log('findUser result:', user); // Debug: user from DB
    if (!user) {
      console.log('Login failed: user not found or wrong password');
      return res.send('Login gagal! Username atau password salah. <a href="/login">Coba lagi</a>');
    }
    req.session.user = { id: user.id, username: user.username };
    console.log('Login successful. Session user set:', req.session.user); // Debug: session set
    res.redirect('/user-home');
  } catch (err) {
    console.log('Database error during login:', err);
    res.send('Database error: ' + err.message);
  }
})

app.get('/register', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'register.html'));
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.findUserByUsername(username);
    if (user) return res.send('Username sudah digunakan. <a href="/register">Coba lagi</a>');
    await db.createUser(username, password);
    res.send('Registrasi berhasil! <a href="/login">Login di sini</a>');
  } catch (err) {
    res.send('Database error: ' + err.message);
  }
});

app.get('/user-home', requireLogin, (req, res) => {
  console.log('/user-home, session.user:', req.session.user); // Debug: session in user-home
  res.sendFile(path.join(PUBLIC_DIR, 'user-home.html'));
});

app.get('/user-info', requireLogin, (req, res) => {
  res.json({ username: req.session.user.username });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/perekaman', requireLogin, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'perekaman.html'));
});

app.post('/perekaman', requireLogin, async (req, res) => {
  const data = {
    tanggal: req.body.tanggal,
    nama: req.body.nama,
    nama_perusahaan: req.body.nama_perusahaan,
    jam_mulai: req.body.jam_mulai,
    jam_selesai: req.body.jam_selesai,
    jenis_layanan: req.body.jenis_layanan,
    pertanyaan: req.body.pertanyaan,
    jawaban: req.body.jawaban,
    petugas: req.body.petugas || req.session.user.username
  };
  try {
    await db.createLayananRecord(data);
    res.redirect('/data');
  } catch (err) {
    res.send('Database error: ' + err.message);
  }
});

app.get('/data', requireLogin, async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  try {
    const records = await db.getAllLayananRecords();
    const totalRows = records.length;
    const totalPages = Math.ceil(totalRows / limit);
    const pagedRecords = records.slice(offset, offset + limit);

    let out = `
      <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Data Pengguna Layanan</title>
  <link rel="stylesheet" href="/data.css">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="center-container">
    <div class="data-box">
      <h2>Data Pengguna Layanan</h2>
      <input type="text" id="searchInput" class="data-search" placeholder="Cari data...">
      <button id="exportBtn" class="data-btn">Export to Excel</button><br>
      <table class="data-table" id="dataTable">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Nama</th>
            <th>Nama Perusahaan</th>
            <th>Jam Mulai</th>
            <th>Jam Selesai</th>
            <th>Total Waktu</th>
            <th>Jenis Layanan</th>
            <th>Pertanyaan</th>
            <th>Jawaban</th>
            <th>Petugas</th>
          </tr>
        </thead>
        <tbody>
    `;
    for (const r of pagedRecords) {
      out += `
          <tr>
            <td>${r.tanggal}</td>
            <td>${r.nama}</td>
            <td>${r.nama_perusahaan || ''}</td>
            <td>${r.jam_mulai}</td>
            <td>${r.jam_selesai}</td>
            <td>${calculateTotalWaktu(r.jam_mulai, r.jam_selesai)}</td>
            <td>${r.jenis_layanan || ''}</td>
            <td>${r.pertanyaan || ''}</td>
            <td>${r.jawaban || ''}</td>
            <td>${r.petugas || ''}</td>
          </tr>
      `;
    }
    out += `
        </tbody>
      </table>
      <div class="pagination">`;

    for (let i = 1; i <= totalPages; i++) {
      if (i === page) {
        out += `<span class="page-link active">${i}</span>`;
      } else {
        out += `<a href="/data?page=${i}" class="page-link">${i}</a>`;
      }
    }
    out += `
      </div>
      <div class="data-btns">
        <a href="/perekaman" class="data-btn">Tambah Data</a>
        <a href="/logout" class="data-btn">Logout</a>
        <a href="/user-home" class="data-btn">Kembali</a>
      </div>
    </div>
  </div>
  <div class="bg-animated"></div>
  <script>
    document.getElementById('searchInput').addEventListener('input', function() {
      const filter = this.value.toLowerCase();
      const rows = document.querySelectorAll('#dataTable tbody tr');
      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(filter) ? '' : 'none';
      });
    });
  </script>
  <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>
  <script>
document.getElementById('exportBtn').addEventListener('click', function() {
  var table = document.getElementById('dataTable');
  var wb = XLSX.utils.table_to_book(table, {sheet:"Sheet1"});
  XLSX.writeFile(wb, 'data_pengguna_layanan.xlsx');
});
</script>
</body>
</html>
    `;
    res.send(out);
  } catch (err) {
    res.send('Database error: ' + err.message);
  }
});

app.get('/visualisasi', requireLogin, async (req, res) => {
  function waktuStrToMinutes(waktuStr) {
    if (!waktuStr) return 0;
    let match = waktuStr.match(/(\d+)j/);
    let hours = match ? parseInt(match[1], 10) : 0;
    match = waktuStr.match(/(\d+)m/);
    let minutes = match ? parseInt(match[1], 10) : 0;
    return hours * 60 + minutes;
  }
  function minutesToWaktuStr(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}j ${m}m`;
  }
  try {
    const records = await db.getAllLayananRecords();
    let totalMinutes = 0;
    let count = 0;
    for (const r of records) {
      const waktuStr = calculateTotalWaktu(r.jam_mulai, r.jam_selesai);
      const mins = waktuStrToMinutes(waktuStr);
      if (mins > 0) {
        totalMinutes += mins;
        count++;
      }
    }
    const avgMinutes = count ? Math.round(totalMinutes / count) : 0;
    const avgWaktuStr = minutesToWaktuStr(avgMinutes);

    const layananCounts = {};
    for (const r of records) {
      const jenis = r.jenis_layanan || 'Lainnya';
      layananCounts[jenis] = (layananCounts[jenis] || 0) + 1;
    }
    const labels = Object.keys(layananCounts);
    const data = Object.values(layananCounts);

    const petugasCounts = {};
    for (const r of records) {
      const petugas = r.petugas || 'Lainnya';
      petugasCounts[petugas] = (petugasCounts[petugas] || 0) + 1;
    }
    const petugasLabels = Object.keys(petugasCounts);
    const petugasData = Object.values(petugasCounts);

    const dateCounts = {};
    for (const r of records) {
      const date = r.tanggal || r.date || 'Unknown Date';
      dateCounts[date] = (dateCounts[date] || 0) + 1;
    }
    const dateLabels = Object.keys(dateCounts).sort();
    const dateData = dateLabels.map(date => dateCounts[date]);

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Visualisasi Data Pengguna Layanan</title>
  <link rel="stylesheet" href="/data.css">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet">
</head>
<body>
  <div class="center-container">
    <div class="data-box">
      <h2>Visualisasi Data Pengguna Layanan</h2>
      <div class="charts-row">
       <div class="chart-container">
        <h3 class="chart-title">Jumlah Layanan berdasarkan Jenis Layanan</h3>
        <canvas id="myChart"></canvas>
      </div>
       <div class="chart-container">
        <h3 class="chart-title">Jumlah Layanan berdasarkan Petugas</h3>
        <canvas id="petugasPieChart"></canvas>
       </div> 
      </div>
      <div class="charts-row">
       <div class="chart-container">
        <h3 class="chart-title">Total Data per Tanggal</h3>
        <canvas id="dateLineChart"></canvas>
       </div>
       <div class="chart-container">
         <h3 class="chart-title">Rata-rata Waktu Layanan: ${avgWaktuStr}</h3>
       </div> 
      </div>
      <div class="data-btns">
        <a href="/data" class="data-btn">Data Pengguna Layanan</a>
        <a href="/perekaman" class="data-btn">Perekaman</a>
        <a href="/user-home" class="data-btn">Kembali</a>
      </div>
    </div>
  </div>
  <div class="bg-animated"></div>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script>
    const labels = ${JSON.stringify(labels)};
    const data = ${JSON.stringify(data)};
    const ctx = document.getElementById('myChart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Jumlah Jenis Layanan',
          data: data,
          backgroundColor: 'rgba(0,255,231,0.3)',
          borderColor: 'rgba(0,255,231,1)',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        }
      }
    });

    const petugasLabels = ${JSON.stringify(petugasLabels)};
    const petugasData = ${JSON.stringify(petugasData)};
    const pieCtx = document.getElementById('petugasPieChart').getContext('2d');
    const pieChart = new Chart(pieCtx, {
      type: 'pie',
      data: {
        labels: petugasLabels,
        datasets: [{
          label: 'Data Petugas',
          data: petugasData,
          backgroundColor: [
            '#00ffe7', '#ff6384', '#36a2eb', '#ffce56', '#8affc1', '#ffab91', '#81d4fa', '#c8e6c9'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true }
        }
      }
    });

    const dateLabels = ${JSON.stringify(dateLabels)};
    const dateData = ${JSON.stringify(dateData)};
    const lineCtx = document.getElementById('dateLineChart').getContext('2d');
    const lineChart = new Chart(lineCtx, {
      type: 'line',
      data: {
      labels: dateLabels,
      datasets: [{
      label: 'Jumlah Data per Tanggal',
      data: dateData,
      fill: false,
      borderColor: '#00ffe7',
      backgroundColor: '#00ffe7',
      tension: 0.2,
      pointRadius: 4,
      pointBackgroundColor: '#ff6384'
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { display: false }
    },
    scales: {
      x: { title: { display: true, text: 'Tanggal', color: '#00ffe7' }, ticks: { color: '#00ffe7' } },
      y: { title: { display: true, text: 'Jumlah', color: '#00ffe7' }, ticks: { color: '#00ffe7' } }
    }
  }
});
  </script>
</body>
</html>
    `);
  } catch (err) {
    res.send('Database error: ' + err.message);
  }
});

app.get('/show-users', requireLogin, async (req, res) => {
  try {
    const users = await db.listUsers();
    let out = `<h2>Registered Users</h2><ul>`;
    for (const user of users) {
      out += `<li>${user.username}</li>`;
    }
    out += `</ul><a href="/user-home">Back</a>`;
    res.send(out);
  } catch (err) {
    res.send('Database error: ' + err.message);
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Terjadi kesalahan server. Coba lagi nanti.');
});

// Export for Vercel
module.exports = app;
