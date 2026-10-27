process.env.NODE_ENV = 'test';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/app');
const { seed } = require('../src/seed');

let mongod, server, base;
const call = async (method, path, body, token) => {
  const r = await fetch(base + '/api' + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const login = async (email, pw) => (await call('POST', '/auth/login', { email, password: pw })).body.token;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await seed({ adminPassword: 'StaffPass#1', memberPassword: 'MemberPass#1' });
  server = createApp({ jwtSecret: 'test-secret' }).listen(0);
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { server.close(); await mongoose.disconnect(); await mongod.stop(); });

test('login works, wrong password and operator injection rejected', async () => {
  assert.ok(await login('admin@shelfwise.demo', 'StaffPass#1'));
  assert.equal((await call('POST', '/auth/login', { email: 'admin@shelfwise.demo', password: 'nope' })).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: { $gt: '' }, password: { $gt: '' } })).status, 400);
});
test('API requires login', async () => {
  assert.equal((await call('GET', '/books')).status, 401);
});
test('role permissions', async () => {
  const st = await login('student@shelfwise.demo', 'MemberPass#1');
  const lib = await login('librarian@shelfwise.demo', 'StaffPass#1');
  const adm = await login('admin@shelfwise.demo', 'StaffPass#1');
  const newBook = { title: 'T', author: 'A', category: 'Test', totalCopies: 2 };
  assert.equal((await call('POST', '/books', newBook, st)).status, 403);
  assert.equal((await call('GET', '/stats', null, st)).status, 403);
  assert.equal((await call('GET', '/members', null, st)).status, 403);
  const created = await call('POST', '/books', newBook, lib);
  assert.equal(created.status, 201);
  assert.equal((await call('DELETE', '/books/' + created.body._id, null, lib)).status, 403);
  assert.equal((await call('DELETE', '/books/' + created.body._id, null, adm)).status, 200);
  assert.equal((await call('GET', '/staff', null, lib)).status, 403);
  assert.equal((await call('GET', '/staff', null, adm)).status, 200);
  const nu = await call('POST', '/users', { name: 'New Lib', email: 'n@x.io', password: 'longenough1', role: 'librarian' }, adm);
  assert.equal(nu.status, 201);
  assert.equal((await call('POST', '/users', { name: 'X', email: 'bad', password: 'x', role: 'admin' }, adm)).status, 400);
});
test('borrow, limits, renew, return', async () => {
  const fac = await login('faculty@shelfwise.demo', 'MemberPass#1');
  const st = await login('diya@shelfwise.demo', 'MemberPass#1');
  const books = (await call('GET', '/books?limit=48&available=true', null, st)).body.items;
  // diya has an overdue seeded loan, so borrowing is blocked
  assert.equal((await call('POST', '/loans', { bookId: books[0]._id }, st)).status, 400);
  const kab = await login('kabir@shelfwise.demo', 'MemberPass#1');
  const b = books.find((x) => x.title === 'Digital Design');
  const l = await call('POST', '/loans', { bookId: b._id }, kab);
  assert.equal(l.status, 201);
  assert.equal((await call('POST', '/loans', { bookId: b._id }, kab)).status, 400); // duplicate
  const ren = await call('POST', `/loans/${l.body._id}/renew`, null, kab);
  assert.equal(ren.status, 200);
  assert.equal((await call('POST', `/loans/${l.body._id}/renew`, null, kab)).status, 400); // limit
  assert.equal((await call('POST', `/loans/${l.body._id}/return`, null, st)).status, 403); // not theirs
  assert.equal((await call('POST', `/loans/${l.body._id}/return`, null, kab)).status, 200);
  assert.equal((await call('POST', `/loans/${l.body._id}/return`, null, kab)).status, 409);
  const after = await call('GET', '/books/' + b._id, null, kab);
  assert.equal(after.body.availableCopies, b.availableCopies);
  // faculty gets longer loan period than students
  const fl = await call('POST', '/loans', { bookId: b._id }, fac);
  assert.equal(fl.status, 201);
  const days = Math.round((new Date(fl.body.dueAt) - new Date(fl.body.issuedAt)) / 86400000);
  assert.equal(days, 30);
});
test('last copy cannot be double-borrowed', async () => {
  const adm = await login('admin@shelfwise.demo', 'StaffPass#1');
  const b = (await call('POST', '/books', { title: 'One Copy', author: 'X', category: 'Test', totalCopies: 1 }, adm)).body;
  const tok = await Promise.all(['meera@shelfwise.demo', 'saanvi@shelfwise.demo'].map((e) => login(e, 'MemberPass#1')));
  const rs = await Promise.all(tok.map((t) => call('POST', '/loans', { bookId: b._id }, t)));
  assert.equal(rs.filter((r) => r.status === 201).length, 1);
});
test('register creates a student; staff can issue to a member', async () => {
  const r = await call('POST', '/auth/register', { name: 'Test User', email: 'tu@x.io', password: 'password123' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, 'student');
  const lib = await login('librarian@shelfwise.demo', 'StaffPass#1');
  const book = (await call('GET', '/books?limit=1&available=true', null, lib)).body.items[0];
  const iss = await call('POST', '/loans', { bookId: book._id, memberId: r.body.user.id }, lib);
  assert.equal(iss.status, 201);
  assert.equal((await call('POST', '/loans', { bookId: book._id }, lib)).status, 400); // no member chosen
});
test('reservation queue: reserve when out, hold copies, FIFO position, cancel', async () => {
  const adm = await login('admin@shelfwise.demo', 'StaffPass#1');
  const b = (await call('POST', '/books', { title: 'Queue Book', author: 'Q', category: 'Test', totalCopies: 1 }, adm)).body;
  const meera = await login('kabir@shelfwise.demo', 'MemberPass#1');
  const kab = await login('faculty@shelfwise.demo', 'MemberPass#1');
  const rohan = await login('meera@shelfwise.demo', 'MemberPass#1');
  assert.equal((await call('POST', '/loans', { bookId: b._id }, kab)).status, 201);
  // copy is out -> borrowing fails with a reserve hint, reserving works
  const nope = await call('POST', '/loans', { bookId: b._id }, rohan);
  assert.equal(nope.status, 409);
  const r1 = await call('POST', '/reservations', { bookId: b._id }, rohan);
  assert.equal(r1.status, 201);
  assert.equal(r1.body.position, 1);
  assert.equal((await call('POST', '/reservations', { bookId: b._id }, rohan)).status, 409); // duplicate
  assert.equal((await call('POST', '/reservations', { bookId: b._id }, kab)).status, 409); // already has it
  const mine = await call('GET', '/reservations/mine', null, rohan);
  assert.equal(mine.body.filter((r) => r.status === 'waiting').length >= 1, true);
  // return the copy: it is held for the queue, so a non-queued member cannot take it
  const loans = (await call('GET', '/loans/mine', null, kab)).body;
  const loan = loans.find((l) => l.book && l.book.title === 'Queue Book');
  assert.equal((await call('POST', `/loans/${loan._id}/return`, null, kab)).status, 200);
  const other = await login('saanvi@shelfwise.demo', 'MemberPass#1');
  assert.equal((await call('POST', '/loans', { bookId: b._id }, other)).status, 409);
  // the queued member can borrow it, which fulfils the reservation
  assert.equal((await call('POST', '/loans', { bookId: b._id }, rohan)).status, 201);
  const after = (await call('GET', '/reservations/mine', null, rohan)).body.filter((r) => String(r.book._id) === b._id);
  assert.equal(after[0].status, 'fulfilled');
  // staff list + cancel + permissions
  const r2 = await call('POST', '/reservations', { bookId: b._id }, meera);
  assert.equal(r2.status, 201);
  assert.equal((await call('GET', '/reservations', null, meera)).status, 403);
  assert.equal((await call('GET', '/reservations', null, adm)).status, 200);
  assert.equal((await call('DELETE', '/reservations/' + r2.body._id, null, rohan)).status, 403);
  assert.equal((await call('DELETE', '/reservations/' + r2.body._id, null, meera)).status, 200);
});

test('archived books are hidden from the catalog, cannot be borrowed, but history still resolves', async () => {
  const adm = await login('admin@shelfwise.demo', 'StaffPass#1');
  const mem = await login('meera@shelfwise.demo', 'MemberPass#1');
  const all = (await call('GET', '/books?limit=48', null, adm)).body.items;
  const b = all.find((x) => x.title === 'Structural Analysis');
  assert.equal((await call('PUT', '/books/' + b._id, { archived: true }, adm)).status, 200);
  const after = (await call('GET', '/books?limit=48', null, adm)).body;
  assert.equal(after.items.some((x) => x._id === b._id), false);
  assert.equal((await call('GET', '/books/' + b._id, null, adm)).status, 200);
  assert.equal((await call('POST', '/loans', { bookId: b._id }, mem)).status, 409);
  assert.equal((await call('POST', '/reservations', { bookId: b._id }, mem)).status, 409);
  assert.equal((await call('PUT', '/books/' + b._id, { archived: false }, adm)).status, 200);
});
