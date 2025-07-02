const express = require('express');
const router = express.Router();
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./db.js');
const app = express();
const PORT = 3000;

function calculateTotalWaktu(jamMulai, jamSelesai) {
  // jamMulai/jamSelesai in "HH:mm" format
  if (!jamMulai || !jamSelesai) return '';
  const [hStart, mStart] = jamMulai.split(':').map(Number);
  const [hEnd, mEnd] = jamSelesai.split(':').map(Number);
  let start = hStart * 60 + mStart;
  let end = hEnd * 60 + mEnd;
  // Handle if selesai is past midnight
  if (end < start) end += 24 * 60;
  const diff = end - start;
  const hDiff = Math.floor(diff / 60);
  const mDiff = diff % 60;
  return `${hDiff}j ${mDiff}m`;
}

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'your_secret_key', // Change this to a random string in production!
  resave: false,
  saveUninitialized: true
}));

// Middleware for login protection
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// Home Page (redirect to login or user home)
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/user-home');
  } else {
    res.redirect('/login');
  }
});

// Login Page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login Handler
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.findUser(username, password, (err, user) => {
    if (err) return res.send('Database error: ' + err.message);
    if (!user) return res.send('Login gagal! Username atau password salah. <a href="/login">Coba lagi</a>');
    req.session.user = { id: user.id, username: user.username };
    res.redirect('/user-home');
  });
});

// Register Page
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Register Handler
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.findUserByUsername(username, (err, user) => {
    if (err) return res.send('Database error: ' + err.message);
    if (user) return res.send('Username sudah digunakan. <a href="/register">Coba lagi</a>');
    db.createUser(username, password, (err, id) => {
      if (err) return res.send('Database error: ' + err.message);
      res.send('Registrasi berhasil! <a href="/login">Login di sini</a>');
    });
  });
});

// User Home
app.get('/user-home', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user-home.html'));
});

app.get('/user-info', requireLogin, (req, res) => {
  res.json({ username: req.session.user.username });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// Show form (Menu Perekaman Pengguna Layanan)
app.get('/perekaman', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'perekaman.html'));
});

// Handle form submit
app.post('/perekaman', requireLogin, (req, res) => {
  const data = {
    tanggal: req.body.tanggal,
    nama: req.body.nama,
    nama_perusahaan: req.body.nama_perusahaan,
    jam_mulai: req.body.jam_mulai,
    jam_selesai: req.body.jam_selesai,
    jenis_layanan: req.body.jenis_layanan,
    pertanyaan: req.body.pertanyaan,
    jawaban: req.body.jawaban,
    petugas: req.body.petugas || req.session.user.username // fallback to logged-in user
  };
  db.createLayananRecord(data, (err, id) => {
    if (err) return res.send('Database error: ' + err.message);
    res.redirect('/data');
  });
});

// Show data list (Menu Data Pengguna Layanan)
app.get('/data', requireLogin, (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  db.getAllLayananRecords((err, records) => {
    if (err) return res.send('Database error: ' + err.message);
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

    // Pagination controls
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
    // Simple client-side table search
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
  // Get the table element
  var table = document.getElementById('dataTable');
  // Convert the table to a worksheet
  var wb = XLSX.utils.table_to_book(table, {sheet:"Sheet1"});
  // Export it to file
  XLSX.writeFile(wb, 'data_pengguna_layanan.xlsx');
});
</script>
</body>
</html>
    `;
    res.send(out);
  });
});

// Visualisasi Data Pengguna Layanan - chart page
app.get('/visualisasi', requireLogin, (req, res) => {
  db.getAllLayananRecords((err, records) => {
    if (err) return res.send('Database error: ' + err.message);

    // --- Average Total Waktu Calculation ---
    let totalMinutes = 0;
    let count = 0;
    for (const r of records) {
      // Calculate total waktu directly from jam_mulai and jam_selesai
      const waktuStr = calculateTotalWaktu(r.jam_mulai, r.jam_selesai);
      const mins = waktuStrToMinutes(waktuStr);
      if (mins > 0) {
        totalMinutes += mins;
        count++;
      }
    }
    const avgMinutes = count ? Math.round(totalMinutes / count) : 0;
    const avgWaktuStr = minutesToWaktuStr(avgMinutes);

    // count per Jenis Layanan
    const layananCounts = {};
    for (const r of records) {
      const jenis = r.jenis_layanan || 'Lainnya';
      layananCounts[jenis] = (layananCounts[jenis] || 0) + 1;
    }
    const labels = Object.keys(layananCounts);
    const data = Object.values(layananCounts);

    // Count per Petugas for the pie chart
    const petugasCounts = {};
    for (const r of records) {
      const petugas = r.petugas || 'Lainnya';
      petugasCounts[petugas] = (petugasCounts[petugas] || 0) + 1;
    }
    const petugasLabels = Object.keys(petugasCounts);
    const petugasData = Object.values(petugasCounts);

    // Group total data per date for the line chart
    const dateCounts = {};
    for (const r of records) {
      const date = r.tanggal || r.date || 'Unknown Date';
      dateCounts[date] = (dateCounts[date] || 0) + 1;
    }
    const dateLabels = Object.keys(dateCounts).sort(); // To ensure chronological order
    const dateData = dateLabels.map(date => dateCounts[date]);

    // Helper functions for time conversion
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

    // Send the HTML response (unchanged except for the above fix)
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
    // Bar chart for Jenis Layanan
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

    // Pie chart for Petugas
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
   // Line chart for total data per date
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
  });
});

// Optional: List registered users (for admin/testing only)
app.get('/show-users', requireLogin, (req, res) => {
  db.listUsers((err, users) => {
    if (err) return res.send('Database error: ' + err.message);
    let out = `<h2>Registered Users</h2><ul>`;
    for (const user of users) {
      out += `<li>${user.username}</li>`;
    }
    out += `</ul><a href="/user-home">Back</a>`;
    res.send(out);
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});