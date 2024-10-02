const express = require("express");
const router = express.Router();
const { driver } = require('../database/neo4j_connect');

const session = driver.session();

// Fetch all sellers
router.get('/', async (req, res) => {
  try {
    const result = await session.run('MATCH (s:Seller) RETURN s');
    const sellers = result.records.map(record => ({
        sellerId: record.get('s').properties.sellerId,
        sellername: record.get('s').properties.sellername
      }));
      res.json({sellers});
   
  } catch (error) {
    console.error('Error fetching sellers:', error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
