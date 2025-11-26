// ---------------------------------------------------------
// Travel Agency System - APP.JS (UPDATED)
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

function ensureSchema() {
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
      if (err) console.error("❌ Trips table error:", err);
    }
  );

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
    }
  );
}

// Redirect home
app.get("/", (req, res) => res.redirect("/dashboard"));

// ------------------ DASHBOARD ------------------
app.get("/dashboard", (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const stats = {
    totalTrips: 0,
    todayTrips: 0,
    revenue: 0,
    totalDrivers: 0,
    busyDrivers: 0,
    idleDrivers: 0,
    upcomingDrivers: 0,
    monthlyLabels: [],
    monthlyTotals: [],
    monthlyRevenueLabels: [],
    monthlyRevenueTotals: []
  };

  function makeDate(dateStr, timeStr) {
    if (!dateStr) return null;
    const t = (timeStr && timeStr.trim()) || "00:00";
    return new Date(`${dateStr}T${t}`);
  }

  db.get("SELECT COUNT(*) AS total FROM trips", [], (e1, r1) => {
    stats.totalTrips = r1?.total || 0;

    db.get(
      "SELECT COUNT(*) AS today_count FROM trips WHERE departure_date = ?",
      [today],
      (e2, r2) => {
        stats.todayTrips = r2?.today_count || 0;

        db.get(
          "SELECT SUM(travelling_fee) AS revenue FROM trips",
          [],
          (e3, r3) => {
            stats.revenue = r3?.revenue || 0;

            db.all("SELECT id, name FROM drivers", [], (e4, drivers) => {
              drivers = drivers || [];
              stats.totalDrivers = drivers.length;

              db.all(
                `SELECT assigned_driver, departure_date, departure_time,
                        arrival_date, arrival_time
                 FROM trips
                 WHERE assigned_driver IS NOT NULL
                   AND TRIM(assigned_driver) != ''`,
                [],
                (e5, trips) => {
                  trips = trips || [];
                  const byDriver = new Map();

                  trips.forEach((t) => {
                    const name = (t.assigned_driver || "").trim();
                    if (!name) return;
                    if (!byDriver.has(name)) byDriver.set(name, []);
                    byDriver.get(name).push(t);
                  });

                  let busy = 0;
                  let idle = 0;
                  let upcoming = 0;

                  drivers.forEach((d) => {
                    const name = (d.name || "").trim();
                    const list = byDriver.get(name) || [];

                    if (list.length === 0) {
                      idle++;
                      return;
                    }

                    let hasCurrent = false;
                    let hasFuture = false;

                    list.forEach((t) => {
                      const dep = makeDate(t.departure_date, t.departure_time);
                      const arr = makeDate(t.arrival_date, t.arrival_time);
                      if (!dep || !arr) return;

                      if (dep <= now && now <= arr) hasCurrent = true;
                      else if (dep > now) hasFuture = true;
                    });

                    if (hasCurrent) busy++;
                    else if (hasFuture) upcoming++;
                    else idle++;
                  });

                  stats.busyDrivers = busy;
                  stats.idleDrivers = idle;
                  stats.upcomingDrivers = upcoming;

                  // Trips per month (last 6)
                  db.all(
                    `SELECT strftime('%Y-%m', departure_date) AS m,
                            COUNT(*) AS cnt
                     FROM trips
                     WHERE departure_date IS NOT NULL
                     GROUP BY m
                     ORDER BY m DESC
                     LIMIT 6`,
                    [],
                    (e6, rows) => {
                      rows = rows || [];
                      rows.reverse();
                      stats.monthlyLabels = rows.map((r) => r.m);
                      stats.monthlyTotals = rows.map((r) => r.cnt);

                      // Revenue per month (last 6)
                      db.all(
                        `SELECT strftime('%Y-%m', departure_date) AS m,
                                SUM(travelling_fee) AS rev
                         FROM trips
                         WHERE departure_date IS NOT NULL
                         GROUP BY m
                         ORDER BY m DESC
                         LIMIT 6`,
                        [],
                        (e7, rows2) => {
                          rows2 = rows2 || [];
                          rows2.reverse();
                          stats.monthlyRevenueLabels = rows2.map((r) => r.m);
                          stats.monthlyRevenueTotals = rows2.map(
                            (r) => r.rev || 0
                          );

                          // Upcoming timeline (next trips)
                          db.all(
                            `SELECT id, customer_name, assigned_driver,
                                    departure_place, arrival_place,
                                    departure_date, departure_time
                             FROM trips
                             WHERE departure_date >= ?
                             ORDER BY departure_date, departure_time
                             LIMIT 6`,
                            [today],
                            (e8, timelineTrips) => {
                              res.render("dashboard", {
                                stats,
                                today,
                                timelineTrips: timelineTrips || []
                              });
                            }
                          );
                        }
                      );
                    }
                  );
                }
              );
            });
          }
        );
      }
    );
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
    toll_option
  } = req.body;

  if (!arrival_date || !arrival_time) {
    return res.send(`<script>alert('Arrival date & time required'); window.history.back();</script>`);
  }

  const includes_toll = toll_option === "include" ? 1 : 0;
  const created_at = new Date().toISOString();

  const sql = `
    INSERT INTO trips (
      customer_name, phone_number, customer_id,
      departure_place, departure_date, departure_time,
      arrival_place, arrival_date, arrival_time,
      assigned_driver, assigned_car, driver_phone, car_number,
      travelling_fee, includes_toll,
      created_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `;

  db.run(sql, [
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
    created_at
  ], (err) => {
    if (err) {
      console.error("Insert Trip Error:", err);
      return res.send(`<script>alert('Database insert failed!'); window.history.back();</script>`);
    }
    res.redirect("/trips");
  });
});


// ------------------ TRIPS LIST (with search + pagination) ------------------
app.get("/trips", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 10;
  const offset = (page - 1) * limit;
  const searchRaw = req.query.search || "";
  const like = `%${searchRaw}%`;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM trips
    WHERE customer_name LIKE ?
       OR phone_number LIKE ?
       OR assigned_driver LIKE ?
       OR departure_place LIKE ?
       OR arrival_place LIKE ?
  `;

  const dataSql = `
    SELECT *
    FROM trips
    WHERE customer_name LIKE ?
       OR phone_number LIKE ?
       OR assigned_driver LIKE ?
       OR departure_place LIKE ?
       OR arrival_place LIKE ?
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
        search: searchRaw,
        currentPage: page,
        totalPages
      });
    });
  });
});

// ------------------ TRIP DETAILS ------------------
app.get("/trips/:id", (req, res) => {
  db.get("SELECT * FROM trips WHERE id=?", [req.params.id], (err, trip) => {
    if (!trip) return res.status(404).send("Trip not found");
    res.render("trip-details", { trip });
  });
});

// Print-friendly invoice
app.get("/trips/:id/print", (req, res) => {
  db.get("SELECT * FROM trips WHERE id=?", [req.params.id], (err, trip) => {
    if (!trip) return res.status(404).send("Trip not found");
    res.render("trip-details-print", { trip });
  });
});

// ------------------ EDIT TRIP (PAGE) ------------------
app.get("/trips/:id/edit", (req, res) => {
  db.get("SELECT * FROM trips WHERE id=?", [req.params.id], (err, trip) => {
    if (!trip) return res.status(404).send("Trip not found");
    res.render("edit-trip", { trip });
  });
});

// ------------------ EDIT TRIP (UPDATE) ------------------
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
    toll_option
  } = req.body;

  if (!arrival_date || !arrival_time) {
    return res.send(
      `<script>alert('Arrival date & time required to update trip.'); window.history.back();</script>`
    );
  }

  const includes_toll = toll_option === "include" ? 1 : 0;

  db.run(
    `UPDATE trips SET
      customer_name=?, phone_number=?, customer_id=?,
      departure_place=?, departure_date=?, departure_time=?,
      arrival_place=?, arrival_date=?, arrival_time=?,
      assigned_driver=?, assigned_car=?, driver_phone=?, car_number=?,
      travelling_fee=?, includes_toll=?
     WHERE id=?`,
    [
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
      req.params.id
    ],
    () => res.redirect("/trips")
  );
});

// ------------------ DELETE TRIP ------------------
app.post("/trips/:id/delete", (req, res) => {
  db.run("DELETE FROM trips WHERE id=?", [req.params.id], () =>
    res.redirect("/trips")
  );
});

// -----------------------------------------------------
// DRIVERS MODULE
// -----------------------------------------------------

// List drivers (with search)
app.get("/drivers", (req, res) => {
  const searchRaw = req.query.search || "";
  let sql;
  let params;

  if (searchRaw) {
    const like = `%${searchRaw}%`;
    sql = `
      SELECT * FROM drivers
      WHERE name LIKE ? OR phone LIKE ? OR car LIKE ? OR car_number LIKE ?
      ORDER BY created_at DESC
    `;
    params = [like, like, like, like];
  } else {
    sql = `SELECT * FROM drivers ORDER BY created_at DESC`;
    params = [];
  }

  db.all(sql, params, (err, drivers) => {
    res.render("drivers", { drivers: drivers || [], search: searchRaw });
  });
});

// New driver form
app.get("/drivers/new", (req, res) => res.render("new-driver"));

// Create driver
app.post("/drivers/new", (req, res) => {
  const { name, phone, car, car_number, license, notes } = req.body;
  const created_at = new Date().toISOString();

  db.run(
    `INSERT INTO drivers VALUES (NULL,?,?,?,?,?,?,?)`,
    [name, phone, car, car_number, license, notes, created_at],
    () => res.redirect("/drivers")
  );
});

// Edit driver page
app.get("/drivers/:id/edit", (req, res) => {
  db.get("SELECT * FROM drivers WHERE id=?", [req.params.id], (err, driver) => {
    if (!driver) return res.status(404).send("Driver not found");
    res.render("edit-driver", { driver });
  });
});

// Update driver
app.post("/drivers/:id/edit", (req, res) => {
  const { name, phone, car, car_number, license, notes } = req.body;

  db.run(
    `UPDATE drivers
     SET name=?, phone=?, car=?, car_number=?, license=?, notes=?
     WHERE id=?`,
    [name, phone, car, car_number, license, notes, req.params.id],
    () => res.redirect("/drivers")
  );
});

// Delete driver
app.post("/drivers/:id/delete", (req, res) => {
  db.run("DELETE FROM drivers WHERE id=?", [req.params.id], () =>
    res.redirect("/drivers")
  );
});

// ------------------ AUTOCOMPLETE API ------------------
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
      res.json(rows || []);
    }
  );
});

// ------------------ EXPORT CSV ------------------
app.get("/export/csv", (req, res) => {
  db.all("SELECT * FROM trips", [], (err, rows) => {
    if (!rows || rows.length === 0) return res.send("No data!");

    const fields = Object.keys(rows[0]);
    const csv =
      fields.join(",") +
      "\n" +
      rows
        .map((row) =>
          fields
            .map((f) => {
              let v = row[f];
              if (v === null || v === undefined) v = "";
              v = String(v);
              if (v.includes(",") || v.includes('"')) {
                v = `"${v.replace(/"/g, '""')}"`;
              }
              return v;
            })
            .join(",")
        )
        .join("\n");

    res.setHeader("Content-Disposition", "attachment; filename=trips.csv");
    res.setHeader("Content-Type", "text/csv");
    res.send(csv);
  });
});

// ------------------ START SERVER ------------------
app.listen(PORT, () => {
  console.log(`🚀 Server running → http://localhost:${PORT}`);
});
