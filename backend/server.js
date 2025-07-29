require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qs = require('qs');
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
  paymentMethod: String, // 'stripe' or 'westcoast'
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

// Stripe payment endpoint
app.post('/api/pay/stripe', async (req, res) => {
  try {
    const {
      token,
      amount,
      firstname,
      lastname,
      email
    } = req.body;

    // Convert amount to cents (Stripe uses smallest currency unit)
    const amountInCents = Math.round(amount * 100);

    // Create charge with Stripe
    const charge = await stripe.charges.create({
      amount: amountInCents,
      currency: 'usd',
      source: token,
      description: `Payment for ${firstname} ${lastname} (${email})`
    });

    // Save to database
    const payment = new Payment({
      firstName: firstname,
      lastName: lastname,
      email,
      amount,
      cardType: charge.payment_method_details?.card?.brand || 'Unknown',
      lastFour: charge.payment_method_details?.card?.last4 || '****',
      transactionId: charge.id,
      status: charge.status,
      responseText: 'Stripe payment processed',
      paymentMethod: 'stripe'
    });

    await payment.save();

    res.status(200).json({ 
      success: true, 
      data: charge 
    });
  } catch (err) {
    console.error('Stripe payment error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Stripe payment processing failed'
    });
  }
});

// West Coast payment endpoint
app.post('/api/pay/westcoast', async (req, res) => {
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
      process.env.NMI_API_URL,
      postData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    // Parse response
    const parsed = {};
    response.data.split('&').forEach((pair) => {
      const [key, ...rest] = pair.split('=');
      parsed[key] = decodeURIComponent(rest.join('='));
    });

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
      responseText: parsed.responsetext,
      paymentMethod: 'westcoast'
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
    console.error('West Coast payment error:', err.response?.data || err.message);
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