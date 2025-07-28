const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const qs = require('qs');

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

    const postData = qs.stringify({
      security_key: process.env.WESTCOAST_PRIVATE_KEY,
      type: 'sale',
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
    });

    const response = await axios.post(
      'https://westcoast-processing.transactiongateway.com/api/transact.php',
      postData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const parsed = {};
    response.data.split('&').forEach((pair) => {
      const [key, ...rest] = pair.split('=');
      parsed[key] = decodeURIComponent(rest.join('='));
    });

    res.status(200).json({ success: true, data: parsed });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
});

app.listen(3000, () => {
  console.log('✅ Server running on http://localhost:3000');
});
