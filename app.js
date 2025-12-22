// ---------------------------------------------------------
// Travel Agency System - APP.JS (FULL FIXED VERSION)
// ---------------------------------------------------------
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");

const app = express();
const PORT = 3000;
const uploadDir = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}


// ------------------ GLOBAL HELPERS (FIXED) ------------------

const normalizePublicPath = (p) => {
  if (!p) return null;
  return p.replace(/^\/?public\/?/, "").replace(/^\/+/, "");
};

const fixPath = (f) => {
  if (!f) return null;
  return "/" + normalizePublicPath(f.path.replace(/\\/g, "/"));
};

const deleteFile = (filePath) => {
  if (!filePath) return;
  const clean = normalizePublicPath(filePath);
  const fullPath = path.join(__dirname, "public", clean);
  if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
};

const makeDate = (dateStr, timeStr) => {
  if (!dateStr) return null;
  const t = (timeStr && timeStr.trim()) || "00:00";
  return new Date(`${dateStr}T${t}`);
};

// ------------------ MIDDLEWARE ------------------

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "Views"));

// ------------------ MULTER CONFIG ------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/uploads/"),
  filename: (req, file, cb) => {
  const ext = path.extname(file.originalname);
  const name = Date.now() + "-" + Math.round(Math.random() * 1e9);
  cb(null, name + ext);
}
});

const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("Only image files are allowed"));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // optional: increase to 5MB
});

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
      referral TEXT,
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
      trip_type TEXT,
      driver_payment_status TEXT,
      payment_method TEXT,
      car_images TEXT,
      created_at TEXT NOT NULL
    )`
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
      license_image TEXT,
      car_image_front TEXT,
      car_image_back TEXT,
      car_image_left TEXT,
      car_image_right TEXT,
      created_at TEXT NOT NULL
    )`
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
    monthlyRevenueTotals: [],
    monthlyOneWayTotals: [],
    monthlyRoundTripTotals: [],
  };

  // 1) Total trips
  db.get("SELECT COUNT(*) AS total FROM trips", [], (e1, r1) => {
    stats.totalTrips = r1?.total || 0;

    // 2) Today trips
    db.get(
      "SELECT COUNT(*) AS today_count FROM trips WHERE departure_date = ?",
      [today],
      (e2, r2) => {
        stats.todayTrips = r2?.today_count || 0;

        // 3) Revenue
        db.get(
          "SELECT SUM(travelling_fee) AS revenue FROM trips",
          [],
          (e3, r3) => {
            stats.revenue = r3?.revenue || 0;

            // 4) Drivers
            db.all("SELECT * FROM drivers", [], (e4, drivers) => {
              drivers = drivers || [];
              stats.totalDrivers = drivers.length;

              // 5) Driver status
              db.all(
                `SELECT *
                 FROM trips
                 WHERE assigned_driver IS NOT NULL
                   AND TRIM(assigned_driver) != ''`,
                [],
                (e5, tripsForDrivers) => {
                  tripsForDrivers = tripsForDrivers || [];
                  const byDriver = new Map();

                  tripsForDrivers.forEach((t) => {
                    const name = (t.assigned_driver || "").trim();
                    if (!name) return;
                    if (!byDriver.has(name)) byDriver.set(name, []);
                    byDriver.get(name).push(t);
                  });

                  let busy = 0;
                  let idle = 0;
                  let upcomingDrivers = 0;

                  drivers.forEach((d) => {
                    const name = d.name?.trim() || "";
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
                    else if (hasFuture) upcomingDrivers++;
                    else idle++;
                  });

                  stats.busyDrivers = busy;
                  stats.idleDrivers = idle;
                  stats.upcomingDrivers = upcomingDrivers;

                  // ---- REMAINDER CONTINUES IN PART 2 ----
                  // 6) Trips & revenue per month
                  const curr = new Date(today + "T00:00");
                  const targetMonths = [];

                  for (let i = -2; i <= 2; i++) {
                    const d = new Date(curr);
                    d.setMonth(d.getMonth() + i);
                    targetMonths.push(d.toISOString().slice(0, 7));
                  }

                  db.all(
                    `SELECT strftime('%Y-%m', departure_date) AS m,
                            COUNT(*) AS cnt,
                            SUM(travelling_fee) AS rev,
                            SUM(CASE WHEN trip_type = 'round_trip' THEN 1 ELSE 0 END) AS round_trip_cnt,
                            SUM(CASE WHEN trip_type = 'one_way'
                                      OR trip_type IS NULL
                                      OR TRIM(trip_type) = '' THEN 1 ELSE 0 END) AS one_way_cnt
                     FROM trips
                     WHERE departure_date BETWEEN ? AND ?
                     GROUP BY m`,
                    [
                      targetMonths[0] + "-01",
                      targetMonths[4] + "-31",
                    ],
                    (e6, monthlyRows) => {
                      monthlyRows = monthlyRows || [];
                      const map = new Map();
                      monthlyRows.forEach((r) => map.set(r.m, r));

                      stats.monthlyLabels = targetMonths;
                      stats.monthlyTotals = targetMonths.map(
                        (m) => map.get(m)?.cnt || 0
                      );
                      stats.monthlyRevenueLabels = targetMonths;
                      stats.monthlyRevenueTotals = targetMonths.map(
                        (m) => map.get(m)?.rev || 0
                      );
                      stats.monthlyOneWayTotals = targetMonths.map(
                        (m) => map.get(m)?.one_way_cnt || 0
                      );
                      stats.monthlyRoundTripTotals = targetMonths.map(
                        (m) => map.get(m)?.round_trip_cnt || 0
                      );

                      // 8) Timeline (next 6 trips)
                      db.all(
                        `SELECT id, customer_name, assigned_driver,
                                departure_place, arrival_place,
                                departure_date, departure_time
                         FROM trips
                         WHERE departure_date >= ?
                         ORDER BY departure_date, departure_time
                         LIMIT 6`,
                        [today],
                        (e8, timelineRows) => {
                          const timelineTrips = timelineRows || [];

                          // 9) Today trips
                          db.all(
                            `SELECT *
                             FROM trips
                             WHERE departure_date = ?
                             ORDER BY departure_time`,
                            [today],
                            (e9, todayRows) => {
                              const todayTrips = todayRows || [];

                              // 10) Ongoing / Upcoming
                              db.all(
                                `SELECT * FROM trips`,
                                [],
                                (e10, allTrips) => {
                                  allTrips = allTrips || [];
                                  const ongoingTrips = [];
                                  const upcomingTrips = [];

                                  allTrips.forEach((t) => {
                                    const dep = makeDate(
                                      t.departure_date,
                                      t.departure_time
                                    );
                                    const arr = makeDate(
                                      t.arrival_date,
                                      t.arrival_time
                                    );
                                    if (!dep || !arr) return;

                                    if (dep <= now && now <= arr)
                                      ongoingTrips.push(t);
                                    else if (dep > now)
                                      upcomingTrips.push(t);
                                  });

                                  // Driver full status list
                                  const driverStatusList = [];

                                  drivers.forEach((d) => {
                                    const name = d.name?.trim() || "";
                                    const list = byDriver.get(name) || [];

                                    let status = "idle";
                                    let currentTrip = null;
                                    let upcomingTrip = null;

                                    list.forEach((t) => {
                                      const dep = makeDate(
                                        t.departure_date,
                                        t.departure_time
                                      );
                                      const arr = makeDate(
                                        t.arrival_date,
                                        t.arrival_time
                                      );
                                      if (!dep || !arr) return;

                                      if (dep <= now && now <= arr) {
                                        status = "busy";
                                        if (
                                          !currentTrip ||
                                          arr <
                                            makeDate(
                                              currentTrip.arrival_date,
                                              currentTrip.arrival_time
                                            )
                                        ) {
                                          currentTrip = t;
                                        }
                                      } else if (dep > now) {
                                        if (status !== "busy")
                                          status = "upcoming";
                                        if (
                                          !upcomingTrip ||
                                          dep <
                                            makeDate(
                                              upcomingTrip.departure_date,
                                              upcomingTrip.departure_time
                                            )
                                        ) {
                                          upcomingTrip = t;
                                        }
                                      }
                                    });

                                    driverStatusList.push({
                                      ...d,
                                      status,
                                      currentTrip,
                                      upcomingTrip,
                                    });
                                  });

                                  // Sort drivers
                                  driverStatusList.sort((a, b) => {
                                    const order = {
                                      busy: 0,
                                      upcoming: 1,
                                      idle: 2,
                                    };
                                    if (a.status !== b.status)
                                      return order[a.status] - order[b.status];

                                    return a.name.localeCompare(b.name);
                                  });

                                  res.render("dashboard", {
                                    stats,
                                    today,
                                    timelineTrips,
                                    todayTrips,
                                    ongoingTrips,
                                    upcomingTrips,
                                    driversData: driverStatusList,
                                  });
                                }
                              );
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
  const b = req.body;

  if (!b.arrival_date || !b.arrival_time) {
    return res.send(
      `<script>alert('Arrival date & time required');history.back();</script>`
    );
  }

  const includes_toll = b.toll_option === "include" ? 1 : 0;

  db.run(
    `
    INSERT INTO trips (
      customer_name, phone_number, customer_id, referral,
      departure_place, departure_date, departure_time,
      arrival_place, arrival_date, arrival_time,
      assigned_driver, assigned_car, driver_phone, car_number,
      travelling_fee, includes_toll, trip_type,
      driver_payment_status, payment_method, car_images, created_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `,
    [
      b.customer_name,
      b.phone_number,
      b.customer_id || "",
      b.referral || "",
      b.departure_place,
      b.departure_date,
      b.departure_time,
      b.arrival_place,
      b.arrival_date,
      b.arrival_time,
      b.assigned_driver || "",
      b.assigned_car || "",
      b.driver_phone || "",
      b.car_number || "",
      Number(b.travelling_fee) || 0,
      includes_toll,
      b.trip_type,
      b.driver_payment_status,
      b.payment_method,
      "[]",
      new Date().toISOString(),
    ],
    (err) => {
      if (err) {
        console.error("Insert Trip Error:", err);
        return res.send(
          `<script>alert("DB error");history.back();</script>`
        );
      }
      res.redirect("/trips");
    }
  );
});

// ------------------ TRIPS LIST ------------------

app.get("/trips", (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 10;
  const offset = (page - 1) * limit;
  const search = req.query.search || "";
  const like = `%${search}%`;

  const countSql = `
    SELECT COUNT(*) AS total FROM trips
    WHERE customer_name LIKE ?
       OR phone_number LIKE ?
       OR assigned_driver LIKE ?
       OR departure_place LIKE ?
       OR arrival_place LIKE ?
       OR referral LIKE ?
  `;

  const dataSql = `
    SELECT * FROM trips
    WHERE customer_name LIKE ?
       OR phone_number LIKE ?
       OR assigned_driver LIKE ?
       OR departure_place LIKE ?
       OR arrival_place LIKE ?
       OR referral LIKE ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `;

  const params = [like, like, like, like, like, like];

  db.get(countSql, params, (_, row) => {
    const total = row?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    db.all(dataSql, [...params, limit, offset], (_, trips) => {
      res.render("trips", {
        trips: trips || [],
        search,
        currentPage: page,
        totalPages,
      });
    });
  });
});

// ------------------ REFERRAL ------------------

app.get("/referral/:referralName", (req, res) => {
  db.all(
    `SELECT * FROM trips WHERE referral=? ORDER BY created_at DESC`,
    [req.params.referralName],
    (_, trips) => {
      res.render("referral-trips", {
        trips: trips || [],
        referralName: req.params.referralName,
      });
    }
  );
});

// ------------------ TRIP DETAILS ------------------

app.get("/trips/:id", (req, res) => {
  const sql = `
    SELECT t.*, d.car_image_front, d.car_image_back,
           d.car_image_left, d.car_image_right
    FROM trips t
    LEFT JOIN drivers d ON t.assigned_driver = d.name
    WHERE t.id = ?
  `;

  db.get(sql, [req.params.id], (_, trip) => {
    if (!trip) return res.status(404).send("Trip not found");

    const imgs = [];
    if (trip.car_image_front) imgs.push(trip.car_image_front);
    if (trip.car_image_back) imgs.push(trip.car_image_back);
    if (trip.car_image_left) imgs.push(trip.car_image_left);
    if (trip.car_image_right) imgs.push(trip.car_image_right);
    trip.car_images = imgs;

    res.render("trip-details", { trip });
  });
});

app.get("/trips/:id/print", (req, res) => {
  db.get(
    "SELECT * FROM trips WHERE id=?",
    [req.params.id],
    (_, trip) => {
      if (!trip) return res.status(404).send("Trip not found");
      res.render("trip-details-print", { trip });
    }
  );
});

// ------------------ EDIT TRIP ------------------

app.get("/trips/:id/edit", (req, res) => {
  db.get(
    "SELECT * FROM trips WHERE id=?",
    [req.params.id],
    (_, trip) => {
      if (!trip) return res.status(404).send("Trip not found");
      res.render("edit-trip", { trip });
    }
  );
});

app.post("/trips/:id/edit", (req, res) => {
  const b = req.body;
  if (!b.arrival_date || !b.arrival_time)
    return res.send(
      `<script>alert('Arrival date & time required');history.back();</script>`
    );

  db.run(
    `
    UPDATE trips SET
      customer_name=?, phone_number=?, customer_id=?, referral=?,
      departure_place=?, departure_date=?, departure_time=?,
      arrival_place=?, arrival_date=?, arrival_time=?,
      assigned_driver=?, assigned_car=?, driver_phone=?, car_number=?,
      travelling_fee=?, includes_toll=?, trip_type=?,
      driver_payment_status=?, payment_method=?
    WHERE id=?
    `,
    [
      b.customer_name,
      b.phone_number,
      b.customer_id || "",
      b.referral || "",
      b.departure_place,
      b.departure_date,
      b.departure_time,
      b.arrival_place,
      b.arrival_date,
      b.arrival_time,
      b.assigned_driver || "",
      b.assigned_car || "",
      b.driver_phone || "",
      b.car_number || "",
      Number(b.travelling_fee) || 0,
      b.toll_option === "include" ? 1 : 0,
      b.trip_type,
      b.driver_payment_status,
      b.payment_method,
      req.params.id,
    ],
    () => res.redirect("/trips")
  );
});

// ------------------ DELETE TRIP ------------------

app.post("/trips/:id/delete", (req, res) => {
  db.run(
    "DELETE FROM trips WHERE id=?",
    [req.params.id],
    (err) => {
      if (err) return res.status(500).send("Delete failed");
      res.sendStatus(200);
    }
  );
});

// ------------------ DRIVERS ------------------

app.get("/drivers", (req, res) => {
  const search = req.query.search || "";
  const like = `%${search}%`;

  const sql = search
    ? `SELECT * FROM drivers
       WHERE name LIKE ? OR phone LIKE ? OR car LIKE ? OR car_number LIKE ?
       ORDER BY created_at DESC`
    : `SELECT * FROM drivers ORDER BY created_at DESC`;

  db.all(
    sql,
    search ? [like, like, like, like] : [],
    (_, drivers) => {
      res.render("drivers", {
        drivers: drivers || [],
        search,
      });
    }
  );
});

// ------------------ NEW DRIVER ------------------

app.get("/drivers/new", (req, res) => res.render("new-driver"));

app.post(
  "/drivers/new",
  upload.fields([
    { name: "license_image", maxCount: 1 },
    { name: "car_image_front", maxCount: 1 },
    { name: "car_image_back", maxCount: 1 },
    { name: "car_image_left", maxCount: 1 },
    { name: "car_image_right", maxCount: 1 },
  ]),
  (req, res) => {

    if (!req.body.name)
      return res.send(
        `<script>alert('Name required');history.back();</script>`
      );

    db.run(
      `
      INSERT INTO drivers (
        name, phone, car, car_number, license, notes,
        license_image, car_image_front, car_image_back,
        car_image_left, car_image_right, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        req.body.name,
        req.body.phone || "",
        req.body.car || "",
        req.body.car_number || "",
        req.body.license || "",
        req.body.notes || "",
        fixPath(req.files?.license_image?.[0]),
        fixPath(req.files?.car_image_front?.[0]),
        fixPath(req.files?.car_image_back?.[0]),
        fixPath(req.files?.car_image_left?.[0]),
        fixPath(req.files?.car_image_right?.[0]),
        new Date().toISOString(),
      ],
      () => res.redirect("/drivers")
    );
  }
);

// ------------------ EDIT DRIVER (PAGE) ------------------
function publicUrl(p) {
  if (!p) return "";
  return "/" + p.replace(/^\/?public\/?/, "").replace(/^\/+/, "");
}
app.get("/drivers/:id/edit", (req, res) => {
  db.get(
    "SELECT * FROM drivers WHERE id = ?",
    [req.params.id],
    (err, driver) => {
      if (!driver) return res.status(404).send("Driver not found");

      // 🔥 normalize image URLs
      [
        "license_image",
        "car_image_front",
        "car_image_back",
        "car_image_left",
        "car_image_right",
      ].forEach((k) => {
        driver[k] = publicUrl(driver[k]);
      });

      res.render("edit-driver", { driver });
    }
  );
});
// ------------------ EDIT DRIVER ------------------

app.post(
  "/drivers/:id/edit",
  upload.fields([
    { name: "license_image", maxCount: 1 },
    { name: "car_image_front", maxCount: 1 },
    { name: "car_image_back", maxCount: 1 },
    { name: "car_image_left", maxCount: 1 },
    { name: "car_image_right", maxCount: 1 },
  ]),
  (req, res) => { 

    db.get(
      "SELECT * FROM drivers WHERE id=?",
      [req.params.id],
      (_, driver) => {
        if (!driver) return res.status(404).send("Driver not found");

        const updated = {
          license_image:
            fixPath(req.files?.license_image?.[0]) || driver.license_image,
          car_image_front:
            fixPath(req.files?.car_image_front?.[0]) ||
            driver.car_image_front,
          car_image_back:
            fixPath(req.files?.car_image_back?.[0]) ||
            driver.car_image_back,
          car_image_left:
            fixPath(req.files?.car_image_left?.[0]) ||
            driver.car_image_left,
          car_image_right:
            fixPath(req.files?.car_image_right?.[0]) ||
            driver.car_image_right,
        };

        // delete replaced images
        Object.keys(updated).forEach((k) => {
          if (updated[k] !== driver[k]) deleteFile(driver[k]);
        });

        db.run(
          `
          UPDATE drivers SET
            name=?, phone=?, car=?, car_number=?, license=?, notes=?,
            license_image=?, car_image_front=?, car_image_back=?,
            car_image_left=?, car_image_right=?
          WHERE id=?
          `,
          [
            req.body.name,
            req.body.phone,
            req.body.car,
            req.body.car_number,
            req.body.license,
            req.body.notes,
            updated.license_image,
            updated.car_image_front,
            updated.car_image_back,
            updated.car_image_left,
            updated.car_image_right,
            req.params.id,
          ],
          () => res.redirect("/drivers")
        );
      }
    );
  }
);

// ------------------ DELETE DRIVER ------------------

app.post("/drivers/:id/delete", (req, res) => {
  db.get(
    "SELECT * FROM drivers WHERE id=?",
    [req.params.id],
    (_, driver) => {
      if (!driver) return res.sendStatus(404);

      [
        driver.license_image,
        driver.car_image_front,
        driver.car_image_back,
        driver.car_image_left,
        driver.car_image_right,
      ].forEach(deleteFile);

      db.run(
        "DELETE FROM drivers WHERE id=?",
        [req.params.id],
        () => res.sendStatus(200)
      );
    }
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
    (_, rows) => res.json(rows || [])
  );
});

// ------------------ EXPORT CSV ------------------

app.get("/export/csv", (req, res) => {
  db.all("SELECT * FROM trips", [], (_, rows) => {
    if (!rows || !rows.length) return res.send("No data!");

    const fields = Object.keys(rows[0]);
    const csv =
      fields.join(",") +
      "\n" +
      rows
        .map((row) =>
          fields
            .map((f) => {
              let v = row[f];
              if (v == null) v = "";
              v = String(v);
              if (v.includes(",") || v.includes('"') || v.includes("\n")) {
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

// ------------------ MONTH API ------------------

app.get("/api/month-trips", (req, res) => {
  if (!req.query.month) return res.json([]);

  db.all(
    `SELECT * FROM trips
     WHERE departure_date LIKE ?
     ORDER BY departure_date, departure_time`,
    [`${req.query.month}%`],
    (_, rows) => res.json(rows || [])
  );
});

// ------------------ ERROR HANDLER ------------------

app.use((err, req, res, next) => {
  if (err) {
    return res.send(
      `<script>alert("${err.message}");history.back();</script>`
    );
  }
  next();
});

// ------------------ START SERVER ------------------

app.listen(PORT, () => {
  console.log(`🚀 Server running → http://localhost:${PORT}`);
});
