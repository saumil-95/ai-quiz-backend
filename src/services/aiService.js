// src/services/aiService.js
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🔹 Generate quiz questions using Gemini Pro
async function generateQuizQuestions(grade, subject, totalQuestions, difficulty) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
    Generate ${totalQuestions} ${difficulty} level ${subject} questions
    suitable for grade ${grade}.
    Return strictly in JSON array format, where each element has:
    - questionId (q1, q2, ...)
    - q (question text, like "What is 2 + 3?")
    - options (4 multiple choice answers)
    - correctAnswer (must match one option)

    Example:
    [
      {
        "questionId": "q1",
        "q": "2 + 2 = ?",
        "options": ["3","4","5","6"],
        "correctAnswer": "4"
      }
    ]
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Gemini often returns code fences, strip them
    const cleanText = responseText.replace(/```json|```/g, "").trim();

    const questions = JSON.parse(cleanText);
    return questions;
  } catch (err) {
    console.error("Gemini question generation failed:", err.message);
    return [];
  }
}

// 🔹 Keep improvement tips (you already had this)
async function getImprovementTips(quiz, responses) {
  try {
    const wrongQs = responses.filter(r => {
      const question = quiz.questions.find(q => q.questionId === r.questionId);
      return question && question.correctAnswer !== r.userResponse;
    });

    if (wrongQs.length === 0) {
      return ["🎉 Excellent work! You answered all questions correctly."];
    }

    return wrongQs.map(r => {
      const question = quiz.questions.find(q => q.questionId === r.questionId);
      return `❌ You missed: "${question.q}". Correct answer: "${question.correctAnswer}". Review this concept.`;
    });
  } catch (err) {
    console.error("AI suggestion error:", err);
    return ["⚠️ Error generating suggestions, please try again later."];
  }
}

module.exports = {
  generateQuizQuestions,
  getImprovementTips,
};
