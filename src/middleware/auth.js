
// middleware/auth.js - Create this authentication middleware
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Adjust path as needed

const auth = async (req, res, next) => {
  try {
    // Get token from header or cookie
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1] || req.cookies.token;

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access token required' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret123');
    
    // Find user in database to ensure they still exist
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid token - user not found' 
      });
    }

    // Set req.user with all the data you need
    req.user = {
      userId: user._id.toString(), // Convert ObjectId to string
      username: user.username,
      email: user.email
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid or expired token' 
    });
  }
};

module.exports = auth;