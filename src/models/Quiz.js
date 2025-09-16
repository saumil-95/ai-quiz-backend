const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  q: { type: String, required: true },
  options: [String],
  correctAnswer: { type: String, required: true },
  difficulty: { type: String, enum: ["EASY", "MEDIUM", "HARD"] }
});

const QuizSchema = new mongoose.Schema({
  quizId: { type: String, required: true, unique: true },
  grade: { type: Number, required: true },
  subject: { type: String, required: true },
  totalQuestions: { type: Number, required: true },
  maxScore: { type: Number, required: true },
  difficulty: { type: String, enum: ["EASY", "MEDIUM", "HARD"], required: true },
  questions: [QuestionSchema],
  createdBy: { type: String, required: true }, // username from JWT
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
  // adaptiveSettings: { // NEW: Store adaptive distribution used
  //   easy: Number,
  //   medium: Number,
  //   hard: Number,
  //   reasoning: String
  // },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Quiz", QuizSchema);
