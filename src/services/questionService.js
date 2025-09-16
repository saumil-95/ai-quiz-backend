// Dynamic AI Question Generation - NO PREDEFINED QUESTIONS
// Uses multiple free AI APIs to generate real questions

const { HfInference } = require("@huggingface/inference");
const axios = require('axios');



async function generateQuestions(grade, subject, difficulty, totalQuestions) {
  console.log(`🎯 AI Generating ${totalQuestions} ${difficulty} ${subject} questions for Grade ${grade}`);

  // Try Method 1: OpenRouter (Free - Most Reliable)
  let questions = await tryOpenRouterGeneration(grade, subject, difficulty, totalQuestions);
  if (questions && questions.length > 0) {
    console.log(`✅ OpenRouter generated ${questions.length} questions`);
    return questions;
  }

  // Try Method 2: Groq (Free - Fast)
  questions = await tryGroqGeneration(grade, subject, difficulty, totalQuestions);
  if (questions && questions.length > 0) {
    console.log(`✅ Groq generated ${questions.length} questions`);
    return questions;
  }

  // Try Method 3: Hugging Face (with working models)
  questions = await tryHuggingFaceGeneration(grade, subject, difficulty, totalQuestions);
  if (questions && questions.length > 0) {
    console.log(`✅ HuggingFace generated ${questions.length} questions`);
    return questions;
  }

  throw new Error("❌ All AI services failed. Please check your API keys or try again later.");
}

// Method 1: OpenRouter (Most Reliable Free Option)
async function tryOpenRouterGeneration(grade, subject, difficulty, totalQuestions) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.log("⚠️ OPENROUTER_API_KEY not found, skipping...");
    return null;
  }

  try {
    console.log("🔄 Trying OpenRouter API...");
    
    const prompt = createPrompt(grade, subject, difficulty, totalQuestions);
    
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: "meta-llama/llama-3.2-3b-instruct:free", 
      messages: [
        {
          role: "system",
          content: "You are an expert educator. Generate high-quality quiz questions in the exact format requested. Be precise and educational."
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Quiz Generator'
      }
    });

    const text = response.data.choices[0].message.content;
    return parseQuestionsFromText(text, totalQuestions);
    
  } catch (error) {
    console.log("❌ OpenRouter failed:", error.response?.data?.error || error.message);
    return null;
  }
}

// Method 2: Groq 
async function tryGroqGeneration(grade, subject, difficulty, totalQuestions) {
  if (!process.env.GROQ_API_KEY) {
    console.log("⚠️ GROQ_API_KEY not found, skipping...");
    return null;
  }

  try {
    console.log("🔄 Trying Groq API...");
    
    const prompt = createPrompt(grade, subject, difficulty, totalQuestions);
    
    const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: "llama3-8b-8192",
      messages: [
        {
          role: "system",
          content: "You are an expert educator. Generate educational quiz questions in the exact format requested."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const text = response.data.choices[0].message.content;
    return parseQuestionsFromText(text, totalQuestions);
    
  } catch (error) {
    console.log("❌ Groq failed:", error.response?.data?.error || error.message);
    return null;
  }
}

// Method 3: Hugging Face (Fallback)
async function tryHuggingFaceGeneration(grade, subject, difficulty, totalQuestions) {
  if (!process.env.HUGGINGFACE_API_KEY) {
    console.log("⚠️ HUGGINGFACE_API_KEY not found, skipping...");
    return null;
  }

  const client = new HfInference(process.env.HUGGINGFACE_API_KEY);
  const workingModels = [
    "microsoft/DialoGPT-medium",
    "facebook/blenderbot-400M-distill",
    "microsoft/DialoGPT-small"
  ];

  for (const model of workingModels) {
    try {
      console.log(`🔄 Trying HuggingFace model: ${model}`);
      
      const prompt = createPrompt(grade, subject, difficulty, totalQuestions);
      
      const response = await client.textGeneration({
        model: model,
        inputs: prompt,
        parameters: {
          max_new_tokens: 1500,
          temperature: 0.8,
          do_sample: true,
          return_full_text: false
        }
      });

      const text = response.generated_text;
      const questions = parseQuestionsFromText(text, totalQuestions);
      
      if (questions && questions.length > 0) {
        return questions;
      }
      
    } catch (error) {
      console.log(`❌ HF model ${model} failed:`, error.message);
      continue;
    }
  }
  
  return null;
}

// Create optimized prompt for AI generation
function createPrompt(grade, subject, difficulty, totalQuestions) {
  return `Generate exactly ${totalQuestions} multiple-choice questions for Grade ${grade} ${subject} at ${difficulty} difficulty level.

Format each question exactly like this:

Q1: What is photosynthesis?
A) Plant respiration process
B) Process of making food using sunlight
C) Root absorption method
D) Leaf growth mechanism
Answer: B

Q2: Which planet is closest to the sun?
A) Venus
B) Earth
C) Mercury
D) Mars
Answer: C

Requirements:
- Questions must be educational and age-appropriate for Grade ${grade}
- Cover ${subject} topics relevant to ${difficulty} level
- Each question must have exactly 4 options (A, B, C, D)
- Clearly indicate the correct answer
- Make questions challenging but fair
- Avoid overly obvious or trick questions

Generate ${totalQuestions} questions now:`;
}

// Parse AI response into structured question format
function parseQuestionsFromText(text, expectedCount) {
  const questions = [];
  console.log("📝 Parsing AI response:", text.substring(0, 300) + "...");
  
  // Split by Q1:, Q2:, etc. or just Q:
  const questionBlocks = text.split(/Q\d*:\s*/i).filter(block => block.trim());
  
  for (let i = 0; i < Math.min(questionBlocks.length, expectedCount); i++) {
    const block = questionBlocks[i].trim();
    if (!block) continue;
    
    try {
      const question = parseQuestionBlock(block, i + 1);
      if (question && question.question && question.options.length === 4) {
        questions.push(question);
      }
    } catch (err) {
      console.log(`⚠️ Failed to parse question ${i + 1}:`, err.message);
      continue;
    }
  }
  
  console.log(`📊 Successfully parsed ${questions.length}/${expectedCount} questions`);
  return questions;
}

// Parse individual question block
function parseQuestionBlock(block, questionNum) {
  // Extract question text (everything before first A) option)
  const questionMatch = block.match(/^([^A-D]*?)(?=A\))/s);
  if (!questionMatch) throw new Error("No question text found");
  
  const questionText = questionMatch[1].replace(/^Q\d*:\s*/, '').trim();
  if (!questionText) throw new Error("Empty question text");
  
  // Extract options A), B), C), D)
  const optionRegex = /([A-D]\)\s*[^\n\r]*)/gi;
  const optionMatches = block.match(optionRegex);
  
  if (!optionMatches || optionMatches.length < 4) {
    throw new Error(`Only found ${optionMatches?.length || 0} options, need 4`);
  }
  
  const options = optionMatches.slice(0, 4).map(opt => opt.trim());
  
  // Extract correct answer
  const answerMatch = block.match(/Answer:\s*([A-D])/i) || block.match(/Correct:\s*([A-D])/i);
  const answer = answerMatch ? answerMatch[1].toUpperCase() : 'A';
  
  return {
    questionId: `q${questionNum}`,
    question: questionText,
    options: options,
    answer: answer
  };
}




// aiSuggestionsService.js
async function generateAISuggestions(score, evaluation) {
  // Current working free models on OpenRouter (as of 2024)
  const freeModels = [
    "google/gemma-2-9b-it:free",
    "microsoft/phi-3-medium-128k-instruct:free", 
    "microsoft/phi-3-mini-128k-instruct:free",
    "meta-llama/llama-3.2-11b-vision-instruct:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "meta-llama/llama-3.2-1b-instruct:free",
    "qwen/qwen-2-7b-instruct:free",
    "huggingfaceh4/zephyr-7b-beta:free"
  ];

  const incorrectAnswers = evaluation.filter(e => !e.isCorrect);
  
  let prompt;
  if (incorrectAnswers.length === 0) {
    prompt = `A student scored perfectly ${score}/${evaluation.length} on a quiz! Generate exactly 3 encouraging suggestions to help them continue learning and challenge themselves further. Make each suggestion specific and actionable.`;
  } else {
    const wrongQuestions = incorrectAnswers
      .map(e => `Question ${e.questionId}: Student chose "${e.userResponse}" but correct answer was "${e.correctAnswer}"`)
      .join('\n');
    
    prompt = `A student scored ${score}/${evaluation.length} on a quiz and made these mistakes:

${wrongQuestions}

Based on these specific errors, provide exactly 3 personalized improvement suggestions. Each suggestion should be actionable and help address the mistakes made. Format as a simple numbered list.`;
  }

  // Try each model until one works
  for (let i = 0; i < freeModels.length; i++) {
    const model = freeModels[i];
    
    try {
      console.log(`🤖 Trying model: ${model}`);
      
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": process.env.YOUR_SITE_URL || "http://localhost:3000",
          "X-Title": process.env.YOUR_SITE_NAME || "Quiz App",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "system", 
              content: "You are a helpful tutor. Provide exactly 3 specific study suggestions as a numbered list. Be encouraging and actionable."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: 700,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`❌ Model ${model} failed: ${response.status} - ${errorText}`);
        continue; // Try next model
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.log(`❌ Model ${model} returned invalid response structure`);
        continue;
      }

      const aiResponse = data.choices[0].message.content.trim();
      console.log(`✅ AI Response from ${model}:`, aiResponse);

      // Parse the response to extract exactly 3 suggestions
      const lines = aiResponse.split('\n').filter(line => line.trim().length > 0);
      const suggestions = [];
      
      for (const line of lines) {
        // Remove numbers, bullets, and clean up
        let cleaned = line
          .replace(/^\d+[\.\)]\s*/, '')  // Remove "1. " or "1) "
          .replace(/^[-•*]\s*/, '')      // Remove bullet points
          .trim();
        
        if (cleaned.length > 50) { // Only keep substantial suggestions
          suggestions.push(cleaned);
        }
        
        if (suggestions.length === 3) break;
      }

      if (suggestions.length === 3) {
        console.log(`🎯 Successfully generated 3 AI suggestions using ${model}`);
        return suggestions;
      } else {
        console.log(`⚠️ Model ${model} only generated ${suggestions.length} suggestions, trying next...`);
      }

    } catch (error) {
      console.log(`❌ Error with model ${model}:`, error.message);
      continue;
    }
  }

  // If all models fail, throw error
  throw new Error("All AI models failed to generate suggestions");
}









async function generateHint(question, options) {
  // Check for API key
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("❌ OPENROUTER_API_KEY missing in .env file");
  }

  // Validate inputs
  if (!question || !options || !Array.isArray(options)) {
    throw new Error("❌ Invalid question or options provided");
  }

  const prompt = `You are a helpful quiz assistant.
Provide a short helpful hint (not the answer) for this quiz question.

Question: ${question}
Options: ${options.join(", ")}

Please provide a brief hint that guides the user toward the correct answer without revealing it directly.`;

  try {
    console.log("🤖 Generating AI hint...");
    
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000", // Optional: your app URL
        "X-Title": "Quiz App Hint Generator" // Optional: app name
      },
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo",
        messages: [
          { 
            role: "system", 
            content: "You are a helpful quiz assistant. Provide hints that guide users toward the answer without revealing it directly. Keep hints concise and educational." 
          },
          { role: "user", content: prompt }
        ],
        max_tokens: 100,
        temperature: 0.7, // Add some creativity
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🚨 OpenRouter API Error:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`OpenRouter API error: ${response.status} - ${response.statusText}`);
    }

    const data = await response.json();
    
    // Better validation of response
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error("🚨 Invalid API response structure:", data);
      throw new Error("Invalid response structure from OpenRouter API");
    }

    const hint = data.choices[0].message.content?.trim();
    
    if (!hint) {
      throw new Error("No hint content received from API");
    }

    console.log("✅ Hint generated successfully");
    return hint;

  } catch (fetchError) {
    console.error("🚨 Fetch Error:", fetchError);
    
    // Handle network errors
    if (fetchError.code === 'ENOTFOUND' || fetchError.code === 'ECONNREFUSED') {
      throw new Error("Network error: Unable to connect to OpenRouter API");
    }
    
    // Re-throw other errors
    throw fetchError;
  }
}


module.exports = {
  generateHint,
  generateAISuggestions ,
  generateQuestions
};

