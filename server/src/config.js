const POLICY = {
  student: { days: 14, maxLoans: 3, renewDays: 7 },
  faculty: { days: 30, maxLoans: 6, renewDays: 14 },
};
module.exports = {
  POLICY,
  MAX_RENEWALS: 1,
  FINE_PER_DAY: 5, // INR
  STAFF: ['admin', 'librarian'],
  ROLES: ['admin', 'librarian', 'faculty', 'student'],
};
