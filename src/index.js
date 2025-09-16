require('dotenv').config();
const express = require('express');
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quiz');
const submissionRoutes = require('./routes/submission');
const leaderboardRoutes = require('./routes/leaderboard');

// console.log("Gemini API Key:", process.env.GEMINI_API_KEY ? "Loaded ✅" : "Missing ❌");

const app = express();
connectDB();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


app.get("/", (req, res) => {
    res.json({ message: "AI Quizzer API is running 🚀" });
  });

  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });
  
app.use('/auth', authRoutes);
app.use('/quiz', quizRoutes);
app.use('/submissions', submissionRoutes);
app.use('/leaderboard', leaderboardRoutes);

app.listen(process.env.PORT, () => console.log(`Server running on port ${process.env.PORT}`));
