const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const axios = require("axios");
const cors = require("cors");

const app = express();
const PORT = 3001;

// Middleware
app.use(cors({
  origin: "http://localhost:3000", // Allow requests only from this origin
  methods: ["GET", "POST", "DELETE", "PUT", "OPTIONS"], // Allow specific HTTP methods
  allowedHeaders: ["Content-Type"] // Allow specific headers
}));
app.use(bodyParser.json()); // For parsing JSON in request bodies

// Database setup
const db = new sqlite3.Database("./leaderboard.db", (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to SQLite database.");
    db.run(`
      CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        solved INTEGER DEFAULT 0,
        contests INTEGER DEFAULT 0
      )
    `);
  }
});

// API Endpoints

// Add a profile
app.post("/profiles", (req, res) => {
  const { username, solved = 0, contests = 0 } = req.body;

  const query = `INSERT INTO profiles (username, solved, contests) VALUES (?, ?, ?)`;
  db.run(query, [username, solved, contests], function (err) {
    if (err) {
      return res.status(400).json({ error: "Username already exists or invalid input." });
    }
    res.status(201).json({ id: this.lastID, username, solved, contests });
  });
});



// Delete a profile
app.delete("/profiles/:id", (req, res) => {
    const { id } = req.params;
  
    const query = `DELETE FROM profiles WHERE id = ?`;
    db.run(query, [id], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "Profile not found." });
      }
      res.status(200).json({ message: "Profile deleted successfully." });
    });
  });
  

// Get leaderboard
app.get("/leaderboard", (req, res) => {
    const page = parseInt(req.query.page) || 1; // Default to page 1
    const limit = parseInt(req.query.limit) || 5; // Default to 5 profiles per page
    const offset = (page - 1) * limit; // Calculate offset
  
    const query = `
      SELECT * FROM profiles
      ORDER BY solved DESC, contests DESC
      LIMIT ? OFFSET ?
    `;
  
    db.all(query, [limit, offset], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
  
      const countQuery = `SELECT COUNT(*) AS total FROM profiles`;
      db.get(countQuery, [], (err, result) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
  
        const totalProfiles = result.total;
        const totalPages = Math.ceil(totalProfiles / limit);
  
        res.json({ profiles: rows, totalPages });
      });
    });
  });

// Fetch LeetCode profile details
app.get("/leetcode/:username", async (req, res) => {
  const { username } = req.params;

  console.log("Received request for username:", username);

  const query = `
    query getUserProfile($username: String!) {
      matchedUser(username: $username) {
        username
        profile {
          realName
          ranking
        }
        submitStatsGlobal {
          acSubmissionNum {
            count
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      "https://leetcode.com/graphql/",
      {
        query,
        variables: { username },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const user = response.data.data.matchedUser;

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      username: user.username,
      realName: user.profile.realName,
      ranking: user.profile.ranking,
      problemsSolved: user.submitStatsGlobal.acSubmissionNum[0].count,
    });
  } catch (error) {
    console.error("Error fetching data from LeetCode:", error.message);
    res.status(500).json({ error: "Error fetching data from LeetCode" });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
