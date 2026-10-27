require('./env');
const mongoose = require('mongoose');
const { createApp } = require('./app');
const { seed } = require('./seed');

const required = ['MONGODB_URI', 'JWT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) { console.error('Missing env: ' + missing.join(', ')); process.exit(1); }

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  if (process.env.SEED_ADMIN_PASSWORD && process.env.SEED_MEMBER_PASSWORD) {
    const did = await seed({
      adminPassword: process.env.SEED_ADMIN_PASSWORD,
      memberPassword: process.env.SEED_MEMBER_PASSWORD,
      reset: process.env.SEED_RESET === 'true',
    });
    if (did) console.log('Seeded demo data');
  }
  const port = process.env.PORT || 4000;
  createApp().listen(port, () => console.log('ShelfWise listening on ' + port));
})().catch((e) => { console.error(e); process.exit(1); });
