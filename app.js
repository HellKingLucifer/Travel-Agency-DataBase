// ---------------------------------------------------------
// Travel Agency System - APP.JS (FINAL UPDATED VERSION)
// ---------------------------------------------------------
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bodyParser = require("body-parser");
const app = express();
const PORT = 3000;

// ------------------ MIDDLEWARE ------------------
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ------------------ DATABASE INIT ------------------
const db = new sqlite3.Database("./travel_agency.db", (err) => {
  if (err) {
    console.error("❌ Could not connect to DB:", err);
    process.exit(1);
  }
  console.log("✅ Connected to SQLite database.");
  ensureSchema();
});

// Auto-create or upgrade tables
function ensureSchema() {
  // Create / Update trips table
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
      driver_phone TEXT,
      car_number TEXT,
      travelling_fee REAL NOT NULL,
      includes_toll INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`,
    (err) => {
      if (err) console.error("❌ Table create error:", err);
      else console.log("✔ Trips table ready.");

      // Auto-migrate old DBs
      db.all(`PRAGMA table_info('trips')`, [], (err, cols) => {
        if (err) return console.error("Schema check error:", err);

        const fields = cols.map((c) => c.name);
        const migrations = [];

        if (!fields.includes("driver_phone"))
          migrations.push(`ALTER TABLE trips ADD COLUMN driver_phone TEXT;`);
        if (!fields.includes("car_number"))
          migrations.push(`ALTER TABLE trips ADD COLUMN car_number TEXT;`);

        migrations.forEach((sql) => {
          db.run(sql, [], (err) => {
            if (err) console.error("Migration failed:", err);
            else console.log("✔ Migration applied:", sql);
          });
        });
      });
    }
  );

  // Create drivers table
  db.run(
    `CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      car TEXT,
      car_number TEXT,
      license TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    )`,
    (err) => {
      if (err) console.error("❌ Drivers table error:", err);
      else console.log("✔ Drivers table ready.");
    }
  );
}

// -----------------------------------------------------
// ROUTES
// -----------------------------------------------------

// Redirect home
app.get("/", (req, res) => res.redirect("/dashboard"));

// ------------------ DASHBOARD ------------------
app.get("/dashboard", (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const stats = {
    totalTrips: 0,
    todayTrips: 0,
    revenue: 0,
    totalDrivers: 0,
    busyDrivers: 0,
    freeDrivers: 0
  };

  // Count total trips
  db.get("SELECT COUNT(*) AS total FROM trips", [], (err1, totalTripsRow) => {
    stats.totalTrips = totalTripsRow?.total || 0;

    // Today's trips
    db.get("SELECT COUNT(*) AS today_count FROM trips WHERE departure_date = ?", [today], (err2, todayTripsRow) => {
      stats.todayTrips = todayTripsRow?.today_count || 0;

      // Total revenue
      db.get("SELECT SUM(travelling_fee) AS revenue FROM trips", [], (err3, revenueRow) => {
        stats.revenue = revenueRow?.revenue || 0;

        // Count drivers
        db.get("SELECT COUNT(*) AS dcount FROM drivers", [], (err4, driverTotalRow) => {
          stats.totalDrivers = driverTotalRow?.dcount || 0;

          // Busy drivers = assigned today
          db.all(
            "SELECT DISTINCT assigned_driver FROM trips WHERE departure_date = ? AND assigned_driver != ''",
            [today],
            (err5, rows) => {
              stats.busyDrivers = rows ? rows.length : 0;
              stats.freeDrivers = stats.totalDrivers - stats.busyDrivers;

              res.render("dashboard", { stats, today });
            }
          );
        });
      });
    });
  });
});

// ------------------ CREATE TRIP ------------------
app.get("/new-trip", (req, res) => res.render("new-trip"));

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
    driver_phone,
    car_number,
    travelling_fee,
    toll_option,
  } = req.body;

  const includes_toll = toll_option === "include" ? 1 : 0;
  const created_at = new Date().toISOString();

  const sql = `INSERT INTO trips (
    customer_name, phone_number, customer_id,
    departure_place, departure_date, departure_time,
    arrival_place, arrival_date, arrival_time,
    assigned_driver, assigned_car, driver_phone, car_number,
    travelling_fee, includes_toll, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const params = [
    customer_name,
    phone_number,
    customer_id || "",
    departure_place,
    departure_date,
    departure_time,
    arrival_place,
    arrival_date,
    arrival_time,
    assigned_driver || "",
    assigned_car || "",
    driver_phone || "",
    car_number || "",
    Number(travelling_fee) || 0,
    includes_toll,
    created_at,
  ];

  db.run(sql, params, (err) => {
    if (err) return res.status(500).send("DB Error");
    res.redirect("/trips");
  });
});

// ------------------ TRIPS LIST ------------------
app.get("/trips", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || "";
  const like = `%${search}%`;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM trips
    WHERE customer_name LIKE ? OR phone_number LIKE ? 
       OR assigned_driver LIKE ? OR departure_place LIKE ? OR arrival_place LIKE ?
  `;

  const dataSql = `
    SELECT *
    FROM trips
    WHERE customer_name LIKE ? OR phone_number LIKE ?
       OR assigned_driver LIKE ? OR departure_place LIKE ? OR arrival_place LIKE ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  const params = [like, like, like, like, like];

  db.get(countSql, params, (err, row) => {
    const total = row?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    db.all(dataSql, [...params, limit, offset], (err2, trips) => {
      if (err2) return res.status(500).send("DB Error");

      res.render("trips", {
        trips,
        currentPage: page,
        totalPages,
        search,
      });
    });
  });
});

// ------------------ TRIP DETAILS ------------------
app.get("/trips/:id", (req, res) => {
  db.get("SELECT * FROM trips WHERE id = ?", [req.params.id], (err, trip) => {
    if (!trip) return res.status(404).send("Trip not found");
    res.render("trip-details", { trip });
  });
});

// Print-friendly invoice
app.get("/trips/:id/print", (req, res) => {
  db.get("SELECT * FROM trips WHERE id = ?", [req.params.id], (err, trip) => {
    if (!trip) return res.status(404).send("Trip not found");
    res.render("trip-details-print", { trip });
  });
});

// ------------------ EDIT TRIP ------------------
app.get("/trips/:id/edit", (req, res) => {
  db.get("SELECT * FROM trips WHERE id = ?", [req.params.id], (err, trip) => {
    if (!trip) return res.status(404).send("Trip not found");
    res.render("edit-trip", { trip });
  });
});

app.post("/trips/:id/edit", (req, res) => {
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
    driver_phone,
    car_number,
    travelling_fee,
    toll_option,
  } = req.body;

  const includes_toll = toll_option === "include" ? 1 : 0;

  const sql = `UPDATE trips SET
    customer_name=?, phone_number=?, customer_id=?,
    departure_place=?, departure_date=?, departure_time=?,
    arrival_place=?, arrival_date=?, arrival_time=?,
    assigned_driver=?, assigned_car=?, driver_phone=?, car_number=?,
    travelling_fee=?, includes_toll=?
    WHERE id = ?`;

  const params = [
    customer_name,
    phone_number,
    customer_id || "",
    departure_place,
    departure_date,
    departure_time,
    arrival_place,
    arrival_date,
    arrival_time,
    assigned_driver || "",
    assigned_car || "",
    driver_phone || "",
    car_number || "",
    Number(travelling_fee) || 0,
    includes_toll,
    req.params.id,
  ];

  db.run(sql, params, () => res.redirect("/trips"));
});

// ------------------ DELETE TRIP ------------------
app.post("/trips/:id/delete", (req, res) => {
  db.run("DELETE FROM trips WHERE id = ?", [req.params.id], () =>
    res.redirect("/trips")
  );
});

// -----------------------------------------------------
// DRIVERS MODULE
// -----------------------------------------------------

// List drivers
app.get("/drivers", (req, res) => {
  const search = `%${(req.query.search || "")}%`;
  const sql = req.query.search
    ? `SELECT * FROM drivers WHERE name LIKE ? ORDER BY created_at DESC`
    : `SELECT * FROM drivers ORDER BY created_at DESC`;

  const params = req.query.search ? [search] : [];

  db.all(sql, params, (err, drivers) => {
    res.render("drivers", { drivers, search: req.query.search || "" });
  });
});

// New driver
app.get("/drivers/new", (req, res) => res.render("new-driver"));

app.post("/drivers/new", (req, res) => {
  const { name, phone, car, car_number, license, notes } = req.body;
  const created_at = new Date().toISOString();

  db.run(
    `INSERT INTO drivers (name, phone, car, car_number, license, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name, phone, car, car_number, license, notes, created_at],
    () => res.redirect("/drivers")
  );
});

// Edit driver
app.get("/drivers/:id/edit", (req, res) => {
  db.get("SELECT * FROM drivers WHERE id = ?", [req.params.id], (err, driver) => {
    if (!driver) return res.status(404).send("Driver not found");
    res.render("edit-driver", { driver });
  });
});

app.post("/drivers/:id/edit", (req, res) => {
  const { name, phone, car, car_number, license, notes } = req.body;

  db.run(
    `UPDATE drivers SET name=?, phone=?, car=?, car_number=?, license=?, notes=?
     WHERE id = ?`,
    [name, phone, car, car_number, license, notes, req.params.id],
    () => res.redirect("/drivers")
  );
});

// Delete driver
app.post("/drivers/:id/delete", (req, res) => {
  db.run("DELETE FROM drivers WHERE id = ?", [req.params.id], () =>
    res.redirect("/drivers")
  );
});

// ------------------ API: DRIVER AUTOCOMPLETE ------------------
app.get("/api/drivers", (req, res) => {
  const q = `%${req.query.search || ""}%`;

  db.all(
    `SELECT id, name, phone, car, car_number 
     FROM drivers
     WHERE name LIKE ?
     ORDER BY name
     LIMIT 10`,
    [q],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(rows || []);
    }
  );
});

// ------------------ EXPORT CSV ------------------
app.get("/export/csv", (req, res) => {
  db.all("SELECT * FROM trips ORDER BY created_at DESC", [], (err, rows) => {
    if (!rows || rows.length === 0) return res.send("No data");

    const fields = Object.keys(rows[0]);
    const header = fields.join(",") + "\n";

    const body = rows
      .map((r) =>
        fields
          .map((f) => {
            let v = r[f] ?? "";
            if (typeof v === "string" && (v.includes(",") || v.includes('"')))
              v = `"${v.replace(/"/g, '""')}"`;
            return v;
          })
          .join(",")
      )
      .join("\n");

    res.setHeader("Content-Disposition", "attachment; filename=trips.csv");
    res.setHeader("Content-Type", "text/csv");
    res.send(header + body);
  });
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
