require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qs = require('qs');
const mongoose = require('mongoose');

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/payments', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Payment Schema
const paymentSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  amount: Number,
  cardType: String,
  lastFour: String,
  transactionId: String,
  status: String,
  responseText: String,
  createdAt: { type: Date, default: Date.now }
});

const Payment = mongoose.model('Payment', paymentSchema);

// Detect card type
function detectCardType(cardNumber) {
  cardNumber = cardNumber.replace(/\D/g, '');
  
  const cardPatterns = {
    visa: /^4/,
    mastercard: /^5[1-5]|^2[2-7]/,
    amex: /^3[47]/,
    discover: /^6(?:011|5)/,
    diners: /^3(?:0[0-5]|[68])/,
    jcb: /^(?:2131|1800|35)/
  };

  for (const [type, pattern] of Object.entries(cardPatterns)) {
    if (pattern.test(cardNumber)) {
      return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }
  
  return 'Unknown';
}

// Payment endpoint
app.post('/api/pay', async (req, res) => {
  try {
    const {
      ccnumber,
      ccexp,
      cvv,
      amount,
      firstname,
      lastname,
      address1,
      city,
      state,
      zip,
      country,
      phone,
      email
    } = req.body;

    // Detect card type
    const cardType = detectCardType(ccnumber);
    const lastFour = ccnumber.slice(-4);

    const postData = qs.stringify({
      security_key: process.env.WESTCOAST_PRIVATE_KEY,
      type: 'sale',
      ccnumber: ccnumber.replace(/\s+/g, ''),
      ccexp,
      cvv,
      amount,
      firstname,
      lastname,
      address1,
      city,
      state,
      zip,
      country,
      phone,
      email
    });

    const response = await axios.post(
      'https://westcoast-processing.transactiongateway.com/api/transact.php',
      postData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // Parse response
    const parsed = {};
    response.data.split('&').forEach((pair) => {
      const [key, ...rest] = pair.split('=');
      parsed[key] = decodeURIComponent(rest.join('='));
    });

    // Add additional info
    parsed.card_type = cardType;
    parsed.ccnumber = lastFour;

    // Save to database
    const payment = new Payment({
      firstName: firstname,
      lastName: lastname,
      email,
      amount,
      cardType,
      lastFour,
      transactionId: parsed.transactionid,
      status: parsed.response === '1' ? 'approved' : 'declined',
      responseText: parsed.responsetext
    });

    await payment.save();

    // Return response
    if (parsed.response === '1') {
      res.status(200).json({ 
        success: true, 
        data: parsed 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: parsed.responsetext || 'Payment declined' 
      });
    }
  } catch (err) {
    console.error('Payment error:', err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data?.message || err.message || 'Payment processing failed'
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});