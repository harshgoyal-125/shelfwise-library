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

test('student borrow requests need librarian approval', async () => {
  const lib = await login('librarian@shelfwise.demo', 'StaffPass#1');
  const adm = await login('admin@shelfwise.demo', 'StaffPass#1');
  const kabir = await login('kabir@shelfwise.demo', 'MemberPass#1');
  const diya = await login('diya@shelfwise.demo', 'MemberPass#1');
  const fac = await login('saanvi@shelfwise.demo', 'MemberPass#1');
  // a fresh student with no seeded loans, so counts are exact
  const reg = await call('POST', '/auth/register', { name: 'Riya Test', email: 'riya@x.io', password: 'password123' });
  assert.equal(reg.status, 201);
  const riya = reg.body.token;

  // faculty borrow directly, only students request
  assert.equal((await call('POST', '/requests', { bookId: (await call('GET', '/books?limit=1', null, fac)).body.items[0]._id }, fac)).status, 400);
  // staff issue directly, no request needed
  assert.equal((await call('POST', '/requests', { bookId: '507f1f77bcf86cd799439011' }, lib)).status, 400);

  const b = (await call('POST', '/books', { title: 'Request Book', author: 'R', category: 'Test', totalCopies: 2 }, adm)).body;
  // diya has an overdue seeded loan, so requesting is blocked
  assert.equal((await call('POST', '/requests', { bookId: b._id }, diya)).status, 400);
  // riya requests: pending, and no copy is taken yet
  const r1 = await call('POST', '/requests', { bookId: b._id }, riya);
  assert.equal(r1.status, 201);
  assert.equal(r1.body.status, 'pending');
  assert.equal((await call('GET', '/books/' + b._id, null, riya)).body.availableCopies, 2);
  assert.equal((await call('POST', '/requests', { bookId: b._id }, riya)).status, 409); // duplicate pending
  // catalog flags the book as requested by the student
  const cat = (await call('GET', '/books?q=Request%20Book', null, riya)).body.items.find((x) => x._id === b._id);
  assert.equal(cat.requestedByMe, true);
  // members cannot see the staff queue, staff can
  assert.equal((await call('GET', '/requests', null, riya)).status, 403);
  assert.ok((await call('GET', '/requests?status=pending', null, lib)).body.some((x) => x._id === r1.body._id));
  // students cannot approve
  assert.equal((await call('POST', `/requests/${r1.body._id}/approve`, null, riya)).status, 403);
  // kabir requests, then cancels his own pending request; others cannot cancel it
  const r2 = await call('POST', '/requests', { bookId: b._id }, kabir);
  assert.equal(r2.status, 201);
  assert.equal((await call('POST', `/requests/${r2.body._id}/cancel`, null, riya)).status, 403);
  assert.equal((await call('POST', `/requests/${r2.body._id}/cancel`, null, kabir)).status, 200);
  // librarian rejects: no loan, no copy taken
  const r3 = await call('POST', '/requests', { bookId: b._id }, kabir);
  assert.equal((await call('POST', `/requests/${r3.body._id}/reject`, null, lib)).status, 200);
  assert.equal((await call('GET', '/books/' + b._id, null, lib)).body.availableCopies, 2);
  assert.equal((await call('GET', '/loans/mine', null, kabir)).body.filter((l) => l.book && l.book.title === 'Request Book').length, 0);
  // librarian approves: the loan starts now, and only now does the copy count drop
  const ok = await call('POST', `/requests/${r1.body._id}/approve`, null, lib);
  assert.equal(ok.status, 200);
  assert.ok(ok.body.dueAt);
  assert.equal((await call('GET', '/books/' + b._id, null, lib)).body.availableCopies, 1);
  assert.ok((await call('GET', '/loans/mine', null, riya)).body.some((l) => l.book && l.book.title === 'Request Book' && !l.returnedAt));
  // decided requests cannot be re-decided or cancelled
  assert.equal((await call('POST', `/requests/${r1.body._id}/approve`, null, lib)).status, 409);
  assert.equal((await call('POST', `/requests/${r1.body._id}/cancel`, null, riya)).status, 409);
  // approval respects availability: request while a copy is free, then the copy goes, approval fails and the request stays pending
  const g = (await call('POST', '/books', { title: 'Gone Book', author: 'G', category: 'Test', totalCopies: 1 }, adm)).body;
  const r4 = await call('POST', '/requests', { bookId: g._id }, kabir);
  assert.equal(r4.status, 201);
  assert.equal((await call('POST', '/loans', { bookId: g._id }, fac)).status, 201); // faculty takes the only copy directly
  assert.equal((await call('POST', `/requests/${r4.body._id}/approve`, null, lib)).status, 409);
  assert.equal((await call('GET', '/requests?status=pending', null, lib)).body.some((x) => x._id === r4.body._id), true);
  assert.equal((await call('POST', `/requests/${r4.body._id}/cancel`, null, kabir)).status, 200);
  // requesting a book with no copies available points at reserving instead
  assert.equal((await call('POST', '/requests', { bookId: g._id }, kabir)).status, 409);
  // pending requests count toward the borrowing limit (kabir: 2 seeded active loans, max 3)
  const c1 = (await call('POST', '/books', { title: 'Limit One', author: 'L', category: 'Test', totalCopies: 1 }, adm)).body;
  const c2 = (await call('POST', '/books', { title: 'Limit Two', author: 'L', category: 'Test', totalCopies: 1 }, adm)).body;
  assert.equal((await call('POST', '/requests', { bookId: c1._id }, kabir)).status, 201);
  assert.equal((await call('POST', '/requests', { bookId: c2._id }, kabir)).status, 400);
  // archived books cannot be requested
  assert.equal((await call('PUT', '/books/' + c2._id, { archived: true }, adm)).status, 200);
  assert.equal((await call('POST', '/requests', { bookId: c2._id }, riya)).status, 409);
  // stats expose the pending queue
  assert.ok((await call('GET', '/stats', null, lib)).body.pendingRequests >= 1);
});
