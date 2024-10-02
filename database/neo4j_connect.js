var neo4j = require('neo4j-driver');
// this driver is enough for database transactions wherner using this driver will start interacting routes

const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);
const connection_status=async () => {
  
//   this func is not a must it is just called in server for verifying conncetion
  try {
   
    const serverInfo = await driver.getServerInfo()
    console.log('Connection established')
    console.log(serverInfo)
  } catch(err) {
    console.log(`Connection error\n${err}\nCause: ${err.cause}`)
  }
};

module.exports={
 connection_status,driver
}