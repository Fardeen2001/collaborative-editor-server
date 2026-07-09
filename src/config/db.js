const mongoose = require('mongoose');
const { config } = require('./index');

async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongo.uri, {
    dbName: config.mongo.dbName,
  });
  console.log(`MongoDB connected (${config.mongo.dbName})`);
}

module.exports = { connectDB };
