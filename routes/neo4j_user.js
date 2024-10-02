



const express = require('express');
const jwt = require('jsonwebtoken');
const { SECRET, authenticateJwt } = require('../middleware/auth');
const { driver } = require('../database/neo4j_connect');
const z = require('zod');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();
const session = driver.session();

const signupProps = z.object({
  username: z.string().min(1).max(50).email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(50, 'Password must be less than 50 characters'),
});

// sign up and login workig fine
router.post('/signup', async (req, res) => {
  const parsedInput = signupProps.safeParse(req.body);
  if (!parsedInput.success) {
    res.status(411).json({ message: parsedInput.error.issues[0].message });
    return;
  }
  const { username, password } = parsedInput.data;
  const userId = uuidv4();  // Generate a unique seller ID

  try {
    const result = await session.run('MATCH (u:User {username: $username}) RETURN u', { username });
    if (result.records.length > 0) {
      res.status(403).json({ message: 'User already exists' });
    } else {
      await session.run(
        `CREATE (u:User {
        userId:$userId,
        username: $username,
         password: $password
         }) RETURN u`,
        { username, password,userId}
      );
      const token = jwt.sign({ userId,username, role: 'user' }, SECRET, { expiresIn: '30d' });
      res.json({ message: 'User Account created successfully', token,userId});
    }
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).send('Internal Server Error');
  }
});
router.post('/login', async (req, res) => {
  const parsedInput = signupProps.safeParse(req.body);
  if (!parsedInput.success) {
    res.status(411).json({ message: parsedInput.error.issues[0].message });
    return;
  }
  const { username, password } = parsedInput.data;

  try {
    const result = await session.run(
      'MATCH (u:User {username: $username}) RETURN u.userId AS userId, u.password AS storedPassword', 
      { username }
    );
    if (result.records.length > 0) {
      const record = result.records[0];
      const storedPassword = record.get('storedPassword');
      if (password === storedPassword) { 
        const userId=record.get('userId')
        const token = jwt.sign({ username, role: 'user' }, SECRET, { expiresIn: '1h' });
        res.json({ message: 'user Logged in successfully', token,userId });
      }else{
        res.status(403).json({ message: 'Invalid username or password' });
      }
    } else {
      res.status(403).json({ message: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).send('Internal Server Error');
  }
});



router.get('/me', authenticateJwt, async (req, res) => {
  res.json({ username: req.user.username });
});


// get all products 
router.get('/get-all-products', async (req, res) => {
  try {
    // Query to get all Product nodes, with a limit of 25 results
    const result = await session.run('MATCH (n:Product) RETURN n LIMIT 25');
    
    // Map the results to get the product properties, excluding unwanted fields
    const products = result.records.map(record => {
      const { isAvailable, productId, description, title, imageLink, price, attributes, category, stock, brand } = record.get('n').properties;

      return {
        isAvailable,
        productId,
        description,
        title,
        imageLink,
        price,
        attributes: JSON.parse(attributes), // If attributes is a JSON string
        category,
        stock,
        brand
      };
    });

    // Send the filtered results back as JSON
    res.json({ products });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).send('Internal Server Error');
  }
});



// buy products
// Route to handle buying a product
router.post('/buy/:productId/:userId', authenticateJwt, async (req, res) => {
  const { productId, userId } = req.params;
  const purchaseDate = new Date().toISOString();
  
  try {
    // Fetch the product details
    const productResult = await session.run(
      `MATCH (p:Product {productId: $productId}) RETURN p`,
      { productId }
    );
    
    if (productResult.records.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const product = productResult.records[0].get('p').properties;
    const { category, brand } = product;

    // Update user's purchase history, interests, and preferences
    /// this is for gpt if anything goes wrong it is porb here use claude

    // no check needed sam user can same books many time
    const result = await session.run(
      `
    MATCH (u:User {userId: $userId})
MATCH (p:Product {productId: $productId})

// Update purchase history
MERGE (u)-[:PURCHASED {purchaseDate: $purchaseDate}]->(p)

// Ensure PREFERS relationship is updated
MERGE (u)-[:PREFERS]->(p)

// Update interests in category and brand
MERGE (cat:Category {name: $category})
MERGE (brandNode:Brand {name: $brand})
MERGE (u)-[:INTERESTED_IN]->(cat)
MERGE (u)-[:INTERESTED_IN]->(brandNode)

// Update user's interest categories and brands
SET u.interestCategories = CASE 
    WHEN $category IN u.interestCategories THEN u.interestCategories 
    ELSE u.interestCategories + [$category] 
END
SET u.interestBrands = CASE 
    WHEN $brand IN u.interestBrands THEN u.interestBrands 
    ELSE u.interestBrands + [$brand] 
END

// Update purchase history list
WITH u, p, $purchaseHistoryEntry AS purchaseHistoryEntry
SET u.purchaseHistory = CASE 
    WHEN u.purchaseHistory IS NULL THEN [purchaseHistoryEntry] 
    ELSE [purchaseHistoryEntry] + u.purchaseHistory 
END

RETURN u


      `,
      {
        userId,
        productId,
        purchaseDate,
        category,
        brand,
        purchaseHistoryEntry: `${productId}:${purchaseDate}`
      }
    );

    if (result.records.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'Product purchased successfully' });
  } catch (error) {
    console.error('Error buying product:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});





// Get a product with a specific ID
router.get('/products/:productId', authenticateJwt, async (req, res) => {
  const { productId } = req.params;
  console.log("hywe")
  try {
    const result = await session.run('MATCH (p:Product {productId: $productId}) RETURN p', { productId });
    if (result.records.length === 0) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }
    res.json({ product: result.records[0].get('p').properties });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).send('Internal Server Error');
  }
});


router.get('/purchasedProducts/:userId', authenticateJwt, async (req, res) => {
  const session = driver.session(); // Start a new session
  try {
      const { userId } = req.params;

      const result = await session.run(
          `
          MATCH (u:User {userId: $userId})
          WHERE u.purchaseHistory IS NOT NULL
          UNWIND u.purchaseHistory AS purchaseEntry
          WITH split(purchaseEntry, ':')[0] AS productId, split(purchaseEntry, ':')[1] AS purchaseDate
          MATCH (p:Product {productId: productId})
          RETURN p, purchaseDate
          ORDER BY purchaseDate DESC
          `,
          { userId: userId }
      );

      const purchasedProducts = result.records.map(record => {
          const product = record.get('p').properties;
          const purchaseDate = record.get('purchaseDate');
          return {
              productId: product.productId,
              title: product.title,
              category: product.category,
              brand: product.brand,
              price: product.price,
              purchaseDate: purchaseDate,
              description: product.description,
              imageLink: product.imageLink
          };
      });

      res.json({ purchasedProducts });
  } catch (error) {
      console.error('Error fetching purchased products:', error);
      res.status(500).json({ message: 'Internal Server Error' });
  } finally {
      await session.close(); // Always close the session in the finally block
  }
});



module.exports = router;
