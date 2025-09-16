const Submission = require('../models/Submission');

/**
 * Calculate adaptive difficulty distribution based on user's past performance
 * @param {String} userId - User's ObjectId
 * @param {String} subject - Subject of the quiz
 * @param {Number} totalQuestions - Total questions requested
 * @returns {Object} - Distribution of easy/medium/hard questions
 */
async function calculateAdaptiveDifficulty(userId, subject, totalQuestions) {
  try {
    console.log(`🧠 Calculating adaptive difficulty for user ${userId} in ${subject}`);
    
    // Get user's past submissions for this subject (last 10 attempts)
    const pastSubmissions = await Submission.find({
      userId: userId,
      // You might want to filter by subject if you store it in submissions
    })
    .sort({ submittedAt: -1 })
    .limit(10)
    .select('score responses submittedAt');

    if (!pastSubmissions || pastSubmissions.length === 0) {
      console.log("📊 No past performance found - using balanced distribution");
      return getBalancedDistribution(totalQuestions);
    }

    console.log(`📈 Found ${pastSubmissions.length} past submissions`);

    // Calculate overall performance metrics
    const performanceMetrics = calculatePerformanceMetrics(pastSubmissions);
    
    console.log("📊 Performance metrics:", performanceMetrics);

    // Generate adaptive distribution based on performance
    const distribution = generateAdaptiveDistribution(performanceMetrics, totalQuestions);
    
    console.log("🎯 Adaptive distribution:", distribution);
    
    return distribution;

  } catch (error) {
    console.error("❌ Error calculating adaptive difficulty:", error);
    // Fallback to balanced distribution
    return getBalancedDistribution(totalQuestions);
  }
}

/**
 * Calculate performance metrics from past submissions
 */
function calculatePerformanceMetrics(submissions) {
  let totalQuestions = 0;
  let totalCorrect = 0;
  let recentPerformance = [];

  submissions.forEach(submission => {
    const questionsInSubmission = submission.responses.length;
    const correctInSubmission = submission.score;
    
    totalQuestions += questionsInSubmission;
    totalCorrect += correctInSubmission;
    
    // Calculate percentage for this submission
    const percentage = questionsInSubmission > 0 ? (correctInSubmission / questionsInSubmission) * 100 : 0;
    recentPerformance.push(percentage);
  });

  const overallPercentage = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 50;
  const averageRecentPercentage = recentPerformance.length > 0 
    ? recentPerformance.reduce((sum, perf) => sum + perf, 0) / recentPerformance.length 
    : 50;

  // Calculate trend (improving/declining)
  let trend = 'stable';
  if (recentPerformance.length >= 3) {
    const firstHalf = recentPerformance.slice(0, Math.floor(recentPerformance.length / 2));
    const secondHalf = recentPerformance.slice(Math.floor(recentPerformance.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, perf) => sum + perf, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, perf) => sum + perf, 0) / secondHalf.length;
    
    if (secondAvg > firstAvg + 10) trend = 'improving';
    else if (secondAvg < firstAvg - 10) trend = 'declining';
  }

  return {
    overallPercentage,
    averageRecentPerformage: averageRecentPercentage,
    trend,
    totalAttempts: submissions.length,
    totalQuestions,
    totalCorrect
  };
}

/**
 * Generate adaptive difficulty distribution based on performance
 */
function generateAdaptiveDistribution(metrics, totalQuestions) {
  const { overallPercentage, averageRecentPerformage, trend } = metrics;
  
  // Use recent performance as primary indicator
  const performanceScore = averageRecentPerformage;
  
  let easyPercentage, mediumPercentage, hardPercentage;

  // Adaptive logic based on performance
  if (performanceScore >= 80) {
    // High performer - challenge them more
    easyPercentage = trend === 'declining' ? 30 : 20;
    mediumPercentage = 40;
    hardPercentage = trend === 'declining' ? 30 : 40;
    console.log("🏆 High performer detected - increasing difficulty");
    
  } else if (performanceScore >= 60) {
    // Good performer - balanced with slight challenge
    easyPercentage = 30;
    mediumPercentage = 50;
    hardPercentage = 20;
    console.log("👍 Good performer detected - balanced difficulty");
    
  } else if (performanceScore >= 40) {
    // Average performer - more support needed
    easyPercentage = 50;
    mediumPercentage = 35;
    hardPercentage = 15;
    console.log("📚 Average performer detected - providing more support");
    
  } else {
    // Struggling performer - focus on building confidence
    easyPercentage = trend === 'improving' ? 50 : 60;
    mediumPercentage = trend === 'improving' ? 35 : 30;
    hardPercentage = trend === 'improving' ? 15 : 10;
    console.log("🤝 Struggling performer detected - building confidence");
  }

  // Adjust based on trend
  if (trend === 'improving') {
    // User is improving - slightly increase challenge
    hardPercentage += 5;
    easyPercentage -= 5;
  } else if (trend === 'declining') {
    // User is struggling - provide more support
    easyPercentage += 5;
    hardPercentage -= 5;
  }

  // Ensure percentages don't go below 0 or above 100
  easyPercentage = Math.max(10, Math.min(70, easyPercentage));
  mediumPercentage = Math.max(20, Math.min(60, mediumPercentage));
  hardPercentage = Math.max(5, Math.min(50, hardPercentage));

  // Normalize to 100%
  const total = easyPercentage + mediumPercentage + hardPercentage;
  easyPercentage = Math.round((easyPercentage / total) * 100);
  mediumPercentage = Math.round((mediumPercentage / total) * 100);
  hardPercentage = 100 - easyPercentage - mediumPercentage;

  // Convert percentages to actual question counts
  const easyCount = Math.round((easyPercentage / 100) * totalQuestions);
  const hardCount = Math.round((hardPercentage / 100) * totalQuestions);
  const mediumCount = totalQuestions - easyCount - hardCount;

  return {
    easy: Math.max(1, easyCount),
    medium: Math.max(1, mediumCount),
    hard: Math.max(0, hardCount),
    reasoning: `Based on ${performanceScore.toFixed(1)}% recent performance (${trend} trend)`
  };
}

/**
 * Get balanced distribution for new users or fallback
 */
function getBalancedDistribution(totalQuestions) {
  const easy = Math.ceil(totalQuestions * 0.4);  // 40% easy
  const hard = Math.floor(totalQuestions * 0.2); // 20% hard  
  const medium = totalQuestions - easy - hard;   // 40% medium

  return {
    easy: easy,
    medium: medium,
    hard: hard,
    reasoning: "New user - using balanced distribution"
  };
}

module.exports = {
  calculateAdaptiveDifficulty,
  getBalancedDistribution
};
