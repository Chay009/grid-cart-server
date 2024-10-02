const express = require("express");
const jwt = require("jsonwebtoken");
const { SECRET, authenticateJwt } = require("../middleware/auth");
const neo4j = require('neo4j-driver');
const { v4: uuidv4 } = require('uuid');
const z = require("zod");
const { driver } = require('../database/neo4j_connect');
const { default: axios } = require("axios");
const router = express.Router();



// 1. when crud of products make a api req to python backend to a route where it call neo4j from graph db so that embeddings are genreated
/// so it is a webhook i guess
// 2. atrributes convert into a meaninglul snetence instead of a object as attributes so that easily searchble but graph search is effected
// Neo4j driver and session
const session = driver.session();

// Define the schemas for each category's attributes

const furnitureAttributesSchema = z.object({
  materials: z.enum(["Wood", "Metal", "Glass", "Plastic", "Fabric"]),
  dimensions: z.enum(["Small (e.g., 40x40 cm)", "Medium (e.g., 60x60 cm)", "Large (e.g., 80x80 cm)", "Extra Large (e.g., 100x100 cm)"]),
  colors: z.enum(["Black", "White", "Brown", "Gray", "Beige"]),
});

const electronicsAttributesSchema = z.object({
  screenSize: z.enum(["5 inches", "5.5 inches", "6 inches", "6.5 inches", "7 inches"]),
  storageCapacity: z.enum(["32GB", "64GB", "128GB", "256GB", "512GB"]),
  batteryLife: z.enum(["3000mAh", "4000mAh", "5000mAh", "6000mAh"]),
  connectivityOptions: z.enum(["4G", "5G", "Wi-Fi", "Bluetooth", "NFC"]),
  processorType: z.enum(["Snapdragon 888", "Snapdragon 870", "Exynos 2100", "Apple A14 Bionic"]),
  RAMOption: z.enum(["4GB", "6GB", "8GB", "12GB", "16GB"]),
});

const clothesAttributesSchema = z.object({
  size: z.enum(["XS", "S", "M", "L", "XL", "XXL"]),
});

const bookAttributesSchema = z.object({
  genre: z.enum(["Fiction", "Non-Fiction", "Science Fiction", "Fantasy", "Biography", "Mystery", "Thriller", "Romance", "Historical", "Self-Help"]),
  format: z.enum(["Hardcover", "Paperback", "Ebook", "Audiobook"]),
  publicationYear: z.enum(["2020", "2021", "2022", "2023", "2024"]),
  language: z.enum(["English", "Spanish", "French", "German", "Chinese", "Japanese", "Russian", "Portuguese"]),
});



// seller signup props
let signupProps = z.object({
  sellername: z.string().min(1).max(50).email(),
  password: z
    .string()
    .min(8, "Password must be atleast 8 characters")
    .max(50, "Password must be less than 50 characters"),
});

// sign up and login workig fine
router.post('/signup', async (req, res) => {
  const parsedInput = signupProps.safeParse(req.body);
  if (!parsedInput.success) {
    res.status(411).json({ message: parsedInput.error.issues[0].message });
    return;
  }
  const { sellername, password } = parsedInput.data;
  const sellerId = uuidv4();  // Generate a unique seller ID

  try {
    const result = await session.run('MATCH (s:Seller {sellername: $sellername}) RETURN s', { sellername });
    if (result.records.length > 0) {
      res.status(403).json({ message: 'User already exists' });
    } else {
      await session.run(
        `CREATE (s:Seller {
          sellerId: $sellerId, 
          sellername: $sellername, 
          password: $password, 
          products: []
        }) RETURN s`,
        { sellerId, sellername, password }
      );
      const token = jwt.sign({ sellerId,sellername, role: 'seller' }, SECRET, { expiresIn: '30d' });
      res.json({ message: 'Seller account created successfully', token,sellerId });
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

  const { sellername, password } = parsedInput.data;

  try {
    const result = await session.run(
      'MATCH (s:Seller {sellername: $sellername}) RETURN s.sellerId AS sellerId, s.password AS storedPassword', 
      { sellername }
    );

    if (result.records.length > 0) {
      const record = result.records[0];
      const storedPassword = record.get('storedPassword');

      if (password === storedPassword) { // Replace this with a proper hash comparison in production
        const sellerId = record.get('sellerId');
        const token = jwt.sign({ sellerId, sellername, role: 'seller' }, SECRET, { expiresIn: '1h' });
        res.json({ message: 'Seller logged in successfully', token,sellerId });
      } else {
        res.status(403).json({ message: 'Invalid sellername or password' });
      }
    } else {
      res.status(403).json({ message: 'Invalid sellername or password' });
    }
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Product routes


//----------- createProduct--------------------------------
// Main schema that validates the product


const productProps = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500),
  brand: z.string().max(50),
  imageLink: z.string().url(),
  price: z.number().positive(),
  stock: z.number().nonnegative(),
  category: z.enum(["electronics", "furniture", "books", "clothes"]),
  attributes: z.object({}).passthrough() , // Store as a JSON string
});



// Create Product and Associate with Seller
router.post('/create-products/:sellerId', authenticateJwt, async (req, res) => {
  const sellerId = req.params.sellerId;
  console.log(sellerId);
  console.log(req.body);

  const parsedInput = productProps.safeParse(req.body);
  if (!parsedInput.success) {
      res.status(411).json({ message: parsedInput.error.issues[0].message });
      return;
  }

  const productId = uuidv4(); // Generate a unique product ID
  const { title, description, price, category, brand, stock, imageLink, attributes } = parsedInput.data;
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;

  // Serialize the attributes object to a JSON string
  const serializedAttributes = JSON.stringify(attributes);

  try {
      // Trigger the webhook to initialize/update the vector index first
      const webhookUrl = `${process.env.EMEBEDDINGS_GENERATING_SERVER}/webhook/initialize-vector-index`;
      const payload = { product_created: true, productId }; // Include productId if needed

      const response = await axios.post(webhookUrl, payload);
      console.log('Webhook response:', response.data);

      // If webhook is successful, proceed to create the product
      await session.run(
          `MERGE (p:Product {productId: $productId})
           ON CREATE SET p.title = $title,
                           p.description = $description,
                           p.price = $price,
                           p.category = $category,
                           p.brand = $brand,
                           p.stock = $stock,
                           p.imageLink = $imageLink,
                           p.attributes = $attributes,
                           p.createdAt = $createdAt,
                           p.updatedAt = $updatedAt,
                           p.isAvailable = ($stock > 0)
           ON MATCH SET p.updatedAt = $updatedAt,
                           p.isAvailable = ($stock > 0)
           RETURN p`,
          { productId, title, description, price, category, brand, stock, imageLink, attributes: serializedAttributes, createdAt, updatedAt }
      );

      // Associate the Product with the Seller and update the Seller's products list
      await session.run(
          `MATCH (s:Seller {sellerId: $sellerId})
           MERGE (p:Product {productId: $productId})
           MERGE (s)-[:SELLS]->(p)
           SET s.products = COALESCE(s.products, []) + [$productId]
           RETURN s`,
          { sellerId, productId }
      );

      res.status(200).json({ message: "Product created and associated successfully" });
  } catch (error) {
      console.error('Error creating and associating product:', error);
      
      // If the webhook failed, respond accordingly
      if (error.response && error.response.status === 502) {
          res.status(502).json({ message: "Failed to trigger webhook, product not created." });
      } else {
          res.status(500).json({ message: "Internal server error" });
      }
  }
});




// ---------Get products of a particular seller-----------------
router.get("/get-products/:sellerId", authenticateJwt, async (req, res) => {
  const sellerId = req.params.sellerId;
  
  try {
    const result = await session.run(
      `MATCH (s:Seller {sellerId: $sellerId})-[:SELLS]->(p:Product)
       RETURN p`,
      { sellerId }
    );

    // Extract properties from the result
    const products = result.records.map(record => {
      const product = record.get('p').properties;

      // Deserialize the 'attributes' field if it's a JSON string
      if (product.attributes && typeof product.attributes === 'string') {
        try {
          product.attributes = JSON.parse(product.attributes);
        } catch (error) {
          console.error('Error parsing attributes JSON:', error);
          product.attributes = {}; // Fallback to an empty object if parsing fails
        }
      }

      return product;
    });

    // Send the response
    res.json({ products });

  } catch (error) {
    console.error('Error retrieving products:', error);
    res.status(500).json({ message: "Internal server error" });
  }
});



// -------------Get a specific product----------------
router.get("/products/:productId/:sellerId", authenticateJwt, async (req, res) => {
  try {
    const result = await session.run(
      `MATCH (p:Product {productId: $productId}) RETURN p`,
      { productId: req.params.productId}
    );
    if (result.records.length > 0) {
      res.json({ product: result.records[0].get('p').properties });
    } else {
      res.status(404).json({ message: "Product not found" });
    }
  } catch (error) {
    console.error('Error retrieving product:', error);
    res.status(500).json({ message: "Internal server error" });
  }
});



// ----------THESE ARE NOT YET FIXED----------
// -------Update a specific product-------------
router.put("/products/:productId", authenticateJwt, async (req, res) => {
  const parsedInput = productProps.safeParse(req.body);
  if (!parsedInput.success) {
    res.status(411).json({ message: parsedInput.error.issues[0].message });
    return;
  }
  const { name, description, price, category, brand, stock, images, attributes } = parsedInput.data;
  try {
    const result = await session.run(
      `MATCH (p:Product {productId: $productId})
       SET p.name = $name,
           p.description = $description,
           p.price = $price,
           p.category = $category,
           p.brand = $brand,
           p.stock = $stock,
           p.images = $images,
           p.attributes = $attributes,
           p.updatedAt = $updatedAt
       RETURN p`,
      { productId: req.params.productId, name, description, price, category, brand, stock, images, attributes, updatedAt: new Date().toISOString() }
    );
    if (result.records.length > 0) {
      res.json({ message: "Product updated successfully" });
    } else {
      res.status(404).json({ message: "Product not found" });
    }
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ---------Delete a specific product
router.delete("/products/:productId", authenticateJwt, async (req, res) => {
  try {
    const result = await session.run(
      `MATCH (p:Product {productId: $productId})
       DELETE p`,
      { productId: req.params.productId }
    );
    if (result.summary.counters.updates().nodesDeleted > 0) {
      res.json({ message: "Product deleted successfully" });
    } else {
      res.status(404).json({ message: "Product not found" });
    }
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
