# BudgetWise

A simple budgeting website. Visitors can read the public home page; registered users log in to a private dashboard where they record income and expenses and see their remaining balance, a numbered transaction list and a chart.

Course project for **SOEN 287 – Web Programming** (Fall 2026).

**Team:** [your name] (individual project)

## Tech stack

- **Front end:** semantic HTML5, responsive CSS, vanilla JavaScript (DOM + `fetch`), chart drawn with plain SVG (no library)
- **Back end:** Node.js + Express
- **Authentication:** session cookies (`express-session`), passwords hashed with `bcryptjs`
- **Data:** JSON files in the `data/` folder (no SQL database)
- **Configuration:** secrets and settings read from environment variables (`.env`)

## Features

- Public home page (no login needed) with Log in and Sign up
- Registration and login; signing up logs you in automatically and opens the dashboard
- Dashboard showing remaining balance, total income, total expenses
- Numbered transaction list with add, edit and delete
- Live filtering by type and category
- Two pie charts (income by category, expenses by category), drawn with plain SVG; the user picks the slice colours
- Drop-down menu in the top bar: add transaction/income, chart colours, edit categories, profile picture, change password, export data (CSV), log out
- Profile & settings page: profile picture (shrunk in the browser, stored as a small JPEG in the user's record), custom categories, password change
- Put your own logo in `public/Logo.jpeg`
- Per-user data isolation: every transaction route checks the logged-in user's id
- Server-side validation of every form; the app does not crash on bad or missing input

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
cp .env.example .env      # on Windows: copy .env.example .env
```

Open `.env` and set `SESSION_SECRET` to a long random string (the file explains how to generate one). Then:

```bash
npm start
```

Open http://localhost:3000.

## Open it from another computer

The server accepts connections from other devices, and all data is stored on the computer running the server, so every computer sees the same accounts and transactions.

**Same Wi-Fi / network**

1. Run `npm start` on the host computer. It prints lines such as `On your network: http://192.168.1.25:3000`.
2. On the other computer, open that address in a browser.
3. If it does not load, allow Node.js through the host computer's firewall (on Windows, choose "Private networks" when prompted).
4. Do **not** set `NODE_ENV=production` for this kind of use: that makes the login cookie HTTPS-only, and plain `http://` addresses would not stay logged in.

**From anywhere on the internet**

Run the app on a hosting service that runs Node.js and serves your site over HTTPS. Then:

1. Set the environment variables `SESSION_SECRET` and `NODE_ENV=production` in the host's settings (not in the code).
2. Attach a **persistent disk/volume** to the service and set `DATA_DIR` to its path. Without one, many hosts erase files when the app restarts and all accounts would be lost.
3. Use `npm install` as the build command and `npm start` as the start command.

## Project layout

```
server.js                  starts the app, security headers, sessions, routes
store.js                   reads/writes the JSON data files
middleware/requireAuth.js  login guard for protected pages and API routes
routes/auth.js             signup, login, logout, "who am I"
routes/transactions.js     create / read / update / delete transactions
views/dashboard.html       the dashboard (only served to logged-in users)
public/                    home page, login, signup, CSS and browser scripts
data/                      JSON files (created automatically, not committed)
```

## Data model

`data/users.json`

```json
{ "id": "uuid", "username": "sam", "email": "sam@mail.com", "passwordHash": "$2b$10$...", "createdAt": "ISO date" }
```

`data/transactions.json` (money is stored in whole cents to avoid rounding errors)

```json
{ "id": "uuid", "userId": "uuid of the owner", "type": "income|expense", "cents": 6420, "category": "Food", "date": "2026-11-05", "note": "Groceries" }
```

## Security notes

- Passwords are hashed with bcrypt; only the hash is stored.
- Login errors are identical for "unknown user" and "wrong password", and take similar time.
- The session id is regenerated at login and signup; the cookie is `httpOnly` and `sameSite=lax` (and `secure` in production).
- All input is validated on the server; transaction ids are always matched together with the owner's id.
- User text is added to the page with `textContent`, never `innerHTML`, and a Content-Security-Policy header allows only the site's own scripts.

## Limitations and future work

- Sessions are kept in memory, so restarting the server logs everyone out.
- No limit on login attempts yet (rate limiting would be a next step).
- JSON files suit a small number of users; a larger service would need a database.
