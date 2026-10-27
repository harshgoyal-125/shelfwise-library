const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'librarian', 'faculty', 'student'], default: 'student' },
  memberId: { type: String, unique: true, sparse: true },
  phone: { type: String, trim: true, maxlength: 20 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

const bookSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 160 },
  author: { type: String, required: true, trim: true, maxlength: 120 },
  isbn: { type: String, trim: true, maxlength: 20 },
  category: { type: String, required: true, trim: true, maxlength: 60 },
  description: { type: String, trim: true, maxlength: 1000 },
  year: { type: Number, min: 0, max: 3000 },
  shelf: { type: String, trim: true, maxlength: 20 },
  totalCopies: { type: Number, required: true, min: 1, max: 500 },
  availableCopies: { type: Number, required: true, min: 0 },
  archived: { type: Boolean, default: false },
}, { timestamps: true });
bookSchema.index({ title: 'text', author: 'text', category: 'text' });

const loanSchema = new Schema({
  book: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
  member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  issuedAt: { type: Date, default: Date.now },
  dueAt: { type: Date, required: true },
  returnedAt: Date,
  renewals: { type: Number, default: 0 },
  fine: { type: Number, default: 0 },
}, { timestamps: true });

const requestSchema = new Schema({
  book: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
  member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', index: true },
  decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  decidedAt: Date,
  loan: { type: Schema.Types.ObjectId, ref: 'Loan' },
}, { timestamps: true });

const reservationSchema = new Schema({
  book: { type: Schema.Types.ObjectId, ref: 'Book', required: true, index: true },
  member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['waiting', 'fulfilled', 'cancelled'], default: 'waiting' },
}, { timestamps: true });

module.exports = {
  Request: mongoose.models.Request || mongoose.model('Request', requestSchema),
  Reservation: mongoose.models.Reservation || mongoose.model('Reservation', reservationSchema),
  User: mongoose.models.User || mongoose.model('User', userSchema),
  Book: mongoose.models.Book || mongoose.model('Book', bookSchema),
  Loan: mongoose.models.Loan || mongoose.model('Loan', loanSchema),
};
