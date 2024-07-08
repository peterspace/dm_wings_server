const dotenv = require("dotenv").config();
const https = require("https"); // new
const path = require("path");
const puppeteer = require("puppeteer");
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const { errorHandler } = require("./middleware/errorMiddleware.js");
const User = require("./models/User.js");

const app = express();
// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static("public"));
// app.use(cors());

app.use(
  cors({
    origin: [
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5000",
      "http://127.0.0.1:5000",
      "exp://192.168.1.49:8081",
      "192.168.1.49:8081",
      process.env.FRONTEND_URL,
      process.env.BACKEND_URL,
      "*",
    ],
    credentials: true,
  })
);

// Error Middleware
app.use(errorHandler);

// Middleware to extract the IP address
app.use((req, res, next) => {
  const clientIp =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    "";

  req.clientIp = clientIp;

  next();
});

// -momery unleaked---------
app.set("trust proxy", 1);

const PORT = process.env.PORT || 5000;
const backend = process.env.BACKEND_URL;
const app_id = process.env.FACEBOOK_APP_ID;
const app_access_token = process.env.FACEBOOK_ACCESS_TOKEN;

//Step1: initial path
const keitaroFirstCampaign = process.env.KEITAROFIRSTCAMPAIGN;
const activeGame = process.env.ACTIVEGAMELINK;
const googleLink = process.env.GOOGLELINK;
// Connect to DB and start server

//==============================={Testing puppeteer}================================================

// Endpoint to serve the test HTML page
app.get("/test", (req, res) => {
  res.sendFile(path.join(__dirname, "./public/test.html"));
});

app.get("/check_test", (req, res) => {
  testHTMLLoading();
});

async function testHTMLLoading() {
  // const browser = await puppeteer.launch({
  //   headless: true,
  //   args: ['--no-sandbox', '--disable-setuid-sandbox']
  // });
  const browser = await puppeteer.launch();

  const page = await browser.newPage();

  // Navigate to the test page
  await page.goto(`${backend}/test`);

  // Take a screenshot for verification
  await page.screenshot({ path: "test_page.png" });

  // Get the page content
  const content = await page.content();

  // Close the browser
  await browser.close();

  console.log("Page content:", content);
}

//==============================={facebook SDK}================================================

// Endpoint to serve the Facebook SDK HTML page
app.get("/facebook-sdk", (req, res) => {
  res.sendFile(path.join(__dirname, "./public/facebook-sdk.html"));
});

// Function to check if Facebook SDK is loaded
async function checkFacebookSDK() {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(`${backend}/facebook-sdk`);

    // Wait for the Facebook SDK to be initialized
    const sdkLoaded = await page.waitForFunction(
      () => {
        return window.FB && window.FB.AppEvents;
      },
      { timeout: 30000 }
    );

    console.log("Facebook SDK loaded:", sdkLoaded);

    await browser.close();
    return sdkLoaded ? true : false;
  } catch (error) {
    console.error("Error checking Facebook SDK:", error);
    return false;
  }
}

//http://localhost:4000/create_facebook_purchase_event?fbclid=123&value=25
// Function to create Facebook event using Puppeteer
async function createFacebookEvent1(eventType, eventData, req) {
  const {
    fbclid,
    external_id,
    date,
    client_ip_address,
    client_user_agent,
    value,
    currency,
  } = eventData;

  const ip =
    client_ip_address ||
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    "";
  const unixTimeNow = Math.floor(Date.now() / 1000);

  const payload = {
    event_name: eventType,
    event_time: date || unixTimeNow,
    user_data: {
      client_ip_address: ip,
      client_user_agent: client_user_agent || req.headers["user-agent"],
      fbc: fbclid ? `fb.1.${date || unixTimeNow}.${fbclid}` : null,
      fbp: `fb.1.${date || unixTimeNow}.${external_id || "user123"}`,
    },
    custom_data: {
      currency: currency ? currency : "USD",
      value: value ? value : 20,
      external_id: external_id ? external_id.toString() : "user123",
    },
  };

  console.log({ payload });

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(`${backend}/facebook-sdk`);

    console.log("initializing FB SDK");

    // Wait for the Facebook SDK to be initialized
    await page.waitForFunction(() => window.FB && window.FB.AppEvents, {
      timeout: 30000,
    });

    await page.evaluate(
      (eventType, payload) => {
        FB.AppEvents.logEvent(eventType, payload.custom_data.value, {
          ...payload.custom_data,
          ...payload.user_data,
        });
      },
      eventType,
      payload
    );

    console.log({
      success: true,
      message: `${eventType} event logged successfully`,
    });

    await browser.close();

    // const result = await page.evaluate(
    //   (eventType, payload) => {
    //     return new Promise((resolve, reject) => {
    //       try {
    //         FB.AppEvents.logEvent(eventType, payload.custom_data.value, {
    //           ...payload.custom_data,
    //           ...payload.user_data,
    //         });
    //         resolve({
    //           success: true,
    //           message: `${eventType} event logged successfully`,
    //         });
    //       } catch (error) {
    //         reject({ success: false, message: error.message });
    //       }
    //     });
    //   },
    //   eventType,
    //   payload
    // );

    // console.log({result});

    // await browser.close();
    // return result;
  } catch (error) {
    console.error("Error:", error);
  }
}

// Function to create Facebook event using Puppeteer with retry mechanism
async function createFacebookEvent(eventType, eventData, req) {
  const {
    fbclid,
    external_id,
    date,
    client_ip_address,
    client_user_agent,
    value,
    currency,
  } = eventData;

  const ip =
    client_ip_address ||
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    "";
  const unixTimeNow = Math.floor(Date.now() / 1000);

  const payload = {
    event_name: eventType,
    event_time: date || unixTimeNow,
    user_data: {
      client_ip_address: ip,
      client_user_agent: client_user_agent || req.headers["user-agent"],
      fbc: fbclid ? `fb.1.${date || unixTimeNow}.${fbclid}` : null,
      fbp: `fb.1.${date || unixTimeNow}.${external_id || "user123"}`,
    },
    custom_data: {
      currency: currency ? currency : "USD",
      value: value ? value : 20,
      external_id: external_id ? external_id.toString() : "user123",
    },
  };

  console.log({ payload });
  const browser = await puppeteer.launch();

  const page = await browser.newPage();

  async function logEventWithRetry(attempt = 1) {
    try {
      await page.goto(`${backend}/facebook-sdk`);
      console.log("initializing FB SDK");

      // Wait for the Facebook SDK to be initialized
      await page.waitForFunction(() => window.FB && window.FB.AppEvents, {
        timeout: 30000,
      });

      const result = await page.evaluate(
        async (eventType, payload) => {
          return new Promise((resolve) => {
            FB.AppEvents.logEvent(eventType, payload.custom_data.value, {
              ...payload.custom_data,
              ...payload.user_data,
            });
            resolve({
              success: true,
              message: `${eventType} event logged successfully`,
            });
          });
        },
        eventType,
        payload
      );

      console.log(result);
      await browser.close();
      return result;
    } catch (error) {
      if (attempt <= 3) {
        console.warn(`Attempt ${attempt} failed, retrying...`, error);
        return await logEventWithRetry(attempt + 1);
      } else {
        console.error("Error:", error);
        await browser.close();
        return { success: false, message: error.message };
      }
    }
  }

  return await logEventWithRetry();
}

// Endpoint to create Facebook purchase event
app.get("/create_facebook_purchase_event", async (req, res) => {
  await createFacebookEvent("Purchase", req.params, req);
  res.status(200).send("Purchase event processed");
});

// Endpoint to create Facebook lead event
app.get("/create_facebook_lead_event", async (req, res) => {
  await createFacebookEvent("Lead", req.params, req);
  res.status(200).send("Lead event processed");
});

// Endpoint to check if Facebook SDK is loaded
app.get("/check_facebook_sdk", async (req, res) => {
  const sdkLoaded = await checkFacebookSDK();
  console.log({ sdkLoaded });
  res.status(200).json({ sdkLoaded });
});
//==============================={Main calls}================================================
// Route to handle requests
// path: "http://localhost:4000/initialize_app"
//path; "https://dm-wings-server.onrender.com/initialize_app"
//retructure: https://dm-wings-server.onrender.com/initialize_app
//returns: "https://wingsofflimitsprivacy.xyz/WngsffLmtsBwfdxs"
// adding params: `https://wingsofflimitsprivacy.xyz/WngsffLmtsBwfdxs?sub_id_1=NPR`
//========{before app install}====================
// adding params: `https://dm-wings-server.onrender.com?sub_id_1=NPR`
//========{after app install}====================
// adding params: `https://dm-wings-server.onrender.com?advertiser_tracking_id=123`

//==========={Local host activities}================================================

//========{before app install}====================
// adding params: `http://localhost:4000?sub_id_1=NPR`
//========{after app install}====================
// adding params: `http://localhost:4000?advertiser_tracking_id=123`

//second campaign options: "https://wingsofflimitsprivacy.xyz/WngsffLmtsBwfdxs?fbclid={fbclid}&utm_campaign={{campaign.name}}&utm_source={{site_source_name}}&sub_id_1={sub1}&sub_id_2={sub2}&sub_id_3={sub3}&sub_id_4={sub4}&sub_id_5={sub5}&sub_id_6={sub6}&fbclid={fbclid}&pixel=714981180129689&token=EAAEcIRgo4MIBO7Gb3oGV6rbcjXOiZBhplvcAeWAXc6Xfn0xZAv02XEts1RyAcV7zEbY6mbYBqPgjUKY6PWhRrRf0YWHkzBToto5Q6rSJ4RqDWg8u84mKzhC28AeZBv1EXYGfCj1NZBTNPTH7ejqdUtCZA7ZCIgvZAZBuGqEpySTJOCgz6aIQawJfcsQBRGiuTiPh7AZDZD&domain=https://av-gameprivacypolicy.site/app&purchase_amount=10&app_id=271837082690554&access_token=EAAD3PADAIZCoBO4wRTyTrOGa74Q341dAStsOZATIKLKcJxWijXjjBGNrXDPg5gkgdRP5cAYBL30GJErnU0y4sQaCFvZB27Ofh898y6a87PEEOxRd1eIZAgzCrZBEhl8BZAz8ii76OwOT5FvvHqSlXJNmy2alIlrCsm9zDDRLPFPTvZBesQaZAXW5ZCwSh9ZBvsCDbO"
// Helper function to hash data
function hashData(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

//=================++++{keitaro endpoint }=================================================

const getKeitaroSecondLinkWithUser = async (
  req,
  url,
  advertiser_tracking_id,
  userData
) => {
  console.log({ url, advertiser_tracking_id });
  let link = "";

  const userExists = userData;

  try {
    // Forward the request to Server 2
    //========={start: execute later}=======================================
    console.log({ stage2: "calling keitaro campaign 1" });

    // Create an HTTPS agent that ignores SSL certificate errors
    const agent = new https.Agent({
      rejectUnauthorized: false,
    });

    const response = await axios.get(url, {
      headers: req.headers, // Forward original headers if needed
      httpsAgent: agent, // Use the agent that ignores SSL errors
    });

    if (response.data) {
      link = response.data;

      if (link.startsWith("http://") || link.startsWith("https://")) {
        console.log("The string starts with 'http' or 'https'.");
        link = link; // without params
        console.log({
          stage4: "sending keitaro campaign 2 link with params if available",
        });

        if (userExists && userExists.affiliateLink) {
          link = link + `${userExists?.affiliateLink}`; // adding affiliate link
        }
      } else {
        console.log({
          stage5: "return non https value but html for other countries",
        });
        link = activeGame;
      }
    }
  } catch (error) {
    const message =
      (error.response && error.response.data && error.response.data.message) ||
      error.message ||
      error.toString();
    console.log(message);
    console.log({
      stage6: "return error 404 for unsupported region",
    });
    link = googleLink;
    // return link;
  }

  console.log({ userLink: link });
  return link;
};

// const link1 =
//   "https://www.dmtgames.pro/?sub1=NPR&sub2=291735090&fbp=714981180129689&token=EAAEcIRgo4MIBO7Gb3oGV6rbcjXOiZBhplvcAeWAXc6Xfn0xZAv02XEts1RyAcV7zEbY6mbYBqPgjUKY6PWhRrRf0YWHkzBToto5Q6rSJ4RqDWg8u84mKzhC28AeZBv1EXYGfCj1NZBTNPTH7ejqdUtCZA7ZCIgvZAZBuGqEpySTJOCgz6aIQawJfcsQBRGiuTiPh7AZDZD";
// const link2 =
//   "https://www.dmtgames.pro/?sub1=NPR&fbp=714981180129689&token=EAAEcIRgo4MIBO7Gb3oGV6rbcjXOiZBhplvcAeWAXc6Xfn0xZAv02XEts1RyAcV7zEbY6mbYBqPgjUKY6PWhRrRf0YWHkzBToto5Q6rSJ4RqDWg8u84mKzhC28AeZBv1EXYGfCj1NZBTNPTH7ejqdUtCZA7ZCIgvZAZBuGqEpySTJOCgz6aIQawJfcsQBRGiuTiPh7AZDZD";
// const link3 =
//   "https://www.dmtgames.pro/?sub1=NPR&sub2=291735090&sub3=NPR&sub4=vidos1&sub5={{ad.id}}&sub6=method1&fbp=714981180129689&token=EAAEcIRgo4MIBO7Gb3oGV6rbcjXOiZBhplvcAeWAXc6Xfn0xZAv02XEts1RyAcV7zEbY6mbYBqPgjUKY6PWhRrRf0YWHkzBToto5Q6rSJ4RqDWg8u84mKzhC28AeZBv1EXYGfCj1NZBTNPTH7ejqdUtCZA7ZCIgvZAZBuGqEpySTJOCgz6aIQawJfcsQBRGiuTiPh7AZDZD";

// add advertiser_tracking_id to installed API call in unity app
app.get("/", async (req, res) => {
  console.log("calling host server");
  //======{request objects}====================================
  const ip = req.clientIp;
  const requestURL = req.originalUrl; // This will include query parameters, if any
  const { advertiser_tracking_id } = req.query;

  console.log({ userIPAddress: ip });
  console.log({ requestURL });
  console.log({ Query: req.query });

  //============{state variables}====================================

  let facebookLink = "";

  //============{data iterations}====================================
  // Check if user email already exists
  const userExists = await User.findOne({ ipAddress: ip });
  const userTrackingIdExists = await User.findOne({
    advertiserTrackingId: advertiser_tracking_id,
  });

  //Activate App: fb_mobile_activate_app
  // await checkFacebookAppActicationEvent();

  //==================={New User}========================

  /**
   * register user
   * redirect user to app store to install app
   *
   */
  if (!userExists) {
    console.log("new user");
    const newUser = await User.create({
      ipAddress: ip,
      // userLink: updatedLink,
      affiliateLink: requestURL ? requestURL : `/?sub_id_1=organic`, // if there is no request url, then the user is an organic user
    });

    if (newUser) {
      console.log({ "New user created": newUser });
      const appStoreLink = process.env.APP_STORE_LINK;
      console.log("app install in progress");
      return res.redirect(appStoreLink);
    }
  }

  if (
    advertiser_tracking_id &&
    userTrackingIdExists &&
    advertiser_tracking_id != userExists?.advertiserTrackingId
  ) {
    console.log("new user");

    const newUser = await User.create({
      ipAddress: ip,
      // userLink: updatedLink,
      affiliateLink: requestURL ? requestURL : `/?sub_id_1=organic`, // if there is no request url, then the user is an organic user
      advertiserTrackingId: advertiser_tracking_id,
    });

    if (newUser) {
      console.log({
        "New user created with same ip but new advertiserId": newUser,
      });
      const appStoreLink = process.env.APP_STORE_LINK;
      console.log("app install in progress");
      return res.redirect(appStoreLink);
    }
  }

  if (advertiser_tracking_id && !userExists.advertiserTrackingId) {
    userExists.advertiserTrackingId =
      advertiser_tracking_id || userExists.advertiserTrackingId;

    const updatedUser = await userExists.save();

    if (updatedUser) {
      console.log({ "User updated": updatedUser });
      let updated_advertiser_tracking_id = advertiser_tracking_id
        ? advertiser_tracking_id
        : "";
      const userData = updatedUser;
      facebookLink = await getKeitaroSecondLinkWithUser(
        req,
        keitaroFirstCampaign,
        updated_advertiser_tracking_id,
        userData
      );
    }
  } else if (userTrackingIdExists) {
    console.log("user exists");
    let updated_advertiser_tracking_id = advertiser_tracking_id
      ? advertiser_tracking_id
      : "";

    const userData = userTrackingIdExists;
    facebookLink = await getKeitaroSecondLinkWithUser(
      req,
      keitaroFirstCampaign,
      updated_advertiser_tracking_id,
      userData
    );
    console.log("app launch successful");
    console.log({ marketerLink: facebookLink });
  } else {
    console.log("user exists");
    let updated_advertiser_tracking_id = advertiser_tracking_id
      ? advertiser_tracking_id
      : "";
    const userData = userExists;
    facebookLink = await getKeitaroSecondLinkWithUser(
      req,
      keitaroFirstCampaign,
      updated_advertiser_tracking_id,
      userData
    );

    console.log("app launch successful");
    console.log({ marketerLink: facebookLink });
  }

  console.log("sending link");
  newLink = facebookLink;

  console.log({ redirectLink: newLink });

  res.json(newLink);
});

async function checkFacebookAppActicationEvent() {
  const url = `https://graph.facebook.com/${app_id}/activities?access_token=${app_access_token}`;

  const payload = {
    event: "CUSTOM_APP_EVENTS",
    advertiser_tracking_enabled: 1,
    application_tracking_enabled: 1,
    custom_events: [{ _eventName: "fb_mobile_activate_app" }],
    skadnetwork_attribution: {
      version: "2.2",
      source_app_id: app_id,
      conversion_value: 0, // Значение для установки приложения
    },
    user_data: { anon_id: "UNIQUE_USER_ID" },
  };

  const headers = {
    "Content-Type": "application/json",
  };

  try {
    const response = await axios.post(url, payload, { headers: headers });

    if (response.data) {
      let result = response.data;

      console.log({ result });
      //{ result: { success: true } }
    }
    //====={New update}========================
  } catch (error) {
    // const err = error.response.data;
    console.log(error);
    console.error(error);
    // return { status: err.success, message: err.message };
    // res.json(err);
  }
}

//set marketers link inside app

// office

//AASA file path//https://www.dmtgames.pro/.well-known/apple-app-site-association
//associated domain: applinks:www.dmtgames.pro
//Step2: automtically by apple
// automatic download link for AASA file done by apple from the associated domain list created in xcode only after the app has been installed on the device
app.get("/.well-known/apple-app-site-association", (req, res) => {
  // Serve the AASA file
  // default part if no query params
  // Set the appropriate Content-Type header
  res.setHeader("Content-Type", "application/json");
  res.sendFile(__dirname + "/apple-app-site-association.json");
});

//step3: on app launch
// call this on initializing app to fetch back the original link that is needed for tracking user
// because in the associated domain, we may not have th full path, but only the root domain https://www.dmtgames.pro

app.get("/track_app_installs", async (req, res) => {
  const ip =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    "";
  const { advertiser_tracking_id } = req.query;

  if (advertiser_tracking_id) {
    console.log({ advertiser_tracking_id });
  }

  const userExists = await User.findOne({ ipAddress: ip });

  //save advertiser_tracking_id to user database on first app launch
  if (userExists && !userExists.advertiserTrackingId) {
    userExists.advertiserTrackingId =
      advertiser_tracking_id || userExists.advertiserTrackingId;

    const updatedUser = await userExists.save();

    if (updatedUser) {
      console.log({ "User updated": updatedUser });
    }
  }
  console.log("checking installs");
  await createFacebookAppInstallEvent();
});

// fetch all users
app.get("/all_users", async (req, res) => {
  const allUsers = await User.find();

  if (allUsers) {
    console.log({ allUsers });
    res.status(200).json(allUsers);
  }
});

//=================={temporary usage}======================
app.get("/installed", async (req, res) => {
  const ip =
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    "";

  const userExists = await User.findOne({ ipAddress: ip });

  // if only advertiser tracking id exists
  if (userExists) {
    console.log("only ip exists");
    const facebookLink = userExists.userLink;
    console.log({ installedLink: facebookLink });
    // res.redirect(newLink);
    res.json(facebookLink);
  }
});

async function createFacebookAppInstallEvent() {
  //Install: fb_mobile_install

  const url = `https://graph.facebook.com/${app_id}/activities?access_token=${app_access_token}`;

  const payload = {
    event: "CUSTOM_APP_EVENTS",
    advertiser_tracking_enabled: 1,
    application_tracking_enabled: 1,
    custom_events: [
      {
        _eventName: "fb_mobile_install",
      },
    ],
    skadnetwork_attribution: {
      version: "2.2",
      source_app_id: app_id,
      conversion_value: 0, // Значение для установки приложения
    },
    user_data: {
      anon_id: "UNIQUE_USER_ID",
    },
  };

  const headers = {
    "Content-Type": "application/json",
  };

  try {
    const response = await axios.post(url, payload, { headers: headers });

    if (response.data) {
      let result = response.data;

      console.log({ result });
      //{ result: { success: true } }
    }
    //====={New update}========================
  } catch (error) {
    // const err = error.response.data;
    console.log(error);
    console.error(error);
    // return { status: err.success, message: err.message };
    // res.json(err);
  }
}

//fbp and token
//token

//keitaro postback
//  "https://www.wingsofflimits.pro/create_facebook_purchase_event?fbclid={fbclid}&sub_id_10={_sub_id_10}&external_id={subid}&date={date:U}&client_ip_address={_ip}";
//  "http://localhost:4000/create_facebook_purchase_event?fbclid={fbclid}&sub_id_10={_sub_id_10}&external_id={subid}&date={date:U}&client_ip_address={_ip}";
//  "http://localhost:4000/create_facebook_purchase_event?fbclid=user123&sub_id_10=abcdefg&external_id=user123&date={date:U}&client_ip_address={_ip}";

/**
 * 
 //keitaro postback without date and client_ip_address
//  "https://www.wingsofflimits.pro/create_facebook_purchase_event?fbclid={fbclid}&sub_id_10={_sub_id_10}&external_id={subid}&client_ip_address={_ip}";
//  "http://localhost:4000/create_facebook_purchase_event?fbclid={fbclid}&sub_id_10={_sub_id_10}&external_id={subid}&client_ip_address={_ip}";
//  "http://localhost:4000/create_facebook_purchase_event?fbclid=user123&sub_id_10=abcdefg&external_id=user123&client_ip_address={_ip}";
//https://www.wingsofflimits.pro/create_facebook_purchase_event?fbclid=user123&sub_id_10=abcdefg&external_id=user123
 */

//https://www.wingsofflimits.pro/create_facebook_purchase_event?fbclid={subid}&external_id={subid}&campaign_name={campaign_name}&campaign_id={campaign_id}&=true&visitor_code={visitor_code}&user_agent={user_agent}&ip={ip}&offer_id={offer_id}&os={os}&region={region}&city={city}&source={source}
//http://localhost:4000/create_facebook_purchase_event?fbclid=user123&sub_id_10=abcdefg&external_id=user123
//

const server = app.listen(PORT, () => {
  console.log(`Server Running on port ${PORT}`);
});

mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    server;
  })
  .catch((err) => console.log(err));
