const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User, Book, Loan, Reservation } = require('./models');
const cfg = require('./config');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const validId = (id) => mongoose.isValidObjectId(id);
const str = (v) => (typeof v === 'string' ? v : '');
const DAY = 24 * 3600 * 1000;

function fineFor(loan, at = new Date()) {
  const end = loan.returnedAt || at;
  const late = Math.floor((end - loan.dueAt) / DAY);
  return late > 0 ? late * cfg.FINE_PER_DAY : 0;
}
function loanView(l) {
  const o = l.toObject ? l.toObject() : l;
  return { ...o, fine: o.returnedAt ? o.fine : fineFor(o), overdue: !o.returnedAt && new Date(o.dueAt) < new Date() };
}

function createApp({ jwtSecret, clientDir } = {}) {
  const app = express();
  const secret = jwtSecret || process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'], scriptSrc: ["'self'"], connectSrc: ["'self'"] } },
  }));
  app.use(compression());
  app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false }));
  app.use(express.json({ limit: '50kb' }));
  // block NoSQL operator injection ($ / dotted keys) in request bodies
  app.use((req, res, next) => {
    const scan = (o) => o && typeof o === 'object' && Object.keys(o).some((k) => k.startsWith('$') || k.includes('.') || scan(o[k]));
    if (scan(req.body)) return bad(res, 'Invalid input');
    next();
  });

  const sign = (u) => jwt.sign({ id: u._id, role: u.role }, secret, { expiresIn: '8h' });
  const auth = wrap(async (req, res, next) => {
    const h = req.headers.authorization || '';
    if (!h.startsWith('Bearer ')) return bad(res, 'Login required', 401);
    let p;
    try { p = jwt.verify(h.slice(7), secret); } catch { return bad(res, 'Session expired, please log in again', 401); }
    const user = await User.findById(p.id);
    if (!user || !user.active) return bad(res, 'Account unavailable', 401);
    req.user = user;
    next();
  });
  const staff = (req, res, next) => (cfg.STAFF.includes(req.user.role) ? next() : bad(res, 'Library staff only', 403));
  const admin = (req, res, next) => (req.user.role === 'admin' ? next() : bad(res, 'Admins only', 403));
  const isStaff = (u) => cfg.STAFF.includes(u.role);
  const pub = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, memberId: u.memberId, phone: u.phone, active: u.active, createdAt: u.createdAt });

  const api = express.Router();
  api.get('/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: process.env.NODE_ENV === 'test' ? 1000 : 20, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts, try again later' } });
  api.post('/auth/login', loginLimiter, wrap(async (req, res) => {
    const email = str(req.body.email).toLowerCase().trim();
    const password = str(req.body.password);
    const user = email && await User.findOne({ email });
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) return bad(res, 'Wrong email or password', 401);
    res.json({ token: sign(user), user: pub(user) });
  }));
  api.post('/auth/register', loginLimiter, wrap(async (req, res) => {
    const name = str(req.body.name).trim();
    const email = str(req.body.email).toLowerCase().trim();
    const password = str(req.body.password);
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return bad(res, 'Enter a name, a valid email and a password of at least 8 characters');
    if (await User.findOne({ email })) return bad(res, 'That email is already registered', 409);
    const n = await User.countDocuments({ role: { $in: ['student', 'faculty'] } });
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 10), role: 'student', memberId: 'LIB-' + (1001 + n) + '-' + Math.random().toString(36).slice(2, 5).toUpperCase() });
    res.status(201).json({ token: sign(user), user: pub(user) });
  }));
  api.get('/auth/me', auth, (req, res) => res.json({ user: pub(req.user) }));

  // ---- Books (read: any logged-in user)
  api.get('/books', auth, wrap(async (req, res) => {
    const q = str(req.query.q).trim().slice(0, 80);
    const category = str(req.query.category).trim();
    const available = req.query.available === 'true';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(48, Math.max(1, parseInt(req.query.limit) || 12));
    const filter = { archived: { $ne: true } };
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { author: rx }, { category: rx }, { isbn: rx }];
    }
    if (category) filter.category = category;
    if (available) filter.availableCopies = { $gt: 0 };
    const [items, total] = await Promise.all([
      Book.find(filter).sort({ title: 1 }).skip((page - 1) * limit).limit(limit),
      Book.countDocuments(filter),
    ]);
    const waits = await Reservation.aggregate([{ $match: { status: 'waiting', book: { $in: items.map((b) => b._id) } } }, { $group: { _id: '$book', n: { $sum: 1 } } }]);
    const wm = Object.fromEntries(waits.map((w) => [String(w._id), w.n]));
    const mine = await Reservation.find({ member: req.user._id, status: 'waiting', book: { $in: items.map((b) => b._id) } }).select('book');
    const mset = new Set(mine.map((r) => String(r.book)));
    res.json({
      items: items.map((b) => ({ ...b.toObject(), waiting: wm[String(b._id)] || 0, reservedByMe: mset.has(String(b._id)) })),
      total, page, pages: Math.max(1, Math.ceil(total / limit)),
    });
  }));
  api.get('/books/categories', auth, wrap(async (req, res) => res.json(await Book.distinct('category', { archived: { $ne: true } }).then((c) => c.sort()))));
  api.get('/books/:id', auth, wrap(async (req, res) => {
    if (!validId(req.params.id)) return bad(res, 'Book not found', 404);
    const book = await Book.findById(req.params.id);
    if (!book) return bad(res, 'Book not found', 404);
    res.json(book);
  }));

  const bookFields = (b) => {
    const out = {
      title: str(b.title).trim(), author: str(b.author).trim(), category: str(b.category).trim(),
      isbn: str(b.isbn).trim(), description: str(b.description).trim(), shelf: str(b.shelf).trim(),
      year: b.year === '' || b.year == null ? undefined : Number(b.year),
      totalCopies: Number(b.totalCopies),
    };
    return out;
  };
  const checkBook = (b) => {
    if (!b.title || !b.author || !b.category) return 'Title, author and category are required';
    if (!Number.isInteger(b.totalCopies) || b.totalCopies < 1 || b.totalCopies > 500) return 'Copies must be a whole number from 1 to 500';
    if (b.year !== undefined && (!Number.isInteger(b.year) || b.year < 0 || b.year > 3000)) return 'Invalid year';
    return null;
  };
  api.post('/books', auth, staff, wrap(async (req, res) => {
    const b = bookFields(req.body);
    const err = checkBook(b);
    if (err) return bad(res, err);
    res.status(201).json(await Book.create({ ...b, availableCopies: b.totalCopies }));
  }));
  api.put('/books/:id', auth, staff, wrap(async (req, res) => {
    if (!validId(req.params.id)) return bad(res, 'Book not found', 404);
    const book = await Book.findById(req.params.id);
    if (!book) return bad(res, 'Book not found', 404);
    if (typeof req.body.archived === 'boolean') book.archived = req.body.archived;
    const b = bookFields({ ...book.toObject(), ...req.body });
    const err = checkBook(b);
    if (err) return bad(res, err);
    const out = book.totalCopies - book.availableCopies;
    if (b.totalCopies < out) return bad(res, `${out} copies are currently on loan, total can't be lower`);
    Object.assign(book, b, { availableCopies: b.totalCopies - out });
    await book.save();
    res.json(book);
  }));
  api.delete('/books/:id', auth, admin, wrap(async (req, res) => {
    if (!validId(req.params.id)) return bad(res, 'Book not found', 404);
    if (await Loan.exists({ book: req.params.id, returnedAt: null })) return bad(res, 'This book has active loans', 409);
    const r = await Book.findByIdAndDelete(req.params.id);
    if (!r) return bad(res, 'Book not found', 404);
    await Reservation.deleteMany({ book: req.params.id });
    res.json({ ok: true });
  }));

  // ---- Loans
  async function issue(bookId, member) {
    const pol = cfg.POLICY[member.role];
    if (!pol) return { error: 'Staff accounts cannot borrow books' };
    const target = await Book.findById(bookId).select('archived');
    if (target && target.archived) return { error: 'This book is no longer in the catalog', code: 409 };
    const active = await Loan.find({ member: member._id, returnedAt: null });
    if (active.length >= pol.maxLoans) return { error: `Limit reached: ${member.role}s can borrow at most ${pol.maxLoans} books at a time` };
    if (active.some((l) => String(l.book) === String(bookId))) return { error: 'This member already has this book' };
    if (active.some((l) => l.dueAt < new Date())) return { error: 'Return overdue books before borrowing more' };
    // copies are held for members waiting in the reservation queue
    const waitingOthers = await Reservation.countDocuments({ book: bookId, status: 'waiting', member: { $ne: member._id } });
    const current = await Book.findById(bookId);
    if (!current) return { error: 'Book not found', code: 404 };
    if (current.archived) return { error: 'This book is no longer in the catalog', code: 409 };
    if (current.availableCopies - waitingOthers < 1) {
      return { error: current.availableCopies > 0 ? 'The available copies are held for members in the reservation queue' : 'No copies available right now. You can reserve it instead.', code: 409 };
    }
    // atomic decrement prevents overselling the last copy
    const book = await Book.findOneAndUpdate({ _id: bookId, availableCopies: { $gt: 0 } }, { $inc: { availableCopies: -1 } }, { new: true });
    if (!book) return { error: 'No copies available right now', code: 409 };
    const loan = await Loan.create({ book: bookId, member: member._id, dueAt: new Date(Date.now() + pol.days * DAY) });
    await Reservation.updateMany({ book: bookId, member: member._id, status: 'waiting' }, { status: 'fulfilled' });
    return { loan };
  }
  api.post('/loans', auth, wrap(async (req, res) => {
    const bookId = str(req.body.bookId);
    if (!validId(bookId)) return bad(res, 'Book not found', 404);
    let member = req.user;
    if (isStaff(req.user)) {
      const mid = str(req.body.memberId);
      if (!validId(mid)) return bad(res, 'Choose a member');
      member = await User.findOne({ _id: mid, role: { $in: ['student', 'faculty'] }, active: true });
      if (!member) return bad(res, 'Member not found', 404);
    }
    const r = await issue(bookId, member);
    if (r.error) return bad(res, r.error, r.code || 400);
    res.status(201).json(loanView(r.loan));
  }));
  api.get('/loans/mine', auth, wrap(async (req, res) => {
    const loans = await Loan.find({ member: req.user._id }).populate('book', 'title author category').sort({ issuedAt: -1 });
    res.json(loans.map(loanView));
  }));
  api.get('/loans', auth, staff, wrap(async (req, res) => {
    const status = str(req.query.status);
    const filter = {};
    if (status === 'active') filter.returnedAt = null;
    if (status === 'returned') filter.returnedAt = { $ne: null };
    if (status === 'overdue') { filter.returnedAt = null; filter.dueAt = { $lt: new Date() }; }
    const loans = await Loan.find(filter).populate('book', 'title author').populate('member', 'name memberId email').sort({ issuedAt: -1 }).limit(200);
    res.json(loans.map(loanView));
  }));
  api.post('/loans/:id/return', auth, wrap(async (req, res) => {
    if (!validId(req.params.id)) return bad(res, 'Loan not found', 404);
    const loan = await Loan.findById(req.params.id);
    if (!loan) return bad(res, 'Loan not found', 404);
    if (!isStaff(req.user) && String(loan.member) !== String(req.user._id)) return bad(res, 'Not your loan', 403);
    if (loan.returnedAt) return bad(res, 'Already returned', 409);
    const done = await Loan.findOneAndUpdate({ _id: loan._id, returnedAt: null }, { returnedAt: new Date(), fine: fineFor(loan) }, { new: true });
    if (!done) return bad(res, 'Already returned', 409);
    await Book.updateOne({ _id: loan.book }, { $inc: { availableCopies: 1 } });
    res.json(loanView(done));
  }));
  api.post('/loans/:id/renew', auth, wrap(async (req, res) => {
    if (!validId(req.params.id)) return bad(res, 'Loan not found', 404);
    const loan = await Loan.findById(req.params.id);
    if (!loan) return bad(res, 'Loan not found', 404);
    if (!isStaff(req.user) && String(loan.member) !== String(req.user._id)) return bad(res, 'Not your loan', 403);
    if (loan.returnedAt) return bad(res, 'Already returned', 409);
    if (loan.dueAt < new Date()) return bad(res, 'Overdue loans cannot be renewed, please return the book');
    if (loan.renewals >= cfg.MAX_RENEWALS) return bad(res, 'Renewal limit reached');
    loan.dueAt = new Date(loan.dueAt.getTime() + (cfg.POLICY[(await User.findById(loan.member)).role] || cfg.POLICY.student).renewDays * DAY);
    loan.renewals += 1;
    await loan.save();
    res.json(loanView(loan));
  }));

  // ---- Reservations (FIFO queue per book)
  const queueInfo = async (r) => {
    const o = r.toObject ? r.toObject() : r;
    if (o.status !== 'waiting') return o;
    const ahead = await Reservation.countDocuments({ book: o.book._id || o.book, status: 'waiting', createdAt: { $lt: o.createdAt } });
    return { ...o, position: ahead + 1 };
  };
  api.post('/reservations', auth, wrap(async (req, res) => {
    const bookId = str(req.body.bookId);
    if (!validId(bookId)) return bad(res, 'Book not found', 404);
    let member = req.user;
    if (isStaff(req.user)) {
      const mid = str(req.body.memberId);
      if (!validId(mid)) return bad(res, 'Choose a member');
      member = await User.findOne({ _id: mid, role: { $in: ['student', 'faculty'] }, active: true });
      if (!member) return bad(res, 'Member not found', 404);
    }
    if (!cfg.POLICY[member.role]) return bad(res, 'Staff accounts cannot reserve books');
    const book = await Book.findById(bookId);
    if (!book) return bad(res, 'Book not found', 404);
    if (book.archived) return bad(res, 'This book is no longer in the catalog', 409);
    if (await Loan.exists({ book: bookId, member: member._id, returnedAt: null })) return bad(res, 'You already have this book', 409);
    if (await Reservation.exists({ book: bookId, member: member._id, status: 'waiting' })) return bad(res, 'Already in the queue for this book', 409);
    const waiting = await Reservation.countDocuments({ book: bookId, status: 'waiting' });
    if (book.availableCopies - waiting >= 1) return bad(res, 'A copy is available now, borrow it instead', 409);
    const r = await Reservation.create({ book: bookId, member: member._id });
    res.status(201).json(await queueInfo(r));
  }));
  api.get('/reservations/mine', auth, wrap(async (req, res) => {
    const list = await Reservation.find({ member: req.user._id }).populate('book', 'title author availableCopies').sort({ createdAt: -1 }).limit(50);
    res.json(await Promise.all(list.map(queueInfo)));
  }));
  api.get('/reservations', auth, staff, wrap(async (req, res) => {
    const list = await Reservation.find({ status: 'waiting' }).populate('book', 'title author availableCopies').populate('member', 'name memberId').sort({ createdAt: 1 }).limit(200);
    res.json(await Promise.all(list.map(queueInfo)));
  }));
  api.delete('/reservations/:id', auth, wrap(async (req, res) => {
    if (!validId(req.params.id)) return bad(res, 'Reservation not found', 404);
    const r = await Reservation.findById(req.params.id);
    if (!r) return bad(res, 'Reservation not found', 404);
    if (!isStaff(req.user) && String(r.member) !== String(req.user._id)) return bad(res, 'Not your reservation', 403);
    if (r.status !== 'waiting') return bad(res, 'Reservation is no longer active', 409);
    r.status = 'cancelled';
    await r.save();
    res.json({ ok: true });
  }));

  // ---- Members (admin)
  api.get('/members', auth, staff, wrap(async (req, res) => {
    const members = await User.find({ role: { $in: ['student', 'faculty'] } }).sort({ name: 1 });
    const counts = await Loan.aggregate([{ $match: { returnedAt: null } }, { $group: { _id: '$member', n: { $sum: 1 } } }]);
    const map = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    res.json(members.map((m) => ({ ...pub(m), activeLoans: map[String(m._id)] || 0 })));
  }));
  api.patch('/members/:id', auth, staff, wrap(async (req, res) => {
    if (!validId(req.params.id)) return bad(res, 'Member not found', 404);
    const m = await User.findOne({ _id: req.params.id, role: { $in: ['student', 'faculty'] } });
    if (!m) return bad(res, 'Member not found', 404);
    if (typeof req.body.active === 'boolean') m.active = req.body.active;
    await m.save();
    res.json(pub(m));
  }));

  // ---- Staff accounts (admin only)
  api.get('/staff', auth, admin, wrap(async (req, res) => res.json((await User.find({ role: { $in: cfg.STAFF } }).sort({ name: 1 })).map(pub))));
  api.post('/users', auth, admin, wrap(async (req, res) => {
    const name = str(req.body.name).trim();
    const email = str(req.body.email).toLowerCase().trim();
    const password = str(req.body.password);
    const role = str(req.body.role);
    if (!cfg.ROLES.includes(role)) return bad(res, 'Invalid role');
    if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return bad(res, 'Enter a name, a valid email and a password of at least 8 characters');
    if (await User.findOne({ email })) return bad(res, 'That email is already registered', 409);
    const u = await User.create({ name, email, role, passwordHash: await bcrypt.hash(password, 10), memberId: cfg.STAFF.includes(role) ? undefined : 'LIB-' + Date.now().toString(36).toUpperCase() });
    res.status(201).json(pub(u));
  }));

  api.get('/stats', auth, staff, wrap(async (req, res) => {
    const now = new Date();
    const [titles, copies, members, activeLoans, overdue, perCat, recent, reservations] = await Promise.all([
      Book.countDocuments({ archived: { $ne: true } }),
      Book.aggregate([{ $match: { archived: { $ne: true } } }, { $group: { _id: null, total: { $sum: '$totalCopies' }, avail: { $sum: '$availableCopies' } } }]),
      User.countDocuments({ role: { $in: ['student', 'faculty'] }, active: true }),
      Loan.countDocuments({ returnedAt: null }),
      Loan.countDocuments({ returnedAt: null, dueAt: { $lt: now } }),
      Book.aggregate([{ $match: { archived: { $ne: true } } }, { $group: { _id: '$category', titles: { $sum: 1 }, copies: { $sum: '$totalCopies' } } }, { $sort: { copies: -1 } }]),
      Loan.find().populate('book', 'title').populate('member', 'name').sort({ createdAt: -1 }).limit(6),
      Reservation.countDocuments({ status: 'waiting' }),
    ]);
    res.json({
      titles, reservations, copies: copies[0]?.total || 0, available: copies[0]?.avail || 0, members, activeLoans, overdue,
      categories: perCat.map((c) => ({ category: c._id, titles: c.titles, copies: c.copies })),
      recent: recent.map(loanView),
    });
  }));

  api.use((req, res) => bad(res, 'Not found', 404));
  app.use('/api', api);

  const dir = clientDir || path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(dir)) {
    app.use(express.static(dir, { maxAge: '1h', index: false }));
    app.get('*', (req, res) => res.sendFile(path.join(dir, 'index.html')));
  }
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.name === 'ValidationError') return bad(res, Object.values(err.errors)[0].message);
    if (err.type === 'entity.parse.failed') return bad(res, 'Invalid JSON');
    console.error(err);
    bad(res, 'Something went wrong', 500);
  });
  return app;
}

module.exports = { createApp };
