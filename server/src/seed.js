const bcrypt = require('bcryptjs');
const { User, Book, Loan, Reservation } = require('./models');
const { POLICY } = require('./config');

const BOOKS = [
  ['Clean Code', 'Robert C. Martin', 'Computer Science', 2008, 4, 'CS-01', 'A handbook of agile software craftsmanship.'],
  ['The Pragmatic Programmer', 'Andrew Hunt, David Thomas', 'Computer Science', 1999, 3, 'CS-02', 'Practical advice for working programmers.'],
  ['Introduction to Algorithms', 'Thomas H. Cormen', 'Computer Science', 2009, 3, 'CS-03', 'The standard reference on algorithms.'],
  ['Designing Data-Intensive Applications', 'Martin Kleppmann', 'Computer Science', 2017, 2, 'CS-04', 'The big ideas behind reliable, scalable systems.'],
  ['You Don\'t Know JS Yet', 'Kyle Simpson', 'Computer Science', 2020, 3, 'CS-05', 'A deep dive into the core mechanisms of JavaScript.'],
  ['Eloquent JavaScript', 'Marijn Haverbeke', 'Computer Science', 2018, 4, 'CS-06', 'A modern introduction to programming.'],
  ['Operating System Concepts', 'Abraham Silberschatz, Peter B. Galvin, Greg Gagne', 'Computer Science', null, 5, 'CS-07', 'Core concepts of processes, memory, storage and security in operating systems.'],
  ['Computer Networks', 'Andrew S. Tanenbaum', 'Computer Science', null, 3, 'CS-08', 'A layer-by-layer introduction to computer networks.'],
  ['Database System Concepts', 'Abraham Silberschatz, Henry F. Korth, S. Sudarshan', 'Computer Science', null, 2, 'CS-09', 'Textbook on relational databases, SQL and transaction processing.'],
  ['Computer Architecture: A Quantitative Approach', 'John L. Hennessy, David A. Patterson', 'Computer Science', null, 2, 'CS-10', 'Processor and memory system design analysed through measurement.'],
  ['Microelectronic Circuits', 'Adel S. Sedra, Kenneth C. Smith', 'Electrical & Electronics', null, 3, 'EE-01', 'Analog and digital electronic circuit design.'],
  ['The Art of Electronics', 'Paul Horowitz, Winfield Hill', 'Electrical & Electronics', null, 2, 'EE-02', 'A practical reference for designing electronic circuits.'],
  ['Digital Design', 'M. Morris Mano', 'Electrical & Electronics', null, 4, 'EE-03', 'Logic gates, combinational and sequential circuit design.'],
  ['Signals and Systems', 'Alan V. Oppenheim, Alan S. Willsky', 'Electrical & Electronics', null, 4, 'EE-04', 'Continuous and discrete-time signals, Fourier and Laplace methods.'],
  ['Electric Machinery Fundamentals', 'Stephen J. Chapman', 'Electrical & Electronics', null, 5, 'EE-05', 'Transformers, DC and AC machines and their control.'],
  ['Artificial Intelligence: A Modern Approach', 'Stuart Russell, Peter Norvig', 'Computer Science', null, 3, 'CS-11', 'Widely used textbook on intelligent agents, search and learning.'],
  ['Compilers: Principles, Techniques, and Tools', 'Alfred V. Aho, Monica S. Lam, Ravi Sethi, Jeffrey D. Ullman', 'Computer Science', null, 3, 'CS-12', 'The "Dragon Book" on compiler construction.'],
  ['Computer Networking: A Top-Down Approach', 'James F. Kurose, Keith W. Ross', 'Computer Science', null, 2, 'CS-13', 'Networking taught from applications down to the link layer.'],
  ['Principles of Geotechnical Engineering', 'Braja M. Das', 'Civil', null, 3, 'CE-02', 'Soil properties, strength and foundation basics.'],
  ['Advanced Engineering Mathematics', 'Erwin Kreyszig', 'Mathematics', null, 2, 'MA-01', 'Differential equations, linear algebra and vector calculus for engineers.'],
  ['Discrete Mathematics and Its Applications', 'Kenneth H. Rosen', 'Mathematics', null, 2, 'MA-02', 'Logic, sets, graphs and combinatorics for computing.'],
  ['Fundamentals of Electric Circuits', 'Charles K. Alexander, Matthew N. O. Sadiku', 'Electrical & Electronics', null, 4, 'EE-06', 'Circuit analysis for first-year electrical engineering students.'],
  ['Power System Analysis', 'John J. Grainger, William D. Stevenson Jr.', 'Electrical & Electronics', null, 2, 'EE-07', 'Load flow, fault analysis and stability of power systems.'],
  ['Digital Signal Processing', 'John G. Proakis, Dimitris G. Manolakis', 'Electrical & Electronics', null, 2, 'EE-08', 'Principles, algorithms and applications of DSP.'],
  ['Mechanics of Materials', 'Ferdinand P. Beer, E. Russell Johnston Jr.', 'Mechanical', null, 5, 'ME-04', 'Stress, strain, bending and torsion in structural members.'],
  ['Fundamentals of Fluid Mechanics', 'Bruce R. Munson, Donald F. Young, Theodore H. Okiishi', 'Mechanical', null, 3, 'ME-05', 'Fluid statics, flow analysis and pipe systems.'],
  ['Structural Analysis', 'R. C. Hibbeler', 'Civil', null, 3, 'CE-01', 'Analysis of beams, trusses and frames.'],
  ['Shigley\'s Mechanical Engineering Design', 'Richard G. Budynas, J. Keith Nisbett', 'Mechanical', null, 4, 'ME-01', 'Design of machine elements: gears, shafts, bearings and fasteners.'],
  ['Fundamentals of Heat and Mass Transfer', 'Frank P. Incropera, David P. DeWitt', 'Mechanical', null, 2, 'ME-02', 'Conduction, convection, radiation and mass transfer.'],
  ['Thermodynamics: An Engineering Approach', 'Yunus A. Cengel, Michael A. Boles', 'Mechanical', null, 3, 'ME-03', 'Thermodynamics with engineering applications and worked examples.'],
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
    title, author, category, year: year == null ? undefined : year, shelf, description, totalCopies: copies, availableCopies: copies,
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
