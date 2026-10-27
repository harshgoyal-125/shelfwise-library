# ShelfWise - Library Management System (MERN)

A full-stack library management demo built for the MERN semester mini project.

- **Frontend:** React 18 + React Router + Vite (components, forms, routing, state with hooks)
- **Backend:** Node.js + Express REST API (GET, POST, PUT, PATCH, DELETE)
- **Database:** MongoDB with Mongoose schemas
- **Auth:** JWT login with role-based access (Admin, Librarian, Faculty, Student)

## Features

| Role | What they can do |
| --- | --- |
| Admin | Everything: dashboard, add/edit/delete books, issue/return, manage members, create accounts of any role |
| Librarian | Dashboard, add/edit books, approve/reject student borrow requests, issue/return/renew loans, activate/deactivate members |
| Faculty | Search the catalog, borrow up to 6 books for 30 days, renew once (+14 days), see own loans and fines |
| Student | Search the catalog, request books (a loan starts only when the librarian approves), up to 3 active loans + pending requests, 14-day loans, renew once (+7 days), see own loans and fines |

Reservation queue: when every copy of a title is out, members can reserve it (first in, first out). Returned copies are held for the queue, the member's queue position is shown, and borrowing fulfils the reservation. Reservations can be cancelled by the member or staff.

Borrow requests: students request a book from the catalog; the request is pending until a librarian (or admin) approves it from Loans > Requests, and only then does the loan start and the available copy count drop. Requests can be rejected, or cancelled by the student while pending, and pending requests count toward the student's 3-book limit.

Other rules: overdue fine is Rs 5 per day, overdue members cannot borrow more, one copy of a title per member, the last copy can't be double-borrowed (atomic stock update), books with active loans can't be deleted. New visitors can self-register as students.

## Folder structure

```
server/src
  app.js      Express app, middleware, REST routes
  models.js   Mongoose schemas: User, Book, Loan, Reservation, Request
  config.js   Loan policy per role
  seed.js     Sample data (30 books, 8 accounts, 14 loans, 2 reservations)
  index.js    Entry point (connects to MongoDB, seeds if empty)
server/test   API tests (node:test + in-memory MongoDB)
client/src
  pages/      Login, Catalog, MyLoans, Dashboard, ManageBooks, Loans, Members, Staff
  api.js      fetch helper + token handling
```

## REST API (all under `/api`, JWT bearer token except login/register)

- `POST /auth/login`, `POST /auth/register`, `GET /auth/me`
- `GET /books` (search `q`, `category`, `available`, `page`), `GET /books/categories`, `GET /books/:id`
- `POST /books`, `PUT /books/:id` (staff), `DELETE /books/:id` (admin)
- `POST /loans` (borrow, or staff issue with `memberId`), `GET /loans/mine`, `GET /loans` (staff), `POST /loans/:id/return`, `POST /loans/:id/renew`
- `POST /reservations`, `GET /reservations/mine`, `GET /reservations` (staff), `DELETE /reservations/:id`
- `GET /members`, `PATCH /members/:id` (staff), `GET /staff`, `POST /users` (admin), `GET /stats` (staff)

## Run locally

Requirements: Node 18+ and a MongoDB database (local or Atlas free tier).

```bash
npm run build                      # installs both apps and builds the React client
cd server && cp .env.example .env  # then fill in values
cd .. && npm start                 # http://localhost:4000
```

Environment variables (`server/.env`):

- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - long random string
- `SEED_ADMIN_PASSWORD`, `SEED_LIBRARIAN_PASSWORD`, `SEED_FACULTY_PASSWORD`, `SEED_STUDENT_PASSWORD` - passwords for the demo accounts of each role (all four required to seed an empty database)
- `SEED_VERSION` - optional, change it to any new value to wipe and re-seed the demo data once on the next start

Demo accounts (emails; each role uses the password you set above; faculty@ and student@ are the main ones, other sample members share their role's password): `admin@shelfwise.demo`, `librarian@shelfwise.demo`, `faculty@shelfwise.demo`, `student@shelfwise.demo`.

For frontend development run `npm run dev:server` and `npm run dev:client` in two terminals (Vite proxies `/api`).

## Tests

```bash
cd server && npm install && npm test
```

Covers login, operator-injection blocking, role permissions, borrow/renew/return rules, loan limits, the last-copy race and the reservation queue.

## Security notes

bcrypt password hashes, JWT with 8h expiry, helmet headers, login rate limiting, request body checks that reject `$`/dotted keys, input validation on every write, role checks on every protected route. No pen test or formal audit was done.

## Deployment note: demo passwords

On 2026-10-27 the four demo role passwords (admin, librarian, faculty, student) on the live deployment were changed directly in the database to values chosen by the owner, stored in the owner's password vault. The `SEED_*_PASSWORD` environment values no longer match them. Changing `SEED_VERSION` wipes and re-seeds the data and would overwrite those passwords with the `SEED_*` values, so do not bump it on the live site unless you intend to reset them.
