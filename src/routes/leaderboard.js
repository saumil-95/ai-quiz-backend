const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const Quiz = require('../models/Quiz');
const User = require('../models/User');

// ==============================================
// GLOBAL LEADERBOARD - All time top performers
// ==============================================

/**
 * GET /leaderboard/global
 * Get global leaderboard across all subjects and grades
 */
router.get('/global', async (req, res) => {
  try {
    const {
      limit = 10,
      offset = 0,
      timeframe = 'all' // all, week, month, year
    } = req.query;

    console.log(`🏆 Fetching global leaderboard - limit: ${limit}, timeframe: ${timeframe}`);

    // Build time filter
    const timeFilter = buildTimeFilter(timeframe);

    // Aggregate top performers across all quizzes
    const leaderboard = await Submission.aggregate([
      // Match time filter if specified
      ...(timeFilter ? [{ $match: timeFilter }] : []),
      
      // Group by user and calculate stats
      {
        $group: {
          _id: '$userId',
          username: { $first: '$username' },
          totalScore: { $sum: '$score' },
          totalQuizzes: { $count: {} },
          maxScore: { $max: '$score' },
          averageScore: { $avg: '$score' },
          lastActivity: { $max: '$submittedAt' },
          scores: { $push: '$score' } // For calculating consistency
        }
      },
      
      // Calculate performance metrics
      {
        $addFields: {
          averageScore: { $round: ['$averageScore', 2] },
          consistency: {
            $round: [
              {
                $divide: [
                  { $subtract: ['$maxScore', { $min: '$scores' }] },
                  { $cond: [{ $eq: ['$maxScore', 0] }, 1, '$maxScore'] }
                ]
              },
              2
            ]
          }
        }
      },
      
      // Sort by total score desc, then by average score desc
      { $sort: { totalScore: -1, averageScore: -1, totalQuizzes: -1 } },
      
      // Pagination
      { $skip: parseInt(offset) },
      { $limit: parseInt(limit) }
    ]);

    // Add ranking
    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      rank: parseInt(offset) + index + 1,
      userId: entry._id,
      username: entry.username,
      totalScore: entry.totalScore,
      totalQuizzes: entry.totalQuizzes,
      maxScore: entry.maxScore,
      averageScore: entry.averageScore,
      consistency: 1 - (entry.consistency || 0), // Higher is better
      lastActivity: entry.lastActivity
    }));

    console.log(`✅ Found ${rankedLeaderboard.length} global leaders`);

    res.json({
      success: true,
      data: {
        leaderboard: rankedLeaderboard,
        filters: {
          timeframe,
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        metadata: {
          count: rankedLeaderboard.length,
          hasMore: rankedLeaderboard.length === parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching global leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch global leaderboard',
      error: error.message
    });
  }
});

// ==============================================
// SUBJECT-SPECIFIC LEADERBOARD
// ==============================================

/**
 * GET /leaderboard/subject/:subject
 * Get leaderboard for a specific subject
 */
router.get('/subject/:subject', async (req, res) => {
  try {
    const { subject } = req.params;
    const {
      limit = 10,
      offset = 0,
      grade,
      difficulty,
      timeframe = 'all'
    } = req.query;

    console.log(`🏆 Fetching ${subject} leaderboard`);

    // Build match conditions
    const matchConditions = buildMatchConditions({ subject, grade, difficulty, timeframe });

    const leaderboard = await Submission.aggregate([
      // Lookup quiz data to get subject/grade info
      {
        $lookup: {
          from: 'quizzes',
          localField: 'quizId',
          foreignField: 'quizId',
          as: 'quiz'
        }
      },
      
      // Unwind quiz array
      { $unwind: '$quiz' },
      
      // Match conditions
      { $match: matchConditions },
      
      // Group by user for this subject
      {
        $group: {
          _id: '$userId',
          username: { $first: '$username' },
          subject: { $first: '$quiz.subject' },
          totalScore: { $sum: '$score' },
          totalQuizzes: { $count: {} },
          maxScore: { $max: '$score' },
          averageScore: { $avg: '$score' },
          grades: { $addToSet: '$quiz.grade' },
          difficulties: { $addToSet: '$quiz.difficulty' },
          lastActivity: { $max: '$submittedAt' },
          recentScores: { 
            $push: {
              score: '$score',
              date: '$submittedAt',
              quizId: '$quizId',
              grade: '$quiz.grade',
              difficulty: '$quiz.difficulty'
            }
          }
        }
      },
      
      // Add calculated fields
      {
        $addFields: {
          averageScore: { $round: ['$averageScore', 2] },
          gradesCount: { $size: '$grades' },
          difficultiesCount: { $size: '$difficulties' },
          // Get recent trend (last 5 quizzes)
          recentTrend: {
            $let: {
              vars: {
                recentFive: {
                  $slice: [
                    { $sortArray: { input: '$recentScores', sortBy: { date: -1 } } },
                    5
                  ]
                }
              },
              in: {
                $cond: [
                  { $gte: [{ $size: '$$recentFive' }, 2] },
                  {
                    $subtract: [
                      { $avg: { $slice: [{ $map: { input: '$$recentFive', as: 'item', in: '$$item.score' } }, 2] } },
                      { $avg: { $slice: [{ $map: { input: '$$recentFive', as: 'item', in: '$$item.score' } }, -2] } }
                    ]
                  },
                  0
                ]
              }
            }
          }
        }
      },
      
      // Sort by total score, then average
      { $sort: { totalScore: -1, averageScore: -1, totalQuizzes: -1 } },
      
      // Pagination
      { $skip: parseInt(offset) },
      { $limit: parseInt(limit) }
    ]);

    // Add ranking and format response
    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      rank: parseInt(offset) + index + 1,
      userId: entry._id,
      username: entry.username,
      subject: entry.subject,
      totalScore: entry.totalScore,
      totalQuizzes: entry.totalQuizzes,
      maxScore: entry.maxScore,
      averageScore: entry.averageScore,
      gradesAttempted: entry.grades.sort((a, b) => a - b),
      difficultiesAttempted: entry.difficulties.sort(),
      trend: entry.recentTrend > 0 ? 'improving' : entry.recentTrend < 0 ? 'declining' : 'stable',
      trendValue: Math.round(entry.recentTrend * 100) / 100,
      lastActivity: entry.lastActivity
    }));

    console.log(`✅ Found ${rankedLeaderboard.length} ${subject} leaders`);

    res.json({
      success: true,
      data: {
        leaderboard: rankedLeaderboard,
        filters: {
          subject,
          grade: grade || 'all',
          difficulty: difficulty || 'all',
          timeframe,
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        metadata: {
          count: rankedLeaderboard.length,
          hasMore: rankedLeaderboard.length === parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching subject leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subject leaderboard',
      error: error.message
    });
  }
});

// ==============================================
// GRADE-SPECIFIC LEADERBOARD
// ==============================================

/**
 * GET /leaderboard/grade/:grade
 * Get leaderboard for a specific grade level
 */
router.get('/grade/:grade', async (req, res) => {
  try {
    const { grade } = req.params;
    const {
      limit = 10,
      offset = 0,
      subject,
      difficulty,
      timeframe = 'all'
    } = req.query;

    console.log(`🏆 Fetching Grade ${grade} leaderboard`);

    const matchConditions = buildMatchConditions({ 
      grade: parseInt(grade), 
      subject, 
      difficulty, 
      timeframe 
    });

    const leaderboard = await Submission.aggregate([
      {
        $lookup: {
          from: 'quizzes',
          localField: 'quizId',
          foreignField: 'quizId',
          as: 'quiz'
        }
      },
      { $unwind: '$quiz' },
      { $match: matchConditions },
      
      {
        $group: {
          _id: '$userId',
          username: { $first: '$username' },
          grade: { $first: '$quiz.grade' },
          totalScore: { $sum: '$score' },
          totalQuizzes: { $count: {} },
          maxScore: { $max: '$score' },
          averageScore: { $avg: '$score' },
          subjects: { $addToSet: '$quiz.subject' },
          difficulties: { $addToSet: '$quiz.difficulty' },
          lastActivity: { $max: '$submittedAt' }
        }
      },
      
      {
        $addFields: {
          averageScore: { $round: ['$averageScore', 2] },
          subjectsCount: { $size: '$subjects' },
          difficultiesCount: { $size: '$difficulties' }
        }
      },
      
      { $sort: { totalScore: -1, averageScore: -1, subjectsCount: -1 } },
      { $skip: parseInt(offset) },
      { $limit: parseInt(limit) }
    ]);

    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      rank: parseInt(offset) + index + 1,
      userId: entry._id,
      username: entry.username,
      grade: entry.grade,
      totalScore: entry.totalScore,
      totalQuizzes: entry.totalQuizzes,
      maxScore: entry.maxScore,
      averageScore: entry.averageScore,
      subjectsAttempted: entry.subjects.sort(),
      difficultiesAttempted: entry.difficulties.sort(),
      versatilityScore: entry.subjectsCount * entry.difficultiesCount,
      lastActivity: entry.lastActivity
    }));

    console.log(`✅ Found ${rankedLeaderboard.length} Grade ${grade} leaders`);

    res.json({
      success: true,
      data: {
        leaderboard: rankedLeaderboard,
        filters: {
          grade: parseInt(grade),
          subject: subject || 'all',
          difficulty: difficulty || 'all',
          timeframe,
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        metadata: {
          count: rankedLeaderboard.length,
          hasMore: rankedLeaderboard.length === parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching grade leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch grade leaderboard',
      error: error.message
    });
  }
});

// ==============================================
// TOP PERFORMERS BY DIFFICULTY
// ==============================================

/**
 * GET /leaderboard/difficulty/:difficulty
 * Get leaderboard for specific difficulty level
 */
router.get('/difficulty/:difficulty', async (req, res) => {
  try {
    const { difficulty } = req.params.difficulty.toUpperCase();
    const {
      limit = 10,
      offset = 0,
      subject,
      grade,
      timeframe = 'all'
    } = req.query;

    console.log(`🏆 Fetching ${difficulty} difficulty leaderboard`);

    const matchConditions = buildMatchConditions({ difficulty, subject, grade, timeframe });

    const leaderboard = await Submission.aggregate([
      {
        $lookup: {
          from: 'quizzes',
          localField: 'quizId',
          foreignField: 'quizId',
          as: 'quiz'
        }
      },
      { $unwind: '$quiz' },
      { $match: matchConditions },
      
      {
        $group: {
          _id: '$userId',
          username: { $first: '$username' },
          difficulty: { $first: '$quiz.difficulty' },
          totalScore: { $sum: '$score' },
          totalQuizzes: { $count: {} },
          maxScore: { $max: '$score' },
          averageScore: { $avg: '$score' },
          subjects: { $addToSet: '$quiz.subject' },
          grades: { $addToSet: '$quiz.grade' },
          perfectScores: {
            $sum: {
              $cond: [
                { $eq: ['$score', { $size: '$responses' }] },
                1,
                0
              ]
            }
          },
          lastActivity: { $max: '$submittedAt' }
        }
      },
      
      {
        $addFields: {
          averageScore: { $round: ['$averageScore', 2] },
          perfectScoreRate: {
            $round: [
              { $multiply: [{ $divide: ['$perfectScores', '$totalQuizzes'] }, 100] },
              1
            ]
          }
        }
      },
      
      { $sort: { totalScore: -1, perfectScoreRate: -1, averageScore: -1 } },
      { $skip: parseInt(offset) },
      { $limit: parseInt(limit) }
    ]);

    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      rank: parseInt(offset) + index + 1,
      userId: entry._id,
      username: entry.username,
      difficulty: entry.difficulty,
      totalScore: entry.totalScore,
      totalQuizzes: entry.totalQuizzes,
      maxScore: entry.maxScore,
      averageScore: entry.averageScore,
      perfectScores: entry.perfectScores,
      perfectScoreRate: entry.perfectScoreRate,
      subjectsAttempted: entry.subjects.sort(),
      gradesAttempted: entry.grades.sort((a, b) => a - b),
      lastActivity: entry.lastActivity
    }));

    res.json({
      success: true,
      data: {
        leaderboard: rankedLeaderboard,
        filters: {
          difficulty: difficulty,
          subject: subject || 'all',
          grade: grade || 'all',
          timeframe,
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        metadata: {
          count: rankedLeaderboard.length,
          hasMore: rankedLeaderboard.length === parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching difficulty leaderboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch difficulty leaderboard',
      error: error.message
    });
  }
});

// ==============================================
// USER RANKING - Get specific user's position
// ==============================================

/**
 * GET /leaderboard/user/:userId/rank
 * Get user's ranking in different categories
 */
router.get('/user/:userId/rank', async (req, res) => {
  try {
    const { userId } = req.params;
    const { timeframe = 'all' } = req.query;

    console.log(`🔍 Fetching ranking for user ${userId}`);

    // Validate userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const timeFilter = buildTimeFilter(timeframe);

    // Get user's global rank
    const globalRank = await getUserGlobalRank(userId, timeFilter);
    
    // Get user's subject-wise ranks
    const subjectRanks = await getUserSubjectRanks(userId, timeFilter);
    
    // Get user's grade-wise ranks
    const gradeRanks = await getUserGradeRanks(userId, timeFilter);

    // Get user's basic stats
    const userStats = await getUserStats(userId, timeFilter);

    res.json({
      success: true,
      data: {
        userId: userId,
        timeframe: timeframe,
        globalRank: globalRank,
        subjectRanks: subjectRanks,
        gradeRanks: gradeRanks,
        userStats: userStats
      }
    });

  } catch (error) {
    console.error('❌ Error fetching user rank:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user ranking',
      error: error.message
    });
  }
});

// ==============================================
// LEADERBOARD STATISTICS
// ==============================================

/**
 * GET /leaderboard/stats
 * Get overall leaderboard statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const { timeframe = 'all' } = req.query;

    console.log(`📊 Fetching leaderboard statistics for ${timeframe}`);

    const timeFilter = buildTimeFilter(timeframe);

    const stats = await Submission.aggregate([
      ...(timeFilter ? [{ $match: timeFilter }] : []),
      
      {
        $lookup: {
          from: 'quizzes',
          localField: 'quizId',
          foreignField: 'quizId',
          as: 'quiz'
        }
      },
      { $unwind: '$quiz' },
      
      {
        $group: {
          _id: null,
          totalSubmissions: { $count: {} },
          uniqueUsers: { $addToSet: '$userId' },
          subjects: { $addToSet: '$quiz.subject' },
          grades: { $addToSet: '$quiz.grade' },
          difficulties: { $addToSet: '$quiz.difficulty' },
          totalScore: { $sum: '$score' },
          averageScore: { $avg: '$score' },
          maxScore: { $max: '$score' },
          perfectScores: {
            $sum: {
              $cond: [
                { $eq: ['$score', { $size: '$responses' }] },
                1,
                0
              ]
            }
          }
        }
      },
      
      {
        $addFields: {
          uniqueUsersCount: { $size: '$uniqueUsers' },
          subjectsCount: { $size: '$subjects' },
          gradesCount: { $size: '$grades' },
          difficultiesCount: { $size: '$difficulties' },
          averageScore: { $round: ['$averageScore', 2] },
          perfectScoreRate: {
            $round: [
              { $multiply: [{ $divide: ['$perfectScores', '$totalSubmissions'] }, 100] },
              1
            ]
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalSubmissions: 0,
      uniqueUsersCount: 0,
      subjectsCount: 0,
      gradesCount: 0,
      difficultiesCount: 0,
      totalScore: 0,
      averageScore: 0,
      maxScore: 0,
      perfectScores: 0,
      perfectScoreRate: 0
    };

    console.log(`✅ Leaderboard stats calculated`);

    res.json({
      success: true,
      data: {
        timeframe: timeframe,
        statistics: {
          overview: {
            totalSubmissions: result.totalSubmissions,
            uniqueUsers: result.uniqueUsersCount,
            subjectsAvailable: result.subjectsCount,
            gradesAvailable: result.gradesCount,
            difficultiesAvailable: result.difficultiesCount
          },
          performance: {
            totalScore: result.totalScore,
            averageScore: result.averageScore,
            maxScore: result.maxScore,
            perfectScores: result.perfectScores,
            perfectScoreRate: result.perfectScoreRate
          },
          activity: {
            averageSubmissionsPerUser: result.uniqueUsersCount > 0 
              ? Math.round((result.totalSubmissions / result.uniqueUsersCount) * 100) / 100 
              : 0,
            averageScorePerUser: result.uniqueUsersCount > 0
              ? Math.round((result.totalScore / result.uniqueUsersCount) * 100) / 100
              : 0
          }
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching leaderboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leaderboard statistics',
      error: error.message
    });
  }
});

// ==============================================
// HELPER FUNCTIONS
// ==============================================

function buildTimeFilter(timeframe) {
  if (timeframe === 'all') return null;
  
  const now = new Date();
  let startDate;
  
  switch (timeframe) {
    case 'week':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'year':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      return null;
  }
  
  return { submittedAt: { $gte: startDate } };
}

function buildMatchConditions({ subject, grade, difficulty, timeframe }) {
  const conditions = {};
  
  if (subject) conditions['quiz.subject'] = subject;
  if (grade) conditions['quiz.grade'] = parseInt(grade);
  if (difficulty) conditions['quiz.difficulty'] = difficulty.toUpperCase();
  
  // Add time filter
  const timeFilter = buildTimeFilter(timeframe);
  if (timeFilter) {
    Object.assign(conditions, timeFilter);
  }
  
  return conditions;
}

async function getUserGlobalRank(userId, timeFilter) {
  const pipeline = [
    ...(timeFilter ? [{ $match: timeFilter }] : []),
    {
      $group: {
        _id: '$userId',
        totalScore: { $sum: '$score' },
        averageScore: { $avg: '$score' },
        totalQuizzes: { $count: {} }
      }
    },
    { $sort: { totalScore: -1, averageScore: -1, totalQuizzes: -1 } }
  ];

  const allUsers = await Submission.aggregate(pipeline);
  const userIndex = allUsers.findIndex(user => user._id.toString() === userId);
  
  return {
    rank: userIndex + 1,
    totalUsers: allUsers.length,
    userStats: userIndex >= 0 ? allUsers[userIndex] : null
  };
}

async function getUserSubjectRanks(userId, timeFilter) {
  // Implementation for subject-wise ranks
  return await Submission.aggregate([
    ...(timeFilter ? [{ $match: timeFilter }] : []),
    {
      $lookup: {
        from: 'quizzes',
        localField: 'quizId',
        foreignField: 'quizId',
        as: 'quiz'
      }
    },
    { $unwind: '$quiz' },
    {
      $group: {
        _id: {
          userId: '$userId',
          subject: '$quiz.subject'
        },
        totalScore: { $sum: '$score' }
      }
    },
    {
      $group: {
        _id: '$_id.subject',
        users: {
          $push: {
            userId: '$_id.userId',
            totalScore: '$totalScore'
          }
        }
      }
    }
  ]);
}

async function getUserGradeRanks(userId, timeFilter) {
  // Similar implementation for grade-wise ranks
  return [];
}

async function getUserStats(userId, timeFilter) {
  const pipeline = [
    { $match: { userId: new mongoose.Types.ObjectId(userId), ...timeFilter } },
    {
      $lookup: {
        from: 'quizzes',
        localField: 'quizId',
        foreignField: 'quizId',
        as: 'quiz'
      }
    },
    { $unwind: '$quiz' },
    {
      $group: {
        _id: null,
        totalQuizzes: { $count: {} },
        totalScore: { $sum: '$score' },
        averageScore: { $avg: '$score' },
        maxScore: { $max: '$score' },
        subjects: { $addToSet: '$quiz.subject' },
        grades: { $addToSet: '$quiz.grade' },
        lastActivity: { $max: '$submittedAt' }
      }
    }
  ];

  const result = await Submission.aggregate(pipeline);
  return result[0] || {};
}

module.exports = router;