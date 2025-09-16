const express = require('express');
const Quiz = require('../models/Quiz');
const Submission = require('../models/Submission');
const auth = require('../middleware/auth');
const aiService = require('../services/aiService');
const { generateQuestions, generateAISuggestions, generateHint  } = require("../services/questionService");
// const { generateSuggestions } = require("../services/aiService");
const { HfInference } = require("@huggingface/inference"); // Hugging Face client
const { sendQuizResultsEmail } = require('../services/emailService');
// Initialize HF client
const hf = new HfInference(process.env.HF_API_KEY);
const router = express.Router();


// -----------------------------
// 3️⃣ API: Quiz History
// -----------------------------
router.get("/history", async (req, res) => {
  try {
    const { grade, subject, minMarks, maxMarks, from, to } = req.query;
    const username = "guest";

    if (!username) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    let filters = { username };

    if (grade) filters.grade = parseInt(grade);
    if (subject) filters.subject = subject;
    if (minMarks || maxMarks) {
      filters.score = {};
      if (minMarks) filters.score.$gte = parseInt(minMarks);
      if (maxMarks) filters.score.$lte = parseInt(maxMarks);
    }

    if (from && to) {
      filters.submittedAt = {
        $gte: new Date(from),
        $lte: new Date(to)
      };
    }

    const history = await Submission.find(filters).sort({ submittedAt: -1 });

    res.json({ success: true, history });
  } catch (error) {
    console.error("❌ Error fetching quiz history:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/:quizId/retry", async (req, res) => {
  try {
    const { quizId } = req.params;
    const username = "guest"

    if (!username) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const quiz = await Quiz.findOne({ quizId });
    if (!quiz) {
      return res.status(404).json({ success: false, message: "Quiz not found" });
    }

    // New submission (empty responses, score 0 until evaluated)
    const newSubmission = new Submission({
      quizId: quiz.quizId,
      username,
      responses: [],
      score: 0,
      suggestions: []
    });

    await newSubmission.save();

    res.json({
      success: true,
      message: "New attempt created. You can now take the quiz again.",
      submission: newSubmission
    });
  } catch (error) {
    console.error("❌ Error retrying quiz:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});



router.post("/:quizId/hint", auth, async (req, res) => {
  try {
    const { quizId } = req.params;
    const { questionId } = req.body;

    const quiz = await Quiz.findOne({ quizId });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const question = quiz.questions.find(q => q.questionId === questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    // Use getImprovementTips but wrap for a single question
    const hint = `💡 Hint: Think carefully about "${question.q}". One of the options is correct, try eliminating the wrong ones.`;

    res.json({ hint });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});



router.get("/create-quiz", (req, res) => {
  res.render("create-quiz");
});


router.get('/test-email', async (req, res) => {
  try {
    const { sendQuizResultsEmail } = require('../services/emailService');
    
    const testResult = await sendQuizResultsEmail({
      userEmail: 'saumiliant2021@gmail.com', // Replace with your email
      username: '',
      quizData: {
        subject: 'Mathematics',
        grade: 8,
        difficulty: 'MEDIUM',
        quizId: 'test-quiz-123'
      },
      results: {
        score: 7,
        total: 10,
        evaluation: [
          { questionId: 'q1', userResponse: 'A', correctAnswer: 'A', isCorrect: true },
          { questionId: 'q2', userResponse: 'B', correctAnswer: 'C', isCorrect: false }
        ]
      },
      suggestions: [
        'Review basic algebra concepts',
        'Practice more word problems',
        'Focus on calculation accuracy'
      ]
    });
    
    res.json({ success: true, result: testResult });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


router.post('/create-quiz', auth, async (req, res) => {
  try {
    const { grade, subject, difficulty, totalQuestions } = req.body;
    
    // Now req.user should have userId, username, and email
    const username = req.user?.username || 'anonymous';
    const userId = req.user?.userId || null;
    
    console.log(`🎯 Creating quiz for user:`, req.user); // Debug log
    
    // Validate that we have userId
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User authentication required"
      });
    }
    
    console.log(`🎯 Creating quiz: Grade ${grade}, ${subject}, ${difficulty}, ${totalQuestions} questions for ${username} (ID: ${userId})`);
    
    // Step 1: Validate difficulty format (convert to uppercase)
    const validDifficulty = difficulty.toUpperCase();
    if (!['EASY', 'MEDIUM', 'HARD'].includes(validDifficulty)) {
      return res.status(400).json({
        success: false,
        message: "Difficulty must be EASY, MEDIUM, or HARD"
      });
    }
    
    // Step 2: Generate questions using AI
    console.log("🤖 Generating questions with AI...");
    const generatedQuestions = await generateQuestions(grade, subject, difficulty, totalQuestions);
    
    if (!generatedQuestions || generatedQuestions.length === 0) {
      return res.status(500).json({ 
        success: false, 
        message: "Failed to generate questions" 
      });
    }
    
    console.log(`✅ AI generated ${generatedQuestions.length} questions`);
    
    // Step 3: Transform questions to match your schema
    const transformedQuestions = generatedQuestions.map((q, index) => ({
      questionId: q.questionId || `q${index + 1}`,
      q: q.question, // Your schema uses 'q' not 'question'
      options: q.options,
      correctAnswer: q.answer, // Your schema uses 'correctAnswer' not 'answer'
      difficulty: validDifficulty
    }));
    
    // Step 4: Generate unique quiz ID
    const quizId = `quiz_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    
    // Step 5: Create quiz object matching your exact schema
    const quizData = {
      quizId: quizId,
      grade: parseInt(grade),
      subject: subject,
      totalQuestions: transformedQuestions.length,
      maxScore: transformedQuestions.length,
      difficulty: validDifficulty,
      questions: transformedQuestions,
      createdBy: username,
      userId: userId, // This should now be properly set
      createdAt: new Date()
    };
    
    console.log('Quiz data to save:', {
      quizId: quizData.quizId,
      createdBy: quizData.createdBy,
      userId: quizData.userId
    }); // Debug log
    
    // Step 6: Save to database
    console.log("💾 Saving quiz to database...");
    const newQuiz = new Quiz(quizData);
    const savedQuiz = await newQuiz.save();
    
    console.log(`✅ Quiz saved with ID: ${savedQuiz._id}`);
    
    // Step 7: Return success response
    res.status(201).json({
      success: true,
      message: `Quiz created successfully with ${transformedQuestions.length} questions`,
      quiz: {
        id: savedQuiz._id,
        quizId: savedQuiz.quizId,
        grade: savedQuiz.grade,
        subject: savedQuiz.subject,
        difficulty: savedQuiz.difficulty,
        totalQuestions: savedQuiz.totalQuestions,
        maxScore: savedQuiz.maxScore,
        createdBy: savedQuiz.createdBy,
        userId: savedQuiz.userId,
        createdAt: savedQuiz.createdAt
      },
      questions: savedQuiz.questions
    });
    
  } catch (error) {
    console.error("❌ Error creating quiz:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error creating quiz: " + error.message 
    });
  }
});


router.post("/:quizId/submit-ejs", auth, async (req, res) => {
  try {
    const { quizId } = req.params;
    const username = req.user?.username || "guest";
    const userId = req.user?.userId || null;
    const responses = req.body.responses || {};
    const sendEmail = req.body.sendEmail !== false; // Default to true, allow opt-out
    
    console.log(`📊 Quiz submitted by ${username} - Email notification: ${sendEmail ? 'enabled' : 'disabled'}`);
    
    const responseArray = Object.entries(responses).map(([questionId, answer]) => ({
      questionId,
      userResponse: answer
    }));
    
    // Get the actual quiz to calculate correct answers
    const quiz = await Quiz.findOne({ quizId });
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found"
      });
    }
    
    // Calculate actual results based on quiz questions
    const evaluation = responseArray.map(response => {
      const question = quiz.questions.find(q => q.questionId === response.questionId);
      const isCorrect = question && question.correctAnswer === response.userResponse;
      
      return {
        ...response,
        correctAnswer: question ? question.correctAnswer : 'Unknown',
        isCorrect: isCorrect
      };
    });
    
    const score = evaluation.filter(r => r.isCorrect).length;
    
    console.log(`📊 Quiz results: ${score}/${evaluation.length} correct`);
    
    // Generate AI suggestions with retry logic
    let aiSuggestions;
    try {
      aiSuggestions = await generateAISuggestions(score, evaluation);
      console.log(`✅ AI suggestions generated:`, aiSuggestions);
    } catch (error) {
      console.error(`🚨 Failed to generate AI suggestions:`, error.message);
      aiSuggestions = [
        "Review the questions you got wrong and understand the correct answers.",
        "Practice more questions in areas where you struggled.",
        "Consider studying the topic more thoroughly before attempting again."
      ];
    }
    
    // Save submission to DB
    const submission = new Submission({
      quizId,
      username,
      userId,
      responses: evaluation,
      score,
      suggestions: aiSuggestions,
      emailSent: false // Track email status
    });
    
    await submission.save();
    
    // Send email notification if requested and user is authenticated
    if (sendEmail && userId) {
      try {
        // Get user's email
        const user = await User.findById(userId).select('email');
        
        if (user && user.email) {
          const emailResult = await sendQuizResultsEmail({
            userEmail: user.email,
            username: username,
            quizData: {
              subject: quiz.subject,
              grade: quiz.grade,
              difficulty: quiz.difficulty,
              quizId: quiz.quizId
            },
            results: {
              score: score,
              total: evaluation.length,
              evaluation: evaluation
            },
            suggestions: aiSuggestions
          });
          
          if (emailResult.success) {
            // Update submission to mark email as sent
            await Submission.findByIdAndUpdate(submission._id, { emailSent: true });
            console.log('✅ Email notification sent and recorded');
          }
        } else {
          console.log('⚠️ User email not found - skipping email notification');
        }
      } catch (emailError) {
        console.error('❌ Email notification failed:', emailError.message);
        // Don't fail the entire request if email fails
      }
    }
    
    // Return results (you can change this to res.json for API-only response)
    res.render("quiz-result", {
      score,
      total: evaluation.length,
      evaluation,
      suggestions: aiSuggestions,
      emailSent: sendEmail && userId ? true : false
    });
    
  } catch (err) {
    console.error("🚨 Route handler error:", err);
    res.status(500).json({ 
      error: "Failed to process quiz submission",
      message: err.message 
    });
  }
});
// -----------------------------
// 6️⃣ EJS: Submit Quiz Form
// -----------------------------
// router.post("/:quizId/submit-ejs", auth, async (req, res) => {
// router.post("/:quizId/submit-ejs", async (req, res) => {
//   try {
//     const { quizId } = req.params;
//     const responses = req.body.responses || {}; // fallback to empty object
//     const responseArray = Object.entries(responses).map(([questionId, answer]) => ({
//       questionId,
//       userAnswer: answer
//     }));

//     // Mock evaluation (replace with DB logic later)
//     const evaluation = responseArray.map(r => ({
//       ...r,
//       correctAnswer: ["A", "B", "C", "D"][Math.floor(Math.random() * 4)],
//       isCorrect: Math.random() > 0.5
//     }));

//     const score = evaluation.filter(r => r.isCorrect).length;

//     res.render("quiz-result", {
//       score,
//       total: evaluation.length,
//       evaluation
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Server Error");
//   }
// });


// router.post("/:quizId/submit-ejs", async (req, res) => {
//   try {
//     const { quizId } = req.params;
//     const username = req.user?.username || "guest"; // if JWT auth, extract username

//     const responses = req.body.responses || {}; 
//     const responseArray = Object.entries(responses).map(([questionId, answer]) => ({
//       questionId,
//       userResponse: answer
//     }));

//     // Mock evaluation (replace later with real DB-stored answers)
//     const evaluation = responseArray.map(r => ({
//       ...r,
//       correctAnswer: ["A", "B", "C", "D"][Math.floor(Math.random() * 4)],
//       isCorrect: Math.random() > 0.5
//     }));

//     const score = evaluation.filter(r => r.isCorrect).length;

//     // 🔹 Generate AI suggestions dynamically
//     const suggestionPrompt = `
//     A student took a quiz with score ${score}/${evaluation.length}.
//     Based on their incorrect answers: 
//     ${evaluation
//       .filter(e => !e.isCorrect)
//       .map(e => `Question ${e.questionId} -> they answered ${e.userResponse}, correct is ${e.correctAnswer}`)
//       .join("\n")}
//     Give 3 short and practical improvement suggestions.
//     `;

//     let aiSuggestions = [];
//     try {
//       const aiResp = await hf.textGeneration({
//         model: "gpt2", // ✅ simple + free model
//         inputs: suggestionPrompt,
//         parameters: { max_new_tokens: 100 }
//       });
//       aiSuggestions = aiResp.generated_text
//         .split("\n")
//         .filter(line => line.trim())
//         .slice(0, 3); // take first 3 suggestions
//     } catch (err) {
//       console.error("❌ AI suggestion error:", err.message);
//       aiSuggestions = ["Review weak topics.", "Practice more quizzes.", "Revise fundamentals."]; // fallback
//     }

//     // 🔹 Save in MongoDB
//     const submission = new Submission({
//       quizId,
//       username,
//       responses: evaluation, // store detailed responses
//       score,
//       suggestions: aiSuggestions
//     });
//     await submission.save();

//     // 🔹 Render result page
//     res.render("quiz-result", {
//       score,
//       total: evaluation.length,
//       evaluation,
//       suggestions: aiSuggestions
//     });

//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Server Error");
//   }
// });
router.post("/:quizId/submit-ejs",auth, async (req, res) => {
  try {
    const { quizId } = req.params;
    const username = req.user?.username || "guest";
    const userId = req.user?.userId || null; // ADD THIS LINE
    const responses = req.body.responses || {};
    
    const responseArray = Object.entries(responses).map(([questionId, answer]) => ({
      questionId,
      userResponse: answer
    }));
    
    const evaluation = responseArray.map(r => ({
      ...r,
      correctAnswer: ["A", "B", "C", "D"][Math.floor(Math.random() * 4)],
      isCorrect: Math.random() > 0.5
    }));
    
    const score = evaluation.filter(r => r.isCorrect).length;
    
    console.log(`📊 Quiz submitted: ${score}/${evaluation.length} correct`);
    
    // Generate AI suggestions with retry logic
    let aiSuggestions;
    try {
      aiSuggestions = await generateAISuggestions(score, evaluation);
      console.log(`✅ AI suggestions generated:`, aiSuggestions);
    } catch (error) {
      console.error(`🚨 Failed to generate AI suggestions:`, error.message);
      // If AI completely fails, return error message
      aiSuggestions = [
        "Unable to generate personalized suggestions at this time.",
        "Please try submitting the quiz again.",
        "Contact support if this issue persists."
      ];
    }
    
    // Save submission to DB
    const submission = new Submission({
      quizId,
      username,
      userId, // ADD THIS LINE - Store the user's ObjectId
      responses: evaluation,
      score,
      suggestions: aiSuggestions
    });
    
    await submission.save();
    
    res.render("quiz-result", {
      score,
      total: evaluation.length,
      evaluation,
      suggestions: aiSuggestions
    });
    
  } catch (err) {
    console.error("🚨 Route handler error:", err);
    res.status(500).json({ 
      error: "Failed to process quiz submission",
      message: err.message 
    });
  }
});

// Fixed route handler with better error handling
router.post("/:quizId/question/:questionId/hint", async (req, res) => {
  try {
    const { quizId, questionId } = req.params;

    console.log(`🎯 Hint requested for quizId: ${quizId}, questionId: ${questionId}`);

    // Validate parameters
    if (!quizId || !questionId) {
      return res.status(400).json({ 
        error: "Missing required parameters: quizId and questionId" 
      });
    }

    // Fetch quiz from DB with better error handling
    let quiz;
    try {
      quiz = await Quiz.findOne({ quizId });
    } catch (dbError) {
      console.error("🚨 Database error:", dbError);
      return res.status(500).json({ error: "Database connection error" });
    }

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    // Find question with better validation
    const question = quiz.questions.find(q => q.questionId === questionId);
    if (!question) {
      return res.status(404).json({ error: "Question not found in quiz" });
    }

    // Validate question structure
    if (!question.q || !question.options || !Array.isArray(question.options)) {
      return res.status(400).json({ 
        error: "Invalid question structure: missing question text or options" 
      });
    }

    console.log("📝 Question found:", {
      question: question.q,
      optionsCount: question.options.length
    });

    // Generate hint using AI service
    let hint;
    try {
      hint = await generateHint(question.q, question.options);
    } catch (aiError) {
      console.error("🚨 AI Service error:", aiError);
      
      // Return appropriate error based on the AI error
      if (aiError.message.includes("OPENROUTER_API_KEY")) {
        return res.status(500).json({ 
          error: "AI service configuration error" 
        });
      } else if (aiError.message.includes("Network error")) {
        return res.status(503).json({ 
          error: "AI service temporarily unavailable" 
        });
      } else {
        return res.status(500).json({ 
          error: "Failed to generate hint. Please try again." 
        });
      }
    }

    console.log("✅ Hint generated successfully");
    res.json({ 
      hint,
      questionId: questionId,
      quizId: quizId
    });

  } catch (err) {
    console.error("🚨 Unexpected error in hint route:", err);
    res.status(500).json({ 
      error: "An unexpected error occurred while generating hint" 
    });
  }
});

// Additional: Environment check function (call this on server startup)
function checkEnvironment() {
  const required = ['OPENROUTER_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    console.error('Please add them to your .env file');
    process.exit(1);
  }
  
  console.log('✅ Environment variables validated');
}

// // Alternative: Get hint during quiz taking (AJAX endpoint)
// router.get("/hint/:questionId", async (req, res) => {
//   try {
//     const { questionId } = req.params;
//     const { question, optionA, optionB, optionC, optionD, correctAnswer } = req.query;
    
//     if (!question || !correctAnswer) {
//       return res.status(400).json({ error: "Missing required question data" });
//     }
    
//     const options = {
//       A: optionA,
//       B: optionB, 
//       C: optionC,
//       D: optionD
//     };
    
//     console.log(`💡 Quick hint requested for: ${question.substring(0, 50)}...`);
    
//     try {
//       const hint = await generateHint(question, options, correctAnswer);
      
//       res.json({ 
//         success: true, 
//         hint: hint 
//       });
      
//     } catch (error) {
//       console.error(`🚨 Failed to generate quick hint:`, error.message);
//       res.status(500).json({ 
//         success: false, 
//         error: "Hint unavailable right now. Try thinking about the key concepts!" 
//       });
//     }
    
//   } catch (err) {
//     console.error("🚨 Quick hint route error:", err);
//     res.status(500).json({ 
//       error: "Server error",
//       message: err.message 
//     });
//   }
// });



module.exports = router;
