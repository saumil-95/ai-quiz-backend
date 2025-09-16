const express = require('express');
const Submission = require('../models/Submission');
const Quiz = require('../models/Quiz');
const auth = require('../middleware/auth');
const aiService = require('../services/aiService');
const router = express.Router();

// Submit answers
router.post('/:quizId/submit', async (req, res) => {
  const { answers } = req.body;
  const quiz = await Quiz.findById(req.params.quizId);

  let totalScore = 0, feedback = {};
  for (let ans of answers) {
    const q = quiz.questions.id(ans.questionId);
    if (!q) continue;

    const result = await aiService.evaluateAnswer(q, ans.answer);
    totalScore += result.score;
    feedback[q._id] = result;
  }

  const submission = await Submission.create({
    user: req.user.username || 'anonymous',
    quizId: quiz._id,
    answers,
    score: totalScore,
    feedback
  });

  const suggestions = await aiService.generateSuggestions(feedback);
  res.json({ submission, suggestions });
});

module.exports = router;
