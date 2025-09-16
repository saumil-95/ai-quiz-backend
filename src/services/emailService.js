const nodemailer = require('nodemailer');


/**
 * Configure email transporter
 * You can use Gmail, Outlook, SendGrid, or any SMTP service
 */
function createEmailTransporter() {
  // Option 1: Gmail Configuration
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER, // your-email@gmail.com
        pass: process.env.EMAIL_APP_PASSWORD // Gmail App Password (not regular password)
      }
    });
  }
  
  // Option 2: SMTP Configuration (for other providers)
  if (process.env.EMAIL_SERVICE === 'smtp') {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST, // e.g., smtp.gmail.com
      port: process.env.SMTP_PORT || 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  // Option 3: SendGrid Configuration
  if (process.env.EMAIL_SERVICE === 'sendgrid') {
    return nodemailer.createTransport({
      service: 'SendGrid',
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });
  }

  // Default fallback (Gmail)
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    }
  });
}

/**
 * Send quiz results via email
 * @param {Object} params - Email parameters
 * @param {string} params.userEmail - Recipient email
 * @param {string} params.username - User's name
 * @param {Object} params.quizData - Quiz information
 * @param {Object} params.results - Quiz results
 * @param {Array} params.suggestions - AI suggestions
 */
async function sendQuizResultsEmail({ userEmail, username, quizData, results, suggestions }) {
  try {
    console.log(`📧 Sending quiz results email to ${userEmail}`);
    
    const transporter = createEmailTransporter();
    
    // Verify transporter configuration
    await transporter.verify();
    console.log('✅ Email transporter verified successfully');
    
    // Generate email content
    const emailContent = generateResultsEmailHTML({
      username,
      quizData,
      results,
      suggestions
    });
    
    const mailOptions = {
      from: `"${process.env.APP_NAME || 'AI Quiz Generator'}" <${process.env.EMAIL_USER}>`,
      to: userEmail,
      subject: `🎯 Quiz Results: ${quizData.subject} (Grade ${quizData.grade})`,
      html: emailContent,
      // Also include plain text version
      text: generateResultsEmailText({ username, quizData, results, suggestions })
    };
    
    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId,
      message: 'Quiz results sent via email successfully'
    };
    
  } catch (error) {
    console.error('❌ Error sending email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Generate HTML email content for quiz results
 */
function generateResultsEmailHTML({ username, quizData, results, suggestions }) {
  const { score, total, evaluation } = results;
  const percentage = Math.round((score / total) * 100);
  
  // Performance level and color
  let performanceLevel, performanceColor;
  if (percentage >= 80) {
    performanceLevel = "Excellent! 🏆";
    performanceColor = "#4CAF50";
  } else if (percentage >= 60) {
    performanceLevel = "Good Job! 👍";
    performanceColor = "#FF9800";
  } else if (percentage >= 40) {
    performanceLevel = "Keep Practicing! 📚";
    performanceColor = "#FF5722";
  } else {
    performanceLevel = "Need More Study 💪";
    performanceColor = "#F44336";
  }
  
  // Generate detailed results
  const detailedResults = evaluation.map((item, index) => `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px; text-align: center; font-weight: bold;">${index + 1}</td>
      <td style="padding: 12px;">${item.questionId}</td>
      <td style="padding: 12px;">${item.userResponse || 'No answer'}</td>
      <td style="padding: 12px;">${item.correctAnswer}</td>
      <td style="padding: 12px; text-align: center;">
        <span style="color: ${item.isCorrect ? '#4CAF50' : '#F44336'}; font-weight: bold;">
          ${item.isCorrect ? '✅' : '❌'}
        </span>
      </td>
    </tr>
  `).join('');
  
  // Generate suggestions list
  const suggestionsList = suggestions.map(suggestion => 
    `<li style="margin: 8px 0; line-height: 1.6;">${suggestion}</li>`
  ).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quiz Results</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
        <h1 style="color: white; margin: 0; font-size: 28px;">🎯 Quiz Results</h1>
        <p style="color: #f0f0f0; margin: 10px 0 0 0; font-size: 16px;">Your performance summary is ready!</p>
    </div>
    
    <!-- Greeting -->
    <div style="margin-bottom: 25px;">
        <h2 style="color: #333; margin-bottom: 10px;">Hello ${username}! 👋</h2>
        <p style="margin: 0; font-size: 16px;">Thank you for completing the quiz. Here are your detailed results:</p>
    </div>
    
    <!-- Quiz Info -->
    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 25px; border-left: 4px solid #007bff;">
        <h3 style="margin: 0 0 15px 0; color: #007bff;">📋 Quiz Information</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 20px;">
            <div><strong>Subject:</strong> ${quizData.subject}</div>
            <div><strong>Grade:</strong> ${quizData.grade}</div>
            <div><strong>Difficulty:</strong> ${quizData.difficulty}</div>
            <div><strong>Total Questions:</strong> ${total}</div>
        </div>
    </div>
    
    <!-- Score Summary -->
    <div style="background: white; border: 2px solid ${performanceColor}; border-radius: 10px; padding: 25px; text-align: center; margin-bottom: 25px;">
        <h3 style="margin: 0 0 15px 0; color: ${performanceColor};">${performanceLevel}</h3>
        <div style="font-size: 48px; font-weight: bold; color: ${performanceColor}; margin: 15px 0;">${score}/${total}</div>
        <div style="font-size: 24px; font-weight: bold; color: ${performanceColor};">${percentage}%</div>
        <div style="margin-top: 15px; font-size: 16px; color: #666;">
            You answered <strong>${score}</strong> out of <strong>${total}</strong> questions correctly
        </div>
    </div>
    
    <!-- Detailed Results -->
    <div style="margin-bottom: 25px;">
        <h3 style="color: #333; margin-bottom: 15px;">📊 Detailed Results</h3>
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th style="padding: 15px; text-align: center; font-weight: bold; color: #333;">#</th>
                        <th style="padding: 15px; text-align: left; font-weight: bold; color: #333;">Question</th>
                        <th style="padding: 15px; text-align: left; font-weight: bold; color: #333;">Your Answer</th>
                        <th style="padding: 15px; text-align: left; font-weight: bold; color: #333;">Correct Answer</th>
                        <th style="padding: 15px; text-align: center; font-weight: bold; color: #333;">Result</th>
                    </tr>
                </thead>
                <tbody>
                    ${detailedResults}
                </tbody>
            </table>
        </div>
    </div>
    
    <!-- AI Suggestions -->
    <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin-bottom: 25px; border-left: 4px solid #4CAF50;">
        <h3 style="margin: 0 0 15px 0; color: #2e7d32;">🤖 AI-Powered Learning Suggestions</h3>
        <ul style="margin: 0; padding-left: 20px;">
            ${suggestionsList}
        </ul>
    </div>
    
    <!-- Call to Action -->
    <div style="text-align: center; margin: 30px 0;">
        <p style="font-size: 16px; margin-bottom: 20px;">Ready for your next challenge?</p>
        <a href="${process.env.APP_URL || 'http://localhost:8080'}" 
           style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px;">
            Take Another Quiz 🚀
        </a>
    </div>
    
    <!-- Footer -->
    <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
        <p>Generated by ${process.env.APP_NAME || 'AI Quiz Generator'} 🎓</p>
        <p style="margin: 5px 0;">Keep learning, keep growing! 📚</p>
        <p style="margin: 5px 0; font-size: 12px;">
            This email was sent automatically. Please do not reply to this email.
        </p>
    </div>
</body>
</html>
  `;
}

/**
 * Generate plain text email content for quiz results
 */
function generateResultsEmailText({ username, quizData, results, suggestions }) {
  const { score, total } = results;
  const percentage = Math.round((score / total) * 100);
  
  return `
🎯 QUIZ RESULTS

Hello ${username}!

📋 QUIZ INFORMATION
Subject: ${quizData.subject}
Grade: ${quizData.grade}
Difficulty: ${quizData.difficulty}
Total Questions: ${total}

📊 YOUR SCORE
Score: ${score}/${total} (${percentage}%)

🤖 AI LEARNING SUGGESTIONS
${suggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`).join('\n')}

Thank you for using our AI Quiz Generator!
Keep learning, keep growing! 📚

---
Generated by ${process.env.APP_NAME || 'AI Quiz Generator'}
This is an automated email. Please do not reply.
  `.trim();
}


module.exports = {
    sendQuizResultsEmail,
    
  };