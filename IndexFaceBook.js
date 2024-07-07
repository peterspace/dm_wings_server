const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000;

app.use(express.json());

const pixelId = 'YOUR_PIXEL_ID'; // Replace with your actual Pixel ID
const accessToken = 'YOUR_ACCESS_TOKEN'; // Replace with your actual access token

// Endpoint to receive purchase information from an external website
app.post('/receive_purchase_info', (req, res) => {
  const purchaseData = req.body;

  // Save the purchase data to use later
  app.locals.purchaseData = purchaseData;

  res.status(200).json({ message: 'Purchase information received' });
});

// Endpoint to get purchase information
app.get('/get_purchase_info', (req, res) => {
  const purchaseData = app.locals.purchaseData;
  if (purchaseData) {
    res.status(200).json(purchaseData);
  } else {
    res.status(404).json({ message: 'No purchase information available' });
  }
});

// Endpoint to create Facebook purchase event
app.post('/create_facebook_purchase_event', async (req, res) => {
  const purchaseData = req.body;
  const { fbclid, sub_id_10, external_id, date, client_ip_address, client_user_agent, email, phone, first_name, last_name, city, state, zip_code, country } = purchaseData;

  const ip = req.headers["cf-connecting-ip"] || req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
  const unixTimeNow = Math.floor(Date.now() / 1000);

  const payload = {
    data: [
      {
        event_name: 'Purchase',
        event_time: date || unixTimeNow,
        action_source: 'website',
        event_source_url: 'https://yourwebsite.com/app',
        user_data: {
          client_ip_address: client_ip_address || ip,
          client_user_agent: client_user_agent || req.headers['user-agent'],
          fbc: fbclid ? `fb.1.${date || unixTimeNow}.${fbclid}` : null,
          fbp: `fb.1.${date || unixTimeNow}.${external_id || 'default_external_id'}`,
          em: email ? hashData(email) : null,
          ph: phone ? hashData(phone) : null,
          fn: first_name ? hashData(first_name) : null,
          ln: last_name ? hashData(last_name) : null,
          ct: city ? hashData(city) : null,
          st: state ? hashData(state) : null,
          zp: zip_code ? hashData(zip_code) : null,
          country: country ? hashData(country) : null,
        },
        custom_data: {
          currency: 'USD',
          value: purchaseData.value,
          external_id: external_id || 'user123',
          sub_id_10: sub_id_10 || 'default_sub_id_10',
        },
      },
    ],
    access_token: accessToken,
  };

  const url = `https://graph.facebook.com/v10.0/${pixelId}/events`;

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.data) {
      const result = response.data;
      console.log({ FB_purchase_event_result: result });
      res.json({ success: true, result });
    }
  } catch (error) {
    console.log({ FB_purchase_event_error: error });
    if (error.response) {
      console.error("Error response data:", error.response.data);
      console.error("Error response status:", error.response.status);
      console.error("Error response headers:", error.response.headers);
      res.status(error.response.status).json(error.response.data);
    } else if (error.request) {
      console.error("Error request data:", error.request);
      res.status(500).json({ message: 'No response received from Facebook' });
    } else {
      console.error("Error message:", error.message);
      res.status(500).json({ message: error.message });
    }
  }
});

function hashData(data) {
  // Implement a hashing function, such as SHA-256
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(data).digest('hex');
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`);
});
