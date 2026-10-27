const bcrypt = require('bcryptjs');
const { User, Book, Loan, Reservation } = require('./models');
const { POLICY } = require('./config');

const BOOKS = [
  ['Clean Code', 'Robert C. Martin', 'Technology', 2008, 4, 'T-01', 'A handbook of agile software craftsmanship.'],
  ['The Pragmatic Programmer', 'Andrew Hunt, David Thomas', 'Technology', 1999, 3, 'T-02', 'Practical advice for working programmers.'],
  ['Introduction to Algorithms', 'Thomas H. Cormen', 'Technology', 2009, 3, 'T-03', 'The standard reference on algorithms.'],
  ['Designing Data-Intensive Applications', 'Martin Kleppmann', 'Technology', 2017, 2, 'T-04', 'The big ideas behind reliable, scalable systems.'],
  ['You Don\'t Know JS Yet', 'Kyle Simpson', 'Technology', 2020, 3, 'T-05', 'A deep dive into the core mechanisms of JavaScript.'],
  ['Eloquent JavaScript', 'Marijn Haverbeke', 'Technology', 2018, 4, 'T-06', 'A modern introduction to programming.'],
  ['Wings of Fire', 'A. P. J. Abdul Kalam', 'Biography', 1999, 5, 'B-01', 'The autobiography of India\'s Missile Man.'],
  ['The Story of My Experiments with Truth', 'Mahatma Gandhi', 'Biography', 1927, 3, 'B-02', 'Gandhi\'s autobiography.'],
  ['Steve Jobs', 'Walter Isaacson', 'Biography', 2011, 2, 'B-03', 'The exclusive biography of Apple\'s co-founder.'],
  ['Long Walk to Freedom', 'Nelson Mandela', 'Biography', 1994, 2, 'B-04', 'The autobiography of Nelson Mandela.'],
  ['The Guide', 'R. K. Narayan', 'Fiction', 1958, 3, 'F-01', 'A tourist guide turned unlikely holy man.'],
  ['Midnight\'s Children', 'Salman Rushdie', 'Fiction', 1981, 2, 'F-02', 'A magical-realist saga of modern India.'],
  ['To Kill a Mockingbird', 'Harper Lee', 'Fiction', 1960, 4, 'F-03', 'A story of justice and growing up in the American South.'],
  ['1984', 'George Orwell', 'Fiction', 1949, 4, 'F-04', 'A dystopian novel about surveillance and control.'],
  ['The Alchemist', 'Paulo Coelho', 'Fiction', 1988, 5, 'F-05', 'A shepherd boy follows his dream to Egypt.'],
  ['Pride and Prejudice', 'Jane Austen', 'Classics', 1813, 3, 'C-01', 'Manners, marriage and misjudgment in Regency England.'],
  ['Godaan', 'Munshi Premchand', 'Classics', 1936, 3, 'C-02', 'The great Hindi novel of rural India.'],
  ['Gitanjali', 'Rabindranath Tagore', 'Classics', 1910, 2, 'C-03', 'Nobel-winning collection of poems.'],
  ['A Brief History of Time', 'Stephen Hawking', 'Science', 1988, 3, 'S-01', 'From the Big Bang to black holes.'],
  ['Cosmos', 'Carl Sagan', 'Science', 1980, 2, 'S-02', 'A personal voyage through the universe.'],
  ['The Selfish Gene', 'Richard Dawkins', 'Science', 1976, 2, 'S-03', 'A gene-centred view of evolution.'],
  ['Sapiens', 'Yuval Noah Harari', 'History', 2011, 4, 'H-01', 'A brief history of humankind.'],
  ['India After Gandhi', 'Ramachandra Guha', 'History', 2007, 2, 'H-02', 'The history of the world\'s largest democracy.'],
  ['The Discovery of India', 'Jawaharlal Nehru', 'History', 1946, 2, 'H-03', 'Nehru\'s reflections on Indian history and culture.'],
  ['Atomic Habits', 'James Clear', 'Self-Help', 2018, 5, 'P-01', 'Tiny changes, remarkable results.'],
  ['Deep Work', 'Cal Newport', 'Self-Help', 2016, 3, 'P-02', 'Rules for focused success in a distracted world.'],
  ['Rich Dad Poor Dad', 'Robert T. Kiyosaki', 'Self-Help', 1997, 3, 'P-03', 'What the rich teach their kids about money.'],
  ['The Psychology of Money', 'Morgan Housel', 'Business', 2020, 4, 'M-01', 'Timeless lessons on wealth and behaviour.'],
  ['Zero to One', 'Peter Thiel', 'Business', 2014, 2, 'M-02', 'Notes on startups and building the future.'],
  ['The Lean Startup', 'Eric Ries', 'Business', 2011, 3, 'M-03', 'How constant innovation creates successful businesses.'],
];

const MEMBERS = [
  ['Aarav Sharma', 'student@shelfwise.demo', 'student'],
  ['Diya Mehta', 'diya@shelfwise.demo', 'student'],
  ['Kabir Singh', 'kabir@shelfwise.demo', 'student'],
  ['Meera Nair', 'meera@shelfwise.demo', 'student'],
  ['Dr. Rohan Gupta', 'faculty@shelfwise.demo', 'faculty'],
  ['Prof. Saanvi Rao', 'saanvi@shelfwise.demo', 'faculty'],
];

const day = 24 * 3600 * 1000;

async function seed({ adminPassword, librarianPassword, facultyPassword, studentPassword, memberPassword, reset = false }) {
  librarianPassword = librarianPassword || adminPassword;
  facultyPassword = facultyPassword || memberPassword;
  studentPassword = studentPassword || memberPassword;
  if (reset) await Promise.all([User.deleteMany({}), Book.deleteMany({}), Loan.deleteMany({}), Reservation.deleteMany({})]);
  if (await User.countDocuments()) return false;
  const adminHash = await bcrypt.hash(adminPassword, 10);
  const hashes = { librarian: await bcrypt.hash(librarianPassword, 10), faculty: await bcrypt.hash(facultyPassword, 10), student: await bcrypt.hash(studentPassword, 10) };
  await User.create({ name: 'Library Admin', email: 'admin@shelfwise.demo', passwordHash: adminHash, role: 'admin' });
  await User.create({ name: 'Neha Verma (Librarian)', email: 'librarian@shelfwise.demo', passwordHash: hashes.librarian, role: 'librarian' });
  const members = [];
  for (let i = 0; i < MEMBERS.length; i++) {
    members.push(await User.create({
      name: MEMBERS[i][0], email: MEMBERS[i][1], passwordHash: hashes[MEMBERS[i][2]], role: MEMBERS[i][2],
      memberId: 'LIB-' + String(1001 + i), phone: '98765' + String(43210 + i),
    }));
  }
  const books = await Book.insertMany(BOOKS.map(([title, author, category, year, copies, shelf, description], i) => ({
    title, author, category, year, shelf, description, totalCopies: copies, availableCopies: copies,
    isbn: '978-81-' + String(7000 + i * 13).padStart(5, '0') + '-' + String(i).padStart(2, '0'),
  })));
  // sample loans: [memberIdx, bookIdx, daysAgoIssued, returnedDaysAgo|null]
  const loans = [
    [0, 0, 3, null], [0, 6, 20, null], [1, 13, 5, null], [1, 24, 18, null],
    [2, 20, 8, null], [3, 3, 2, null], [2, 3, 4, null], [4, 18, 22, null], [5, 14, 1, null],
    [0, 1, 40, 28], [1, 9, 35, 25], [2, 26, 50, 38], [3, 10, 45, 33], [5, 15, 60, 49],
  ];
  for (const [m, b, ago, ret] of loans) {
    const issuedAt = new Date(Date.now() - ago * day);
    const dueAt = new Date(issuedAt.getTime() + POLICY[members[m].role].days * day);
    const loan = { book: books[b]._id, member: members[m]._id, issuedAt, dueAt };
    if (ret !== null) loan.returnedAt = new Date(Date.now() - ret * day);
    else books[b].availableCopies -= 1;
    await Loan.create(loan);
  }
  await Promise.all(books.map((b) => b.save()));
  // reservation queue on a title with no copies left (Designing Data-Intensive Applications)
  await Reservation.create({ book: books[3]._id, member: members[0]._id, createdAt: new Date(Date.now() - 2 * day) });
  await Reservation.create({ book: books[3]._id, member: members[4]._id, createdAt: new Date(Date.now() - 1 * day) });
  return true;
}

module.exports = { seed };

if (require.main === module) {
  const mongoose = require('mongoose');
  require('./env');
  (async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const done = await seed({
      adminPassword: process.env.SEED_ADMIN_PASSWORD,
      librarianPassword: process.env.SEED_LIBRARIAN_PASSWORD,
      facultyPassword: process.env.SEED_FACULTY_PASSWORD,
      studentPassword: process.env.SEED_STUDENT_PASSWORD,
      reset: process.argv.includes('--reset'),
    });
    console.log(done ? 'seeded' : 'already has data');
    await mongoose.disconnect();
  })();
}
