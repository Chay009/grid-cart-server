const express = require("express");
const router = express.Router();
const { DeepgramError, createClient } = require('@deepgram/sdk');



// Route handler for GET requests
router.get('/', async (req, res) => {
  // Exit early in development mode


  try {
    return res.json({
      api_key: process.env.DEEPGRAM_API_KEY ?? '',
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
    throw new(err, 'Internal Server Error');
  }
});

module.exports = router;