require('./env');
const mongoose = require('mongoose');
const { createApp } = require('./app');
const { seed } = require('./seed');

const missing = ['MONGODB_URI', 'JWT_SECRET'].filter((k) => !process.env[k]);
if (missing.length) { console.error('Missing env: ' + missing.join(', ')); process.exit(1); }

// Bind the port first so hosts that health-check the port see the app quickly.
const port = process.env.PORT || 4000;
createApp().listen(port, '0.0.0.0', () => console.log('ShelfWise listening on ' + port));

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
  console.log('MongoDB connected');
  const pw = ['ADMIN', 'LIBRARIAN', 'FACULTY', 'STUDENT'].map((r) => process.env['SEED_' + r + '_PASSWORD']);
  if (pw.every(Boolean)) {
    const did = await seed({
      adminPassword: pw[0], librarianPassword: pw[1], facultyPassword: pw[2], studentPassword: pw[3],
      reset: process.env.SEED_RESET === 'true',
    });
    console.log(did ? 'Seeded demo data' : 'Database already has data');
  }
})().catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
