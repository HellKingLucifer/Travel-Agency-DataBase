const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./travel_agency.db");

db.run(
  "ALTER TABLE trips RENAME COLUMN referal TO referral",
  (err) => {
    if (err) console.error(err.message);
    else console.log("✅ Column renamed successfully");
    db.close();
  }
);