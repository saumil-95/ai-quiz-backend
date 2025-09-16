const mongoose = require("mongoose");

const ResponseSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  userResponse: { type: String, required: true },
  correctAnswer: { type: String },
  isCorrect: { type: Boolean }
});

const SubmissionSchema = new mongoose.Schema({
  quizId: { type: String, required: true },
  username: { type: String, required: true }, // from JWT
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // ADD THIS LINE
  responses: [ResponseSchema],
  score: { type: Number, required: true },
  suggestions: [String], // AI improvement tips
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Submission", SubmissionSchema);
