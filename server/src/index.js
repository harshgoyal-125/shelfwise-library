require('./env');
const mongoose = require('mongoose');
const { createApp } = require('./app');
const { seed } = require('./seed');

const required = ['MONGODB_URI', 'JWT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) { console.error('Missing env: ' + missing.join(', ')); process.exit(1); }

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const sp = ['ADMIN', 'LIBRARIAN', 'FACULTY', 'STUDENT'].map((r) => process.env['SEED_' + r + '_PASSWORD']);
  if (sp.every(Boolean)) {
    const did = await seed({
      adminPassword: sp[0], librarianPassword: sp[1], facultyPassword: sp[2], studentPassword: sp[3],
      reset: process.env.SEED_RESET === 'true',
    });
    if (did) console.log('Seeded demo data');
  }
  const port = process.env.PORT || 4000;
  createApp().listen(port, () => console.log('ShelfWise listening on ' + port));
})().catch((e) => { console.error(e); process.exit(1); });
