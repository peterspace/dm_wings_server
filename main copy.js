const dotenv = require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const crypto = require("crypto");
const path = require("path");
const { errorHandler } = require("./middleware/errorMiddleware.js");
const User = require("./models/User.js");
const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());

// app.use(express.json());
app.use(
  cors({
    origin: [
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5000",
      "http://127.0.0.1:5000",
      process.env.FRONTEND_URL,
      process.env.BACKEND_URL,
      "*",
    ],
    credentials: true,
  })
);

// -momery unleaked---------
app.set("trust proxy", 1);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const backend = process.env.BACKEND_URL;

//=============={Facebook Pixel Info}==========================
const pixelId = "YOUR_PIXEL_ID"; // Replace with your actual Pixel ID
const accessToken = "YOUR_ACCESS_TOKEN"; // Replace with your actual access token

//================{Facebook App Info}===================================
const app_id = process.env.FACEBOOK_APP_ID;
const app_access_token = process.env.FACEBOOK_ACCESS_TOKEN;
//=======================================================================

// Helper function to hash data
function hashData(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}


// Endpoint to receive purchase information from an external website using get request
app.get("/receive_purchase_info", (req, res) => {
  const purchaseData = req.query; // using query strings
  console.log({ leadData });
  app.locals.purchaseData = purchaseData;
  res.status(200).json({ message: "Purchase information received" });
});

// Endpoint to receive purchase information from an external website
app.post("/receive_purchase_info", (req, res) => {
  const purchaseData = req.body;
  app.locals.purchaseData = purchaseData;
  res.status(200).json({ message: "Purchase information received" });
});

// Endpoint to receive lead information from an external website using get request
app.get("/receive_lead_info", (req, res) => {
  const leadData = req.query; // using query strings
  console.log({ leadData });
  app.locals.leadData = leadData;
  res.status(200).json({ message: "Lead information received" });
});

// Endpoint to receive lead information from an external website
app.post("/receive_lead_info", (req, res) => {
  const leadData = req.body;
  app.locals.leadData = leadData;
  res.status(200).json({ message: "Lead information received" });
});

// Endpoint to get purchase information
app.get("/get_purchase_info", (req, res) => {
  const purchaseData = app.locals.purchaseData;
  if (purchaseData) {
    res.status(200).json(purchaseData);
  } else {
    res.status(404).json({ message: "No purchase information available" });
  }
});

// Endpoint to get lead information
app.get("/get_lead_info", (req, res) => {
  const leadData = app.locals.leadData;
  if (leadData) {
    res.status(200).json(leadData);
  } else {
    res.status(404).json({ message: "No lead information available" });
  }
});

// Function to create Facebook event
async function createFacebookEvent(eventType, eventData, res) {
  const {
    fbclid,
    external_id,
    date,
    client_ip_address,
    client_user_agent,
    email,
    phone,
    first_name,
    last_name,
    city,
    state,
    zip_code,
    country,
    value,
    currency,
    source,
  } = eventData;
  const ip =
    client_ip_address ||
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    "";
  const unixTimeNow = Math.floor(Date.now() / 1000);

  const min = 1;
  const max = 9999;
  let randomNumberFloat = Math.random() * (max - min) + min;

  const random = Math.round(randomNumberFloat);

  const payload = {
    data: [
      {
        event_name: eventType,
        event_time: date || unixTimeNow,
        action_source: "website",
        event_source_url: source || "https://av-gameprivacypolicy.site/app",
        user_data: {
          client_ip_address: client_ip_address || ip,
          client_user_agent: client_user_agent || req.headers["user-agent"],
          fbc: `fb.1.${date || unixTimeNow}.${fbclid ? fbclid : "abcdefg"}`,
          fbp: `fb.1.${date || unixTimeNow}.${random}`,
          fbclid: fbclid ? fbclid : null, // Include fbclid if available
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
          currency: currency || "USD",
          value: value || 0,
          external_id: external_id || "user123",
        },
      },
    ],
    access_token: accessToken,
  };

  const url = `https://graph.facebook.com/v10.0/${pixelId}/events`;

  try {
    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
    });

    if (response.data) {
      const result = response.data;
      console.log({ [`${eventType}_event_result`]: result });
      res.render("event", { eventType, eventData });
    }
  } catch (error) {
    console.log({ [`${eventType}_event_error`]: error });
    if (error.response) {
      console.error("Error response data:", error.response.data);
      console.error("Error response status:", error.response.status);
      console.error("Error response headers:", error.response.headers);
      res.status(error.response.status).json(error.response.data);
    } else if (error.request) {
      console.error("Error request data:", error.request);
      res.status(500).json({ message: "No response received from Facebook" });
    } else {
      console.error("Error message:", error.message);
      res.status(500).json({ message: error.message });
    }
  }
}

// Endpoint to create Facebook purchase event
app.post("/create_facebook_purchase_event", async (req, res) => {
  createFacebookEvent("Purchase", req.body, res);
});

// Endpoint to create Facebook lead event
app.post("/create_facebook_lead_event", async (req, res) => {
  createFacebookEvent("Lead", req.body, res);
});

// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}/`);
// });

// Error Middleware
app.use(errorHandler);
// Connect to DB and start server
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server Running on port ${PORT}`);
});

mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    server;
  })
  .catch((err) => console.log(err));
