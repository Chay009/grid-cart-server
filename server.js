const express = require("express");
const cors = require("cors");




const neo4j_adminRouter = require("./routes/neo4j_admin");
const neo4j_userRouter = require("./routes/neo4j_user");
const deepgramAuthRouter = require("./routes/deepgramAuth");
const voiceRouter = require("./routes/deepgramVoice");

const getSellersRoute= require('./routes/getSellers')

var neo4j = require('neo4j-driver');
const {connection_status}=require('./database/neo4j_connect')
connection_status()

const app = express();




// Express middleware
app.use(express.json());
app.use(cors());

// Express routes
app.get("/", (req, res) => {
  res.send("Successfully connected to server.");
});
app.use("/getsellers",getSellersRoute)

app.use("/admin", neo4j_adminRouter);

app.use("/users", neo4j_userRouter);
app.use("/auth/deepgram", deepgramAuthRouter);


// Pass io instance to routes
app.use("/stream/voice",voiceRouter);  // Pass io to your route

const PORT = 2424;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
