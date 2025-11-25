const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = 3000;

// --- View Engine Setup (EJS) ---
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// --- Middleware to parse form data ---
app.use(express.urlencoded({ extended: true }));

// --- Initialize SQLite Database ---
const db = new sqlite3.Database("./travel_agency.db", (err) => {
  if (err) {
    console.error("Could not connect to database", err);
  } else {
    console.log("Connected to SQLite database.");
  }
});

// --- Create table if it doesn't exist ---
db.run(
  `CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    customer_id TEXT,
    departure_place TEXT NOT NULL,
    departure_date TEXT NOT NULL,
    departure_time TEXT NOT NULL,
    arrival_place TEXT NOT NULL,
    arrival_date TEXT NOT NULL,
    arrival_time TEXT NOT NULL,
    assigned_driver TEXT,
    assigned_car TEXT,
    travelling_fee REAL NOT NULL,
    includes_toll INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  (err) => {
    if (err) {
      console.error("Error creating table:", err);
    } else {
      console.log("Trips table is ready.");
    }
  }
);

// --- Routes ---

// Redirect root to the new trip form
app.get("/", (req, res) => {
  res.redirect("/new-trip");
});

// Page 1: show form to create a new trip
app.get("/new-trip", (req, res) => {
  res.render("new-trip");
});

// Handle form submission
app.post("/new-trip", (req, res) => {
  const {
    customer_name,
    phone_number,
    customer_id,
    departure_place,
    departure_date,
    departure_time,
    arrival_place,
    arrival_date,
    arrival_time,
    assigned_driver,
    assigned_car,
    travelling_fee,
    toll_option,
  } = req.body;

  // Convert toll option to boolean-like integer
  const includes_toll = toll_option === "include" ? 1 : 0;

  // Timestamp
  const created_at = new Date().toISOString();

  const sql = `
    INSERT INTO trips (
      customer_name,
      phone_number,
      customer_id,
      departure_place,
      departure_date,
      departure_time,
      arrival_place,
      arrival_date,
      arrival_time,
      assigned_driver,
      assigned_car,
      travelling_fee,
      includes_toll,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = [
    customer_name,
    phone_number,
    customer_id,
    departure_place,
    departure_date,
    departure_time,
    arrival_place,
    arrival_date,
    arrival_time,
    assigned_driver,
    assigned_car,
    parseFloat(travelling_fee),
    includes_toll,
    created_at,
  ];

  db.run(sql, params, function (err) {
    if (err) {
      console.error("Error inserting trip:", err);
      return res.status(500).send("Database error");
    }

    // After saving, redirect to the table page
    res.redirect("/trips");
  });
});

// Page 2: list all trips in a table
app.get("/trips", (req, res) => {
  db.all("SELECT * FROM trips ORDER BY created_at DESC", [], (err, rows) => {
    if (err) {
      console.error("Error fetching trips:", err);
      return res.status(500).send("Database error");
    }

    res.render("trips", { trips: rows });
  });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
